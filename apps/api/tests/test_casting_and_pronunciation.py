import asyncio
import uuid

from app.core.config import settings
from app.db.session import get_session_factory
from app.models.character import CharacterModel
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


def test_character_casting_flow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Casting Test Project",
            "author": "Mara Voss",
            "status": "in_production",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 2. Initially empty characters
    chars_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        headers=headers,
    )
    assert chars_resp.status_code == 200
    assert len(chars_resp.json()["data"]) == 0

    # 3. Insert a test character
    async def _add_test_char():
        factory = get_session_factory()
        async with factory() as session:
            c = CharacterModel(
                id=str(uuid.uuid4()),
                project_id=project_id,
                name="Mara Vale",
                slug="mara-vale",
                gender="female",
                role_description="Female · Protagonist",
                dialogue_count=10,
                word_count=500,
            )
            session.add(c)
            await session.commit()
            return c.id

    char_id = asyncio.run(_add_test_char())

    # 4. Verify character appears
    chars_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        headers=headers,
    )
    assert chars_resp.status_code == 200
    chars = chars_resp.json()["data"]
    assert len(chars) == 1
    mara = chars[0]
    assert mara["id"] == char_id
    assert mara["name"] == "Mara Vale"
    assert mara["gender"] == "female"

    # 5. Set defaults by inferred gender
    gender_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/defaults-by-gender",
        headers=headers,
    )
    assert gender_resp.status_code == 200
    updated_chars = gender_resp.json()["data"]
    mara_updated = next(c for c in updated_chars if c["name"] == "Mara Vale")
    assert mara_updated["assigned_voice_id"] == "female-general"

    # 6. Batch assign custom voices
    assign_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/batch-assign",
        json={
            "assignments": [
                {
                    "character_id": char_id,
                    "assigned_voice_id": "british-matron",
                    "assigned_voice_name": "British Matron",
                }
            ]
        },
        headers=headers,
    )
    assert assign_resp.status_code == 200
    assigned_chars = assign_resp.json()["data"]
    mara_custom = next(c for c in assigned_chars if c["name"] == "Mara Vale")
    assert mara_custom["assigned_voice_id"] == "british-matron"


def test_pronunciation_flow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Pronunciation Test Project",
            "author": "Mara Voss",
            "status": "in_production",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 2. Search pronunciation occurrences for Llywelyn
    search_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation/search",
        json={
            "phrase": "Llywelyn",
            "replacement": "loo-EL-in",
            "match_case": False,
            "scope": "entire_manuscript",
        },
        headers=headers,
    )
    assert search_resp.status_code == 200

    # 3. Save pronunciation rule
    save_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        json={
            "phrase": "Llywelyn",
            "replacement": "loo-EL-in",
            "match_case": False,
            "scope": "entire_manuscript",
            "occurrences_count": 3,
        },
        headers=headers,
    )
    assert save_resp.status_code == 200
    rule = save_resp.json()["data"]
    assert rule["phrase"] == "Llywelyn"
    assert rule["replacement"] == "loo-EL-in"

    # 4. List saved pronunciation rules
    list_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        headers=headers,
    )
    assert list_resp.status_code == 200
    rules = list_resp.json()["data"]
    assert len(rules) >= 1
    assert any(r["phrase"] == "Llywelyn" for r in rules)
