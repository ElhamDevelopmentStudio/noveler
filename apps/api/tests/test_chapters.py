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

    # 1. Upload manuscript file
    manuscript_text = b"""Chapter 1
The cold came down from the ridge earlier than anyone remembered.
"You should not be out here without gloves, Mara," her sister June called from the porch.
"The frost reached the fourth row before noon."

Chapter 2
The orchard house had seven rooms, but only two stayed warm once November settled in.
"The gate latch is frozen again," Elias said, unbuttoning his heavy sheepskin coat.
"It has been frozen since Tuesday," Mara answered without looking up from the parchment.

Chapter 3
By morning, the rain had drawn a new map over the orchard.
"Is this the map from thirty-four?" Dr. Rowan Bell asked.
"It is the only map we have," Mara said softly.
"""

    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        files={"file": ("test_manuscript.txt", manuscript_text, "text/plain")},
        headers=headers,
    )
    assert upload_resp.status_code == 200
    attachment_id = upload_resp.json()["data"]["id"]

    # 2. Create a project in ready_to_parse state with manuscript attached
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Real Manuscript Test Project",
            "author": "Mara Voss",
            "status": "ready_to_parse",
            "source": "TXT",
            "manuscript_attachment_id": attachment_id,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 3. Trigger parse with 6 configuration options
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
    assert parse_data["total_chapters"] == 3
    assert parse_data["total_words"] > 50
    assert parse_data["status"] == "in_production"

    # 4. Fetch chapter summaries list
    chapters_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
    )
    assert chapters_resp.status_code == 200
    chapters = chapters_resp.json()["data"]
    assert len(chapters) == 3

    first_chap = chapters[0]
    assert "id" in first_chap
    assert first_chap["word_count"] > 0
    assert first_chap["estimated_duration_seconds"] > 0
    assert first_chap["status"] == "parsed"

    # 5. Fetch single chapter detail with script segments
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
    assert any(s["is_dialogue"] for s in segments)
    assert any(not s["is_dialogue"] for s in segments)
