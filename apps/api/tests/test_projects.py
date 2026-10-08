import io

from app.core.config import settings
from fastapi.testclient import TestClient


def get_auth_headers(client: TestClient) -> dict[str, str]:
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_projects_and_counts(client: TestClient):
    headers = get_auth_headers(client)

    # Create test projects with different statuses
    p1 = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Test Production Project", "author": "Author A", "status": "in_production"},
        headers=headers,
    )
    assert p1.status_code == 201

    p2 = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Test Review Project", "author": "Author B", "status": "review"},
        headers=headers,
    )
    assert p2.status_code == 201

    resp = client.get(f"{settings.API_V1_STR}/projects", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "items" in data
    assert "counts" in data
    assert "meta" in data

    counts = data["counts"]
    assert counts["all"] >= 2
    assert counts["in_production"] >= 1
    assert counts["needs_review"] >= 1


def test_filter_and_search_projects(client: TestClient):
    headers = get_auth_headers(client)

    # Create unique searchable project
    unique_title = "Unique Searchable Novel X123"
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": unique_title, "author": "Special Author", "status": "in_production"},
        headers=headers,
    )
    assert create_resp.status_code == 201

    # Filter by in_production
    resp = client.get(f"{settings.API_V1_STR}/projects?status=in_production", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    assert len(items) >= 1
    for item in items:
        assert item["status"] == "in_production"

    # Search by title
    search_resp = client.get(f"{settings.API_V1_STR}/projects?search=Novel X123", headers=headers)
    assert search_resp.status_code == 200
    search_items = search_resp.json()["data"]["items"]
    assert len(search_items) >= 1
    assert unique_title in search_items[0]["title"]


def test_create_and_manage_project_flow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Upload manuscript file
    fake_doc = b"Sample manuscript content for test novel"
    upload_doc_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        headers=headers,
        files={
            "file": (
                "manuscript.docx",
                io.BytesIO(fake_doc),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload_doc_resp.status_code == 200
    doc_attachment = upload_doc_resp.json()["data"]

    # 2. Upload thumbnail file
    fake_img = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    upload_img_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        headers=headers,
        files={"file": ("cover.png", io.BytesIO(fake_img), "image/png")},
    )
    assert upload_img_resp.status_code == 200
    img_attachment = upload_img_resp.json()["data"]

    # 3. Create project
    create_payload = {
        "title": "A Test Symphony",
        "author": "Elena Rostova",
        "manuscript_attachment_id": doc_attachment["id"],
        "thumbnail_attachment_id": img_attachment["id"],
        "status": "in_production",
        "language": "English",
        "genre": "Historical Fiction",
        "isbn": "978-1-23456-789-0",
    }
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json=create_payload,
    )
    assert create_resp.status_code == 201
    created_proj = create_resp.json()["data"]
    project_id = created_proj["id"]
    assert created_proj["title"] == "A Test Symphony"
    assert created_proj["author"] == "Elena Rostova"
    assert created_proj["source"] == "DOCX"  # Inferred from filename
    assert created_proj["status"] == "in_production"
    assert created_proj["thumbnail_url"] is not None
    assert created_proj["manuscript_url"] is not None

    # 4. Get project by ID
    get_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["id"] == project_id

    # 5. Update project
    update_resp = client.put(
        f"{settings.API_V1_STR}/projects/{project_id}",
        headers=headers,
        json={"title": "A Test Symphony (Revised)", "status": "review"},
    )
    assert update_resp.status_code == 200
    updated_proj = update_resp.json()["data"]
    assert updated_proj["title"] == "A Test Symphony (Revised)"
    assert updated_proj["status"] == "review"
    assert updated_proj["status_label"] == "Review"

    # 6. Delete project
    del_resp = client.delete(
        f"{settings.API_V1_STR}/projects/{project_id}",
        headers=headers,
    )
    assert del_resp.status_code == 200

    # 7. Verify deletion
    verify_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}",
        headers=headers,
    )
    assert verify_resp.status_code == 404
