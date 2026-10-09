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


def test_character_merge_and_alias_suggestions(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Director Kim Identity Merge Test",
            "author": "Author Kim",
            "status": "ready_to_parse",
        },
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # 2. Create canonical character "Jeon Myeong-hoon"
    target_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={
            "name": "Jeon Myeong-hoon",
            "gender": "male",
            "role_description": "Protagonist martial artist",
        },
        headers=headers,
    )
    assert target_resp.status_code == 200
    target_id = target_resp.json()["data"]["id"]

    # 3. Create alias/title character "Section Chief Jeon"
    source_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={
            "name": "Section Chief Jeon",
            "gender": "male",
            "role_description": "Corporate title",
        },
        headers=headers,
    )
    assert source_resp.status_code == 200
    source_id = source_resp.json()["data"]["id"]

    # 4. Check alias suggestions endpoint detects the title/token match
    sugg_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/alias-suggestions",
        headers=headers,
    )
    assert sugg_resp.status_code == 200
    suggestions = sugg_resp.json()["data"]
    assert len(suggestions) > 0
    match = next(
        (s for s in suggestions if s["source_character_id"] == source_id and s["target_character_id"] == target_id),
        None,
    )
    assert match is not None
    assert "Jeon" in match["reason"]

    # 5. Merge Section Chief Jeon into Jeon Myeong-hoon
    merge_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/merge",
        json={
            "source_character_id": source_id,
            "target_character_id": target_id,
        },
        headers=headers,
    )
    assert merge_resp.status_code == 200
    merged_char = merge_resp.json()["data"]
    assert merged_char["id"] == target_id
    assert "Section Chief Jeon" in merged_char["aliases"]

    # 6. Verify source character was removed from roster
    chars_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        headers=headers,
    )
    assert chars_resp.status_code == 200
    remaining_chars = chars_resp.json()["data"]["characters"]
    assert not any(c["id"] == source_id for c in remaining_chars)
    assert any(c["id"] == target_id for c in remaining_chars)
