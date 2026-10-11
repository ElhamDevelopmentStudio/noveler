import io
import json
import zipfile

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


def test_get_raw_manuscript_content(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Test project without manuscript returns 400
    empty_proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Empty Project", "author": "Anonymous"},
        headers=headers,
    )
    assert empty_proj_resp.status_code == 201
    empty_project_id = empty_proj_resp.json()["data"]["id"]

    raw_empty_resp = client.get(
        f"{settings.API_V1_STR}/projects/{empty_project_id}/raw-content",
        headers=headers,
    )
    assert raw_empty_resp.status_code == 400

    # 2. Upload a text manuscript with multiple paragraphs
    para1 = "Paragraph 1: In the beginning of the great realm, all was calm.\n\n"
    para2 = "Paragraph 2: A sudden storm arose across the northern valley.\n\n"
    para3 = "Paragraph 3: The hero prepared the expedition into the unknown.\n\n"
    full_text = para1 + para2 + para3
    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        headers=headers,
        files={"file": ("story.txt", io.BytesIO(full_text.encode("utf-8")), "text/plain")},
    )
    assert upload_resp.status_code == 200
    manuscript_att = upload_resp.json()["data"]

    # 3. Create project with this manuscript
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Raw Reader Project",
            "author": "Story Teller",
            "manuscript_attachment_id": manuscript_att["id"],
        },
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # 4. Fetch first chunk with a limit smaller than the full text
    limit = len(para1) + 10  # Enough to cover para1 and partially para2
    chunk1_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/raw-content?offset=0&limit={limit}",
        headers=headers,
    )
    assert chunk1_resp.status_code == 200
    chunk1 = chunk1_resp.json()["data"]
    assert chunk1["project_id"] == project_id
    assert chunk1["total_characters"] == len(full_text)
    assert chunk1["has_more"] is True
    assert chunk1["next_offset"] is not None
    assert "Paragraph 1" in chunk1["content"]

    # 5. Fetch subsequent chunk using next_offset
    chunk2_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/raw-content?offset={chunk1['next_offset']}&limit=5000",
        headers=headers,
    )
    assert chunk2_resp.status_code == 200
    chunk2 = chunk2_resp.json()["data"]
    assert chunk2["has_more"] is False
    assert chunk2["next_offset"] is None
    assert "Paragraph 3" in chunk2["content"]

    # 6. Fetch beyond EOF
    eof_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/raw-content?offset={len(full_text)}&limit=1000",
        headers=headers,
    )
    assert eof_resp.status_code == 200
    eof_data = eof_resp.json()["data"]
    assert eof_data["content"] == ""
    assert eof_data["chunk_size"] == 0
    assert eof_data["has_more"] is False


def test_export_project_raw_archive(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Upload manuscript
    manuscript_text = (
        "Chapter 1: The Beginning\n\n"
        "Alice stepped into the room.\n\n"
        '"Hello world," said Alice.\n\n'
        "Chapter 2: The Journey\n\n"
        "Bob arrived shortly after.\n\n"
        '"Where are we heading?" asked Bob.\n'
    )
    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        headers=headers,
        files={"file": ("novel.txt", io.BytesIO(manuscript_text.encode("utf-8")), "text/plain")},
    )
    assert upload_resp.status_code == 200
    att = upload_resp.json()["data"]

    # 2. Create project
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "LLM Export Test Novel",
            "author": "Antigravity Author",
            "language": "en",
            "manuscript_attachment_id": att["id"],
        },
        headers=headers,
    )
    assert proj_resp.status_code == 201
    proj_id = proj_resp.json()["data"]["id"]

    # 3. Parse manuscript into chapters
    parse_resp = client.post(
        f"{settings.API_V1_STR}/projects/{proj_id}/parse",
        headers=headers,
        json={"strategy": "auto", "default_speaker": "Narrator"},
    )
    assert parse_resp.status_code == 200

    # 4. Request export archive
    export_resp = client.get(
        f"{settings.API_V1_STR}/projects/{proj_id}/export",
        headers=headers,
    )
    assert export_resp.status_code == 200
    assert "application/zip" in export_resp.headers.get("content-type", "")
    assert "attachment;" in export_resp.headers.get("content-disposition", "")
    assert "raw-export.zip" in export_resp.headers.get("content-disposition", "")

    # 5. Verify ZIP contents
    zf = zipfile.ZipFile(io.BytesIO(export_resp.content))
    namelist = zf.namelist()

    # Verify key manifesto & configuration files
    assert "README.md" in namelist
    readme = zf.read("README.md").decode("utf-8")
    assert "LLM Export Test Novel" in readme
    assert "Antigravity Author" in readme
    assert "Formatting & Delivery Conventions" in readme

    assert "project-metadata.json" in namelist
    meta = json.loads(zf.read("project-metadata.json").decode("utf-8"))
    assert meta["title"] == "LLM Export Test Novel"
    assert meta["author"] == "Antigravity Author"
    assert meta["total_chapters"] == 2

    assert "characters/dramatis-personae.md" in namelist
    assert "characters/characters.json" in namelist
    assert "pronunciation/rules.json" in namelist
    assert "pronunciation/glossary.md" in namelist

    assert "full-script/complete-script.md" in namelist
    assert "full-script/complete-script.jsonl" in namelist
    complete_md = zf.read("full-script/complete-script.md").decode("utf-8")
    assert "Complete Script: LLM Export Test Novel" in complete_md

    # Check chapter files
    assert any(name.startswith("chapters/chapter-") and name.endswith(".md") for name in namelist)
    assert any(name.startswith("chapters/chapter-") and name.endswith(".jsonl") for name in namelist)

    # Check source file attachment
    assert "source/novel.txt" in namelist
    assert zf.read("source/novel.txt") == manuscript_text.encode("utf-8")


