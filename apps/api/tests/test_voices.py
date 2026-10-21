import io
import struct
import wave

from app.core.config import settings
from fastapi.testclient import TestClient


def make_dummy_wav() -> bytes:
    """Generate minimal valid 0.5-second WAV audio bytes."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(struct.pack("<h", 0) * 8000)
    return buf.getvalue()


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


def test_voice_crud_flow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project to test project-scoped voices
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Voice Test Novel"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]


    # 2. Create a global voice with audio and avatar
    wav_bytes = make_dummy_wav()
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"

    create_resp = client.post(
        f"{settings.API_V1_STR}/voices",
        headers=headers,
        data={
            "name": "Eldritch Narrator",
            "gender": "male",
            "is_global": "true",
            "reference_text": "Call me Ishmael.",
        },
        files={
            "audio_file": ("sample.wav", io.BytesIO(wav_bytes), "audio/wav"),
            "avatar_file": ("avatar.png", io.BytesIO(png_bytes), "image/png"),
        },
    )
    assert create_resp.status_code == 200
    global_voice = create_resp.json()["data"]
    assert global_voice["name"] == "Eldritch Narrator"
    assert global_voice["gender"] == "male"
    assert global_voice["is_global"] is True
    assert global_voice["project_id"] is None
    assert global_voice["audio_url"] is not None
    assert global_voice["avatar_url"] is not None
    assert global_voice["duration_seconds"] == 0.5
    assert global_voice["reference_text"] == "Call me Ishmael."

    global_voice_id = global_voice["id"]

    # 3. Create a project-scoped voice (local to project_id)
    local_create_resp = client.post(
        f"{settings.API_V1_STR}/voices",
        headers=headers,
        data={
            "name": "Sidekick Local",
            "gender": "female",
            "is_global": "false",
            "project_id": project_id,
        },
        files={
            "audio_file": ("sidekick.wav", io.BytesIO(wav_bytes), "audio/wav"),
        },
    )
    assert local_create_resp.status_code == 200
    local_voice = local_create_resp.json()["data"]
    assert local_voice["name"] == "Sidekick Local"
    assert local_voice["is_global"] is False
    assert local_voice["project_id"] == project_id
    assert local_voice["avatar_url"] is None

    local_voice_id = local_voice["id"]

    # 4. List voices with project_id filter (should include both global and project voice)
    list_resp = client.get(
        f"{settings.API_V1_STR}/voices?project_id={project_id}",
        headers=headers,
    )
    assert list_resp.status_code == 200
    voice_ids = [v["id"] for v in list_resp.json()["data"]["voices"]]
    assert global_voice_id in voice_ids
    assert local_voice_id in voice_ids

    # 5. List voices for a different project (should include global, but NOT project-scoped voice from other project)
    other_proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Other Novel"},
    )
    assert other_proj_resp.status_code == 201
    other_project_id = other_proj_resp.json()["data"]["id"]
    other_list_resp = client.get(
        f"{settings.API_V1_STR}/voices?project_id={other_project_id}",
        headers=headers,
    )
    assert other_list_resp.status_code == 200
    other_voice_ids = [v["id"] for v in other_list_resp.json()["data"]["voices"]]
    assert global_voice_id in other_voice_ids
    assert local_voice_id not in other_voice_ids

    # 6. Retrieve single voice by ID
    get_resp = client.get(
        f"{settings.API_V1_STR}/voices/{global_voice_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["id"] == global_voice_id

    # 7. Update voice metadata
    patch_resp = client.patch(
        f"{settings.API_V1_STR}/voices/{global_voice_id}",
        headers=headers,
        data={
            "name": "Eldritch Narrator Remastered",
            "gender": "neutral",
            "reference_text": "Updated transcript text.",
        },
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()["data"]
    assert updated["name"] == "Eldritch Narrator Remastered"
    assert updated["gender"] == "neutral"
    assert updated["reference_text"] == "Updated transcript text."

    # 8. Delete voices
    del_resp1 = client.delete(
        f"{settings.API_V1_STR}/voices/{global_voice_id}",
        headers=headers,
    )
    assert del_resp1.status_code == 200

    del_resp2 = client.delete(
        f"{settings.API_V1_STR}/voices/{local_voice_id}",
        headers=headers,
    )
    assert del_resp2.status_code == 200

    # Verify deleted
    get_deleted = client.get(
        f"{settings.API_V1_STR}/voices/{global_voice_id}",
        headers=headers,
    )
    assert get_deleted.status_code == 404


def test_voice_validation_errors(client: TestClient):
    headers = get_auth_headers(client)

    # Missing name
    wav_bytes = make_dummy_wav()
    resp = client.post(
        f"{settings.API_V1_STR}/voices",
        headers=headers,
        data={"name": "   "},
        files={"audio_file": ("test.wav", io.BytesIO(wav_bytes), "audio/wav")},
    )
    assert resp.status_code == 400

    # Unsupported audio file type
    resp_bad_ext = client.post(
        f"{settings.API_V1_STR}/voices",
        headers=headers,
        data={"name": "Bad Ext Voice"},
        files={"audio_file": ("sample.exe", io.BytesIO(b"evil"), "application/octet-stream")},
    )
    assert resp_bad_ext.status_code == 400

