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


def test_character_merge_preview_and_warnings(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Preview Merge Project", "author": "Author P"},
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # 2. Create source character (Female, voice A)
    src_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={
            "name": "Lady Sarah",
            "gender": "female",
            "assigned_voice_id": "v_sarah",
            "assigned_voice_name": "Sarah",
        },
        headers=headers,
    )
    assert src_resp.status_code == 200
    source_id = src_resp.json()["data"]["id"]

    # 3. Create target character (Male, voice B)
    tgt_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={
            "name": "Lord Sarah",
            "gender": "male",
            "assigned_voice_id": "v_lord",
            "assigned_voice_name": "Lord Voice",
        },
        headers=headers,
    )
    assert tgt_resp.status_code == 200
    target_id = tgt_resp.json()["data"]["id"]

    # 4. Request merge preview
    prev_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/merge-preview?source_character_id={source_id}&target_character_id={target_id}",
        headers=headers,
    )
    assert prev_resp.status_code == 200
    prev_data = prev_resp.json()["data"]
    assert prev_data["source_character"]["id"] == source_id
    assert prev_data["target_character"]["id"] == target_id
    assert isinstance(prev_data["affected_chapters"], list)
    assert isinstance(prev_data["sample_segments"], list)
    # Check that gender mismatch warning was triggered
    warnings = prev_data["warnings"]
    assert any("Gender mismatch" in w for w in warnings)
    assert any("Voice change" in w for w in warnings)


def test_alias_suggestions_no_substring_false_positives(client: TestClient):
    headers = get_auth_headers(client)

    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Substring Filter Project", "author": "Test Author"},
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # Add characters "Dan" and "Daniel" (substring, but not whole token)
    c1 = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Dan", "gender": "male"},
        headers=headers,
    )
    assert c1.status_code == 200

    c2 = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Daniel", "gender": "male"},
        headers=headers,
    )
    assert c2.status_code == 200

    # Add characters "Ron" and "Aaron"
    c3 = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Ron", "gender": "male"},
        headers=headers,
    )
    assert c3.status_code == 200

    c4 = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Aaron", "gender": "male"},
        headers=headers,
    )
    assert c4.status_code == 200

    # Add true alias "Dr. John Watson" and "John Watson"
    c5 = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Dr. John Watson", "gender": "male"},
        headers=headers,
    )
    assert c5.status_code == 200

    c6 = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "John Watson", "gender": "male"},
        headers=headers,
    )
    assert c6.status_code == 200

    sugg_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/alias-suggestions",
        headers=headers,
    )
    assert sugg_resp.status_code == 200
    suggestions = sugg_resp.json()["data"]

    # Verify "Dan" and "Daniel" are NOT suggested
    assert not any(
        (s["source_name"] == "Dan" and s["target_name"] == "Daniel")
        or (s["source_name"] == "Daniel" and s["target_name"] == "Dan")
        for s in suggestions
    )

    # Verify "Ron" and "Aaron" are NOT suggested
    assert not any(
        (s["source_name"] == "Ron" and s["target_name"] == "Aaron")
        or (s["source_name"] == "Aaron" and s["target_name"] == "Ron")
        for s in suggestions
    )

    # Verify "Dr. John Watson" and "John Watson" ARE suggested
    assert any(
        "Watson" in s["source_name"] and "Watson" in s["target_name"]
        for s in suggestions
    )

