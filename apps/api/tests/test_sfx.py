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


def test_sfx_crud_flow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project to test project-scoped sfx
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "SFX Fantasy Novel"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    wav_bytes = make_dummy_wav()

    # 2. Create a global Foley sound (e.g. Explosion)
    create_foley = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={
            "name": "Heavy Cannon Blast",
            "category": "foley",
            "is_global": "true",
            "default_volume": "1.0",
        },
        files={
            "audio_file": ("cannon.wav", io.BytesIO(wav_bytes), "audio/wav"),
        },
    )
    assert create_foley.status_code == 200
    foley_data = create_foley.json()["data"]
    assert foley_data["name"] == "Heavy Cannon Blast"
    assert foley_data["category"] == "foley"
    assert foley_data["is_global"] is True
    assert foley_data["project_id"] is None
    assert foley_data["audio_url"] is not None
    assert foley_data["duration_seconds"] == 0.5
    assert foley_data["default_volume"] == 1.0

    foley_id = foley_data["id"]

    # 3. Create a project-scoped Atmosphere sound (e.g. Ocean Waves)
    create_atmo = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={
            "name": "Ocean Waves & Wind",
            "category": "atmosphere",
            "is_global": "false",
            "project_id": project_id,
            "default_volume": "0.18",
        },
        files={
            "audio_file": ("waves.wav", io.BytesIO(wav_bytes), "audio/wav"),
        },
    )
    assert create_atmo.status_code == 200
    atmo_data = create_atmo.json()["data"]
    assert atmo_data["name"] == "Ocean Waves & Wind"
    assert atmo_data["category"] == "atmosphere"
    assert atmo_data["is_global"] is False
    assert atmo_data["project_id"] == project_id
    assert atmo_data["default_volume"] == 0.18

    atmo_id = atmo_data["id"]

    # 4. List SFX with category filter = foley
    foley_list_resp = client.get(
        f"{settings.API_V1_STR}/sfx?project_id={project_id}&category=foley",
        headers=headers,
    )
    assert foley_list_resp.status_code == 200
    foley_ids = [item["id"] for item in foley_list_resp.json()["data"]["items"]]
    assert foley_id in foley_ids
    assert atmo_id not in foley_ids

    # 5. List SFX with category filter = atmosphere
    atmo_list_resp = client.get(
        f"{settings.API_V1_STR}/sfx?project_id={project_id}&category=atmosphere",
        headers=headers,
    )
    assert atmo_list_resp.status_code == 200
    atmo_ids = [item["id"] for item in atmo_list_resp.json()["data"]["items"]]
    assert atmo_id in atmo_ids
    assert foley_id not in atmo_ids

    # 6. Verify scoping for a different project
    other_proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Different Novel"},
    )
    assert other_proj_resp.status_code == 201
    other_project_id = other_proj_resp.json()["data"]["id"]

    other_list_resp = client.get(
        f"{settings.API_V1_STR}/sfx?project_id={other_project_id}",
        headers=headers,
    )
    assert other_list_resp.status_code == 200
    other_ids = [item["id"] for item in other_list_resp.json()["data"]["items"]]
    assert foley_id in other_ids  # Global sound is included
    assert atmo_id not in other_ids  # Project-scoped sound from novel 1 is NOT included

    # 7. Retrieve single sound by ID
    get_resp = client.get(
        f"{settings.API_V1_STR}/sfx/{foley_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["id"] == foley_id

    # 8. Update sound metadata
    patch_resp = client.patch(
        f"{settings.API_V1_STR}/sfx/{foley_id}",
        headers=headers,
        data={
            "name": "Heavy Cannon Blast (Remastered)",
            "default_volume": "0.85",
        },
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()["data"]
    assert updated["name"] == "Heavy Cannon Blast (Remastered)"
    assert updated["default_volume"] == 0.85

    # 9. Delete sound effects
    del_resp1 = client.delete(f"{settings.API_V1_STR}/sfx/{foley_id}", headers=headers)
    assert del_resp1.status_code == 200
    del_resp2 = client.delete(f"{settings.API_V1_STR}/sfx/{atmo_id}", headers=headers)
    assert del_resp2.status_code == 200

    # Verify deleted
    get_del = client.get(f"{settings.API_V1_STR}/sfx/{foley_id}", headers=headers)
    assert get_del.status_code == 404


def test_sfx_validation_errors(client: TestClient):
    headers = get_auth_headers(client)

    wav_bytes = make_dummy_wav()

    # Missing name
    resp_empty = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={"name": "   "},
        files={"audio_file": ("test.wav", io.BytesIO(wav_bytes), "audio/wav")},
    )
    assert resp_empty.status_code == 400

    # Bad audio extension
    resp_bad_ext = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={"name": "Bad File"},
        files={"audio_file": ("sound.pdf", io.BytesIO(b"fake pdf"), "application/pdf")},
    )
    assert resp_bad_ext.status_code == 400
