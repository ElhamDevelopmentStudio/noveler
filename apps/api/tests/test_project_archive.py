import io
import zipfile

import pytest
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.parse_job import ParseJobModel
from app.models.project import ProjectModel
from app.models.pronunciation import PronunciationRuleModel
from app.models.sfx import SFXModel
from app.models.tagging_job import TaggingJobModel
from app.models.voice import VoiceModel
from app.services.attachment import AttachmentService
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
        # Create dummy voice & SFX files locally
        v_key = "voices/test_voice_custom.wav"
        v_local = AttachmentService.get_local_file_path(v_key)
        v_local.parent.mkdir(parents=True, exist_ok=True)
        v_local.write_bytes(b"RIFFdummywavbytes_voice_data_for_export_test")

        s_key = "sfx/test_thunder_custom.mp3"
        s_local = AttachmentService.get_local_file_path(s_key)
        s_local.parent.mkdir(parents=True, exist_ok=True)
        s_local.write_bytes(b"ID3dummycustomsfxbytes_for_export_test")

        # Add voice
        voice = VoiceModel(
            user_id=user_id,
            project_id=source_proj_id,
            name="Lord Deculein Voice",
            gender="male",
            is_global=False,
            audio_storage_key=v_key,
        )
        db.add(voice)
        await db.flush()
        voice_id = voice.id

        # Update project settings with default voice
        source_proj = await db.get(ProjectModel, source_proj_id)
        if source_proj:
            source_proj.settings = {"default_male_voice_id": voice_id}

        # Add SFX model
        sfx = SFXModel(
            user_id=user_id,
            project_id=source_proj_id,
            name="Thunder Clap",
            category="foley",
            is_global=False,
            audio_storage_key=s_key,
            duration_seconds=3.5,
            default_volume=0.8,
            triggers=["thunder", "lightning"],
        )
        db.add(sfx)
        await db.flush()
        sfx_id = sfx.id

        # Add character
        char = CharacterModel(
            project_id=source_proj_id,
            name="Deculein",
            slug="deculein",
            gender="male",
            role_description="protagonist",
            assigned_voice_name="Lord Deculein Voice",
            assigned_voice_id=voice_id,
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
            atmosphere_id=sfx_id,
            atmosphere_name="Thunder Clap",
            sfx_cues=[
                {
                    "sfx_id": sfx_id,
                    "sfx_name": "Thunder Clap",
                    "action": "replace",
                    "target_text": "*crack*",
                    "audio_url": f"/api/v1/sfx/{sfx_id}/stream",
                }
            ],
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

        # Add historical parse and tagging job records
        parse_job = ParseJobModel(
            project_id=source_proj_id,
            job_type="parse",
            status="completed",
            total_chapters=2,
            processed_chapters=2,
            total_segments=3,
            processed_segments=3,
            progress_percent=100.0,
            current_step="Completed parsing",
        )
        db.add(parse_job)

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
        assert any(n.startswith("media/voices/") for n in names)
        assert any(n.startswith("media/sfx/") for n in names)

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
    assert preview_data["total_voices"] == 1
    assert preview_data["total_sfx"] == 1
    assert preview_data["total_foley_cues"] == 1

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

    # Verify project settings default voice was remapped
    assert imported_proj.get("settings") is not None
    assert imported_proj["settings"].get("default_male_voice_id") is not None

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

    # Verify SFX cues with replacement action and atmosphere preserved & remapped
    assert seg1_data["atmosphere_name"] == "Thunder Clap"
    assert seg1_data["atmosphere_id"] is not None
    assert len(seg1_data["sfx_cues"]) == 1
    cue0 = seg1_data["sfx_cues"][0]
    assert cue0["action"] == "replace"
    assert cue0["target_text"] == "*crack*"
    assert cue0["sfx_name"] == "Thunder Clap"
    assert cue0["sfx_id"] is not None

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
    assert char_list[0]["assigned_voice_name"] == "Lord Deculein Voice"
    assert char_list[0]["assigned_voice_id"] is not None
