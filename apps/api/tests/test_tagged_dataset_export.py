import io
import json
import zipfile

import pytest
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
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
async def test_tagged_dataset_summary_and_export(client: TestClient):
    """Test getting tagged projects summary and exporting JSON/TXT dataset."""
    headers = get_auth_headers(client)

    # 1. Create a project with tagged chapters and script segments
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={
            "title": "Dataset Training Chronicles",
            "author": "FineTuner Master",
            "genre": "Fantasy",
            "language": "en",
        },
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    factory = get_session_factory()
    async with factory() as db:
        # Add character
        char = CharacterModel(
            project_id=project_id,
            name="Ed Rothstaylor",
            slug="ed-rothstaylor",
            gender="male",
            role_description="Protagonist",
            aliases=["Ed"],
            dialogue_count=10,
        )
        db.add(char)
        await db.flush()

        # Add a tagged chapter
        ch = ChapterModel(
            project_id=project_id,
            chapter_number=1,
            title="Prologue",
            order_index=1,
            word_count=500,
            status="tagged",
        )
        db.add(ch)
        await db.flush()

        # Add segments
        s1 = ScriptSegmentModel(
            chapter_id=ch.id,
            order_index=1,
            text="The sky was clear above the forest.",
            delivery_type="narration",
            is_dialogue=False,
            speaker="Narrator",
        )
        s2 = ScriptSegmentModel(
            chapter_id=ch.id,
            order_index=2,
            text="“Let us advance,” Ed whispered.",
            delivery_type="dialogue",
            is_dialogue=True,
            speaker="Ed Rothstaylor",
            speaker_gender="male",
            emotion="determined",
            raw_speaker_tag="Ed whispered",
            character_id=char.id,
        )
        db.add_all([s1, s2])
        await db.commit()

    # 2. Test Summary Endpoint
    summary_resp = client.get(
        f"{settings.API_V1_STR}/exports/tagged/summary",
        headers=headers,
    )
    assert summary_resp.status_code == 200
    summary_data = summary_resp.json()["data"]
    matched = next((p for p in summary_data if p["id"] == project_id), None)
    assert matched is not None
    assert matched["title"] == "Dataset Training Chronicles"
    assert matched["tagged_chapters_count"] >= 1
    assert matched["dialogue_segments_count"] >= 1

    # 3. Test JSON Export Download
    export_json_resp = client.post(
        f"{settings.API_V1_STR}/exports/tagged/download",
        headers=headers,
        json={"project_ids": [project_id], "format": "json"},
    )
    assert export_json_resp.status_code == 200
    assert export_json_resp.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(export_json_resp.content), "r") as zf:
        namelist = zf.namelist()
        assert "dataset_manifest.json" in namelist
        assert "fine_tuning_train.jsonl" in namelist
        # Verify manifest
        manifest = json.loads(zf.read("dataset_manifest.json").decode("utf-8"))
        assert manifest["total_chapters"] >= 1
        assert manifest["total_dialogue_lines"] >= 1

    # 4. Test TXT Export Download
    export_txt_resp = client.post(
        f"{settings.API_V1_STR}/exports/tagged/download",
        headers=headers,
        json={"project_ids": [project_id], "format": "txt"},
    )
    assert export_txt_resp.status_code == 200
    assert export_txt_resp.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(export_txt_resp.content), "r") as zf:
        namelist = zf.namelist()
        assert "dataset_manifest.txt" in namelist
        assert "all_tagged_dataset.txt" in namelist
        txt_content = zf.read("all_tagged_dataset.txt").decode("utf-8")
        assert "Ed Rothstaylor" in txt_content
        assert "“Let us advance,”" in txt_content

    # Cleanup
    client.delete(f"{settings.API_V1_STR}/projects/{project_id}", headers=headers)
