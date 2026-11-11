import pytest
from starlette.testclient import TestClient
from app.core.config import settings
from app.models.chapter import ChapterModel
from app.models.project import ProjectModel
from app.models.user import UserModel
from app.services.gdrive_vault import GoogleDriveVaultService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Generate dummy 100-byte WAV header/content
DUMMY_AUDIO = b"RIFF" + (b"\x00" * 96)

@pytest.mark.asyncio
async def test_gdrive_vault_service_lifecycle():
    """Verify GoogleDriveVaultService creates folders, uploads, streams chunks, and cleans up."""
    if not GoogleDriveVaultService.is_available():
        pytest.skip("Google Drive vault not configured in environment")

    project_title = "PyTest Vault Test Project"

    # 1. Get or create project folder
    folder_id = await GoogleDriveVaultService.get_or_create_project_folder(project_title)
    assert folder_id is not None
    assert len(folder_id) > 5

    # 2. Upload dummy audio
    upload_res = await GoogleDriveVaultService.upload_chapter_audio(
        file_bytes=DUMMY_AUDIO,
        filename="Chapter_01_Test_Audio.wav",
        project_title=project_title,
        mime_type="audio/wav",
    )
    file_id = upload_res.get("id")
    assert file_id is not None

    try:
        # 3. Check metadata
        meta = await GoogleDriveVaultService.get_file_metadata(file_id)
        assert meta["id"] == file_id
        assert meta["size"] == len(DUMMY_AUDIO)

        # 4. Stream byte chunk (Range bytes=0-3 -> should be b"RIFF")
        chunk = await GoogleDriveVaultService.stream_file_chunk(file_id, 0, 3)
        assert chunk == b"RIFF"

        # 5. Full download
        full_bytes = await GoogleDriveVaultService.download_file_bytes(file_id)
        assert full_bytes == DUMMY_AUDIO

    finally:
        # Cleanup test file and test folder
        await GoogleDriveVaultService.delete_file(file_id)
        await GoogleDriveVaultService.delete_file(folder_id)


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


def test_gdrive_audio_streaming_proxy_endpoint(client: TestClient):
    """Verify GET /api/v1/projects/{pid}/chapters/{cid}/stream proxies byte-ranges from Google Drive."""
    if not GoogleDriveVaultService.is_available():
        pytest.skip("Google Drive vault not configured in environment")

    # Upload temporary probe file for the test
    import asyncio
    project_title = "PyTest Streaming Proxy Project"
    folder_id = asyncio.run(GoogleDriveVaultService.get_or_create_project_folder(project_title))
    upload_res = asyncio.run(
        GoogleDriveVaultService.upload_chapter_audio(
            file_bytes=DUMMY_AUDIO,
            filename="Chapter_01_Proxy_Test.wav",
            project_title=project_title,
            mime_type="audio/wav",
        )
    )
    file_id = upload_res["id"]

    try:
        headers = get_auth_headers(client)

        # Create project & chapter
        proj_resp = client.post(
            f"{settings.API_V1_STR}/projects",
            json={"title": "GDrive Proxy Project", "status": "in_production"},
            headers=headers,
        )
        assert proj_resp.status_code == 201
        p_id = proj_resp.json()["data"]["id"]

        ch_resp = client.post(
            f"{settings.API_V1_STR}/projects/{p_id}/chapters",
            json={"title": "Chapter 1: Vault Test"},
            headers=headers,
        )
        assert ch_resp.status_code == 201
        c_id = ch_resp.json()["data"]["id"]

        # Manually link gdrive_file_id on the chapter in DB
        from app.db.session import get_session_factory
        factory = get_session_factory()

        async def link_gdrive():
            async with factory() as session:
                ch = (await session.execute(select(ChapterModel).where(ChapterModel.id == c_id))).scalar_one()
                ch.gdrive_file_id = file_id
                ch.audio_url = f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/stream"
                await session.commit()

        asyncio.run(link_gdrive())

        # Test Range Request (bytes=0-3 -> "RIFF")
        range_resp = client.get(
            f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/stream",
            headers={**headers, "Range": "bytes=0-3"},
        )
        assert range_resp.status_code == 206
        assert range_resp.content == b"RIFF"
        assert "Content-Range" in range_resp.headers
        assert range_resp.headers["Content-Range"].startswith("bytes 0-3/")
        assert range_resp.headers["Accept-Ranges"] == "bytes"

        # Test chapter audio-stream info endpoint includes stream URL
        stream_info_resp = client.get(
            f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/audio-stream",
            headers=headers,
        )
        assert stream_info_resp.status_code == 200
        info_data = stream_info_resp.json()["data"]
        assert info_data["gdrive_file_id"] == file_id
        assert f"/projects/{p_id}/chapters/{c_id}/stream" in info_data["audio_url"]

    finally:
        asyncio.run(GoogleDriveVaultService.delete_file(file_id))
        asyncio.run(GoogleDriveVaultService.delete_file(folder_id))
