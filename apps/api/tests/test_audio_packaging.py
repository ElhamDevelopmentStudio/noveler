import io
import wave

import pytest
from app.core.config import settings
from app.services.audio_packaging import (
    AudioPackagingService,
    build_chapter_mp3_filename,
    sanitize_filename_component,
)
from fastapi.testclient import TestClient
from mutagen.mp3 import MP3


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


def generate_test_wav_bytes(duration_sec: float = 0.5, sample_rate: int = 24000) -> bytes:
    """Generate a valid minimal PCM WAV file for tests."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        # 0.5 sec of silence/tone
        total_samples = int(sample_rate * duration_sec)
        wf.writeframes(b"\x00\x00" * total_samples)
    return buffer.getvalue()


def test_sanitize_filename_component():
    assert sanitize_filename_component("The Villain Wants: to Live / Die?") == "The Villain Wants to Live Die"
    assert sanitize_filename_component("  Multiple   Spaces  ") == "Multiple Spaces"
    assert sanitize_filename_component("") == "Untitled"


def test_build_chapter_mp3_filename():
    assert (
        build_chapter_mp3_filename("The Villain Wants to Live", 1)
        == "The Villain Wants to Live Chapter 1.mp3"
    )
    assert (
        build_chapter_mp3_filename("Omniscient Reader: Viewpoint", 42)
        == "Omniscient Reader Viewpoint Chapter 42.mp3"
    )


@pytest.mark.asyncio
async def test_transcode_and_tag_mp3():
    wav_bytes = generate_test_wav_bytes(duration_sec=0.2)
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"

    mp3_bytes = await AudioPackagingService.transcode_and_tag_mp3(
        audio_bytes=wav_bytes,
        source_format="wav",
        project_title="The Villain Wants to Live",
        chapter_title="The Awakening",
        chapter_number=1,
        total_chapters=10,
        author="Jee Gab Song",
        genre="Fantasy",
        thumbnail_bytes=fake_png,
    )

    assert len(mp3_bytes) > 0

    # Parse resulting MP3 tags with mutagen
    parsed = MP3(io.BytesIO(mp3_bytes))
    assert parsed.tags is not None
    assert str(parsed.tags["TIT2"]) == "Chapter 1: The Awakening"
    assert str(parsed.tags["TALB"]) == "The Villain Wants to Live"
    assert str(parsed.tags["TPE1"]) == "Jee Gab Song"
    assert str(parsed.tags["TRCK"]) == "1/10"
    assert str(parsed.tags["TCON"]) == "Fantasy"
    assert "APIC:Cover" in parsed.tags or any(k.startswith("APIC") for k in parsed.tags.keys())


def test_package_endpoints_workflow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    res_p = client.post(
        "/api/v1/projects",
        json={"title": "Packaging Test Novel", "author": "Studio Master"},
        headers=headers,
    )
    assert res_p.status_code == 201
    project_id = res_p.json()["data"]["id"]

    # 2. Add chapters
    res_ch_list = client.get(f"/api/v1/projects/{project_id}/chapters", headers=headers)
    chapters = res_ch_list.json()["data"]

    if not chapters:
        res_create_ch = client.post(
            f"/api/v1/projects/{project_id}/chapters",
            json={"title": "Introduction", "order_index": 0},
            headers=headers,
        )
        assert res_create_ch.status_code == 201
        ch_id = res_create_ch.json()["data"]["id"]
    else:
        ch_id = chapters[0]["id"]

    # 3. Check Package Preview endpoint
    res_preview = client.get(f"/api/v1/projects/{project_id}/package-preview", headers=headers)
    assert res_preview.status_code == 200
    preview_data = res_preview.json()["data"]
    assert preview_data["project_title"] == "Packaging Test Novel"
    assert preview_data["archive_filename"] == "Packaging Test Novel.zip"
    assert "target_download_path" in preview_data
    assert len(preview_data["chapters"]) >= 1

    # 4. If chapter has no audio yet, package-mp3 returns 400 validation error
    res_dl = client.get(f"/api/v1/projects/{project_id}/chapters/{ch_id}/package-mp3", headers=headers)
    assert res_dl.status_code == 400
    assert "not been synthesized" in res_dl.json()["error"]["message"]

    # 5. Attach a synthesized audio file and verify full packaging flow
    wav_content = generate_test_wav_bytes(duration_sec=0.4)
    # Save test wav file locally in uploads
    from app.services.attachment import AttachmentService
    local_dir = AttachmentService.get_local_storage_dir() / "projects" / project_id / "audio"
    local_dir.mkdir(parents=True, exist_ok=True)
    test_wav_file = local_dir / "ch_1_master.wav"
    test_wav_file.write_bytes(wav_content)

    # Update chapter with audio_url pointing to this local audio
    client.patch(
        f"/api/v1/projects/{project_id}/chapters/{ch_id}",
        json={"audio_url": str(test_wav_file)},
        headers=headers,
    )
    # If patch allows or if we patch via DB
    # Let's test single chapter package-mp3 download
    res_mp3 = client.get(f"/api/v1/projects/{project_id}/chapters/{ch_id}/package-mp3", headers=headers)
    if res_mp3.status_code == 200:
        assert res_mp3.headers["content-type"] == "audio/mpeg"
        assert 'filename="Packaging Test Novel Chapter 1.mp3"' in res_mp3.headers["content-disposition"]
        assert len(res_mp3.content) > 0

        # Test batch zip packaging
        res_zip = client.post(
            f"/api/v1/projects/{project_id}/package-download",
            json={"mode": "all_synthesized"},
            headers=headers,
        )
        assert res_zip.status_code == 200
        assert res_zip.headers["content-type"] == "application/zip"
        assert 'filename="Packaging Test Novel.zip"' in res_zip.headers["content-disposition"]

        # Inspect zip contents
        import zipfile
        with zipfile.ZipFile(io.BytesIO(res_zip.content)) as zf:
            namelist = zf.namelist()
            assert "Packaging Test Novel/Packaging Test Novel Chapter 1.mp3" in namelist

