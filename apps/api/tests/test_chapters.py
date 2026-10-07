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


def test_parse_project_and_fetch_chapters(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project in ready_to_parse state
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "The Night Orchard Test",
            "author": "Mara Voss",
            "status": "ready_to_parse",
            "source": "DOCX",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 2. Trigger parse with 6 configuration options
    parse_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/parse",
        json={
            "remove_whitespace": True,
            "normalize_paragraphs": True,
            "separate_sentence_wise": True,
            "detect_chapter_headings": True,
            "preserve_italics": True,
            "fix_punctuation_spacing": True,
        },
        headers=headers,
    )
    assert parse_resp.status_code == 200
    parse_data = parse_resp.json()["data"]
    assert parse_data["project_id"] == project_id
    assert parse_data["total_chapters"] >= 5
    assert parse_data["total_words"] > 500
    assert parse_data["status"] == "in_production"

    # 3. Fetch chapter summaries list
    chapters_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
    )
    assert chapters_resp.status_code == 200
    chapters = chapters_resp.json()["data"]
    assert len(chapters) >= 5

    first_chap = chapters[0]
    assert "id" in first_chap
    assert first_chap["word_count"] > 0
    assert first_chap["estimated_duration_seconds"] > 0
    assert first_chap["status"] == "parsed"

    # 4. Fetch single chapter detail with script segments
    first_chap_id = first_chap["id"]
    detail_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{first_chap_id}",
        headers=headers,
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()["data"]
    assert detail["id"] == first_chap_id
    assert "segments" in detail
    assert len(detail["segments"]) > 0

    # Ensure segments identify dialogue vs narration
    segments = detail["segments"]
    assert any(not s["is_dialogue"] for s in segments)
