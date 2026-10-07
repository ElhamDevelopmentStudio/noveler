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

    # 2. Get characters (auto-seeded with 12 characters)
    chars_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        headers=headers,
    )
    assert chars_resp.status_code == 200
    chars = chars_resp.json()["data"]
    assert len(chars) == 12

    mara = next((c for c in chars if c["name"] == "Mara Vale"), None)
    assert mara is not None
    assert mara["gender"] == "female"

    # 3. Set defaults by inferred gender
    gender_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/defaults-by-gender",
        headers=headers,
    )
    assert gender_resp.status_code == 200
    updated_chars = gender_resp.json()["data"]
    mara_updated = next(c for c in updated_chars if c["name"] == "Mara Vale")
    assert mara_updated["assigned_voice_id"] == "female-general"

    # 4. Batch assign custom voices
    assign_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/batch-assign",
        json={
            "assignments": [
                {
                    "character_id": mara["id"],
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
    search_data = search_resp.json()["data"]
    assert search_data["total_occurrences"] >= 3
    assert len(search_data["occurrences"]) >= 3
    first_match = search_data["occurrences"][0]
    assert "loo-EL-in" in first_match["after_replacement"]

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
