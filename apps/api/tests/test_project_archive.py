import io
import zipfile

import pytest
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.pronunciation import PronunciationRuleModel
from app.models.tagging_job import TaggingJobModel
from fastapi.testclient import TestClient


def get_auth_headers(client: TestClient) -> dict[str, str]:
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    token = login_resp.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_export_preview_and_import_project_archive(client: TestClient):
    """End-to-end test of project archive export, preview, and safe remapped import."""
    headers = get_auth_headers(client)

    # 1. Create a rich source project
    me_resp = client.get(f"{settings.API_V1_STR}/auth/me", headers=headers)
    user_id = me_resp.json()["data"]["id"]

    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={
            "title": "Archive Test Chronicles",
            "author": "Archivist Kim",
            "genre": "Fantasy",
            "language": "en",
        },
    )
    assert create_resp.status_code == 201
    source_proj_id = create_resp.json()["data"]["id"]

    factory = get_session_factory()
    async with factory() as db:
        # Add character
        char = CharacterModel(
            project_id=source_proj_id,
            name="Deculein",
            slug="deculein",
            gender="male",
            role_description="protagonist",
            assigned_voice_name="am_adam",
            aliases=["Professor", "Lord Deculein"],
            dialogue_count=12,
        )
        db.add(char)
        await db.flush()
        char_id = char.id

        # Add 2 chapters: Chapter 1 tagged, Chapter 2 untagged
        ch1 = ChapterModel(
            project_id=source_proj_id,
            chapter_number=1,
            title="Chapter 1: The Gathering",
            order_index=1,
            batch_number=1,
            word_count=45,
            status="tagged",
        )
        ch2 = ChapterModel(
            project_id=source_proj_id,
            chapter_number=2,
            title="Chapter 2: The Departure",
            order_index=2,
            batch_number=1,
            word_count=30,
            status="parsed",
        )
        db.add_all([ch1, ch2])
        await db.flush()

        # Add segments to Chapter 1
        seg1 = ScriptSegmentModel(
            chapter_id=ch1.id,
            order_index=1,
            text="“The gathering has begun,” Deculein observed.",
            delivery_type="dialogue",
            is_dialogue=True,
            speaker="Deculein",
            character_id=char_id,
        )
        seg2 = ScriptSegmentModel(
            chapter_id=ch1.id,
            order_index=2,
            text="[System: Mission Objective Updated]",
            delivery_type="system_prompt",
            speaker="System / Interface",
        )
        # Add segment to Chapter 2
        seg3 = ScriptSegmentModel(
            chapter_id=ch2.id,
            order_index=1,
            text="They packed their bags in silence.",
            delivery_type="narration",
            speaker="Narrator",
        )
        db.add_all([seg1, seg2, seg3])

        # Add pronunciation rule
        rule = PronunciationRuleModel(
            project_id=source_proj_id,
            phrase="Deculein",
            replacement="Deh-cue-lane",
            match_case=False,
            scope="entire_manuscript",
        )
        db.add(rule)

        # Add historical tagging job record
        tag_job = TaggingJobModel(
            project_id=source_proj_id,
            status="completed",
            total_chapters=2,
            processed_chapters=1,
            total_segments=3,
            processed_segments=2,
            progress_percent=100.0,
        )
        db.add(tag_job)
        await db.commit()

    # 2. Export project archive ZIP
    export_resp = client.get(
        f"{settings.API_V1_STR}/projects/{source_proj_id}/export-archive",
        headers=headers,
    )
    assert export_resp.status_code == 200
    assert export_resp.headers["content-type"] == "application/zip"
    zip_bytes = export_resp.content
    assert len(zip_bytes) > 200

    # Verify zip content structure
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        assert "manifest.json" in names
        assert "characters.json" in names
        assert "chapters.json" in names
        assert "rules.json" in names
        assert "history.json" in names

    # 3. Preview project archive
    preview_resp = client.post(
        f"{settings.API_V1_STR}/projects/preview-archive",
        headers=headers,
        files={"file": ("archive.zip", zip_bytes, "application/zip")},
    )
    assert preview_resp.status_code == 200
    preview_data = preview_resp.json()["data"]
    assert preview_data["title"] == "Archive Test Chronicles"
    assert preview_data["author"] == "Archivist Kim"
    assert preview_data["total_chapters"] == 2
    assert preview_data["tagged_chapters_count"] == 1
    assert preview_data["untagged_chapters_count"] == 1
    assert preview_data["total_characters"] == 1
    assert preview_data["total_segments"] == 3

    # 4. Import archive into a new project (e.g. clone / migration)
    import_resp = client.post(
        f"{settings.API_V1_STR}/projects/import-archive",
        headers=headers,
        files={"file": ("archive.zip", zip_bytes, "application/zip")},
        data={"override_title": "Restored Chronicles"},
    )
    assert import_resp.status_code == 201
    imported_proj = import_resp.json()["data"]
    new_proj_id = imported_proj["id"]

    # Verify ID difference (no collision)
    assert new_proj_id != source_proj_id
    assert imported_proj["title"] == "Restored Chronicles"

    # 5. Fetch imported project chapters and characters to verify remapping
    ch_list_resp = client.get(
        f"{settings.API_V1_STR}/projects/{new_proj_id}/chapters",
        headers=headers,
    )
    assert ch_list_resp.status_code == 200
    imported_chapters = ch_list_resp.json()["data"]
    assert len(imported_chapters) == 2
    assert imported_chapters[0]["status"] == "tagged"
    assert imported_chapters[1]["status"] == "parsed"

    # Verify chapter detail and segments
    new_ch1_id = imported_chapters[0]["id"]
    ch1_detail = client.get(
        f"{settings.API_V1_STR}/projects/{new_proj_id}/chapters/{new_ch1_id}",
        headers=headers,
    ).json()["data"]

    assert len(ch1_detail["segments"]) == 2
    seg1_data = ch1_detail["segments"][0]
    assert seg1_data["text"] == "“The gathering has begun,” Deculein observed."
    assert seg1_data["speaker"] == "Deculein"
    assert seg1_data["delivery_type"] == "dialogue"

    # Verify character remapping: segment.character_id points to the newly imported character
    chars_resp = client.get(
        f"{settings.API_V1_STR}/projects/{new_proj_id}/characters",
        headers=headers,
    )
    assert chars_resp.status_code == 200
    new_chars_data = chars_resp.json()["data"]
    char_list = new_chars_data.get("characters", new_chars_data) if isinstance(new_chars_data, dict) else new_chars_data
    assert len(char_list) == 1
    assert char_list[0]["name"] == "Deculein"
    assert char_list[0]["id"] != char_id  # Remapped to new UUID
    assert seg1_data["character_id"] == char_list[0]["id"]  # FK matches new character UUID!
