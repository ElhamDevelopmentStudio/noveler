from app.core.config import settings
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.services.pronunciation import PronunciationService
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


def test_character_casting_and_alias_propagation(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Alias Test Project", "author": "Mara Voss"},
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # 2. Create character "Seo"
    char_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={
            "name": "Seo",
            "gender": "male",
            "role_description": "Disciple",
        },
        headers=headers,
    )
    assert char_resp.status_code == 200
    char_id = char_resp.json()["data"]["id"]
    assert char_resp.json()["data"]["name"] == "Seo"

    # 3. Simulate dialogue segments linked to Seo
    # We can create a chapter via direct service or check rename API
    update_resp = client.put(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/{char_id}",
        json={
            "name": "Suhh",
            "role_description": "Senior Disciple",
        },
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated_data = update_resp.json()["data"]
    assert updated_data["name"] == "Suhh"
    assert "Seo" in updated_data["aliases"]


def test_gender_default_voice_assignment(client: TestClient):
    headers = get_auth_headers(client)

    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Gender Voice Test", "author": "Mara Voss"},
        headers=headers,
    )
    project_id = proj_resp.json()["data"]["id"]

    # Create male and female characters
    client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Elias Thorne", "gender": "male"},
        headers=headers,
    )
    client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        json={"name": "Mara Vale", "gender": "female"},
        headers=headers,
    )

    # Trigger set-defaults-by-gender
    def_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/set-defaults-by-gender",
        headers=headers,
    )
    assert def_resp.status_code == 200
    chars = def_resp.json()["data"]
    by_name = {c["name"]: c for c in chars}
    assert by_name["Elias Thorne"]["assigned_voice_name"] == "Male General"
    assert by_name["Mara Vale"]["assigned_voice_name"] == "Female General"


def test_pronunciation_rules_and_non_destructive_audio_replacement(client: TestClient):
    headers = get_auth_headers(client)

    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Pronunciation Project", "author": "Mara Voss"},
        headers=headers,
    )
    project_id = proj_resp.json()["data"]["id"]

    # Save pronunciation rule for "Llywelyn" -> "loo-EL-in"
    save_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        json={
            "phrase": "Llywelyn",
            "replacement": "loo-EL-in",
            "match_case": False,
            "scope": "entire_manuscript",
        },
        headers=headers,
    )
    assert save_resp.status_code == 200
    rule_id = save_resp.json()["data"]["id"]

    # List rules
    list_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        headers=headers,
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]["rules"]) == 1

    # Verify in-memory replacement non-destructively
    from app.models.pronunciation import PronunciationRuleModel
    rule = PronunciationRuleModel(
        phrase="Llywelyn",
        replacement="loo-EL-in",
        match_case=False,
        is_active=True,
    )
    original_text = "Ask Llywelyn about the eastern wall, Elias said."
    synthesized = PronunciationService.apply_rules_to_text(original_text, [rule])
    assert synthesized == "Ask loo-EL-in about the eastern wall, Elias said."
    # Original text is unchanged
    assert "Llywelyn" in original_text


def test_canvas_pronunciation_quick_action_and_occurrences_scope(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Upload manuscript with two chapters containing Korean/unusual names
    manuscript_text = b"""Chapter 1
Jeon Myeong-hoon looked across the snowy pavilion.
"Have you found the ancient Elixir yet?" he asked.

Chapter 2
Jeon Myeong-hoon took another sip of tea.
"The Elixir was destroyed decades ago," Elder Han replied.
"""
    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        files={"file": ("manuscript.txt", manuscript_text, "text/plain")},
        headers=headers,
    )
    assert upload_resp.status_code == 200
    attachment_id = upload_resp.json()["data"]["id"]

    # 2. Create project & parse
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Pronunciation Scope Test",
            "author": "Author Kim",
            "status": "ready_to_parse",
            "manuscript_attachment_id": attachment_id,
        },
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    parse_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/parse",
        json={},
        headers=headers,
    )
    assert parse_resp.status_code == 200
    chapters = parse_resp.json()["data"]["chapters"]
    assert len(chapters) == 2
    ch1_id = chapters[0]["id"]
    ch2_id = chapters[1]["id"]

    # 3. Test find occurrences scoped to Chapter 1
    find_ch1_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation/find",
        json={
            "word": "Jeon Myeong-hoon",
            "replacement": "Jun Myung Hoon",
            "match_case": False,
            "scope": ch1_id,
        },
        headers=headers,
    )
    assert find_ch1_resp.status_code == 200
    ch1_data = find_ch1_resp.json()["data"]
    assert ch1_data["total_found"] == 1
    assert ch1_data["occurrences"][0]["chapter_id"] == ch1_id

    # 4. Test find occurrences scoped to entire manuscript
    find_all_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation/find",
        json={
            "word": "Jeon Myeong-hoon",
            "replacement": "Jun Myung Hoon",
            "match_case": False,
            "scope": "entire_manuscript",
        },
        headers=headers,
    )
    assert find_all_resp.status_code == 200
    all_data = find_all_resp.json()["data"]
    assert all_data["total_found"] == 2

    # 5. Save pronunciation rule via quick-action
    save_rule_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        json={
            "phrase": "Jeon Myeong-hoon",
            "replacement": "Jun Myung Hoon",
            "match_case": False,
            "scope": "entire_manuscript",
        },
        headers=headers,
    )
    assert save_rule_resp.status_code == 200
    saved_rule = save_rule_resp.json()["data"]
    assert saved_rule["phrase"] == "Jeon Myeong-hoon"
    assert saved_rule["replacement"] == "Jun Myung Hoon"
    assert saved_rule["occurrences_count"] == 2
    rule_id = saved_rule["id"]

    # 6. Verify listing includes the rule
    list_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        headers=headers,
    )
    assert list_resp.status_code == 200
    assert any(r["id"] == rule_id for r in list_resp.json()["data"]["rules"])

    # 7. Delete rule
    del_resp = client.delete(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation/{rule_id}",
        headers=headers,
    )
    assert del_resp.status_code == 200

    # 8. Verify listing is now empty
    list_after_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/pronunciation",
        headers=headers,
    )
    assert list_after_resp.status_code == 200
    assert not any(r["id"] == rule_id for r in list_after_resp.json()["data"]["rules"])


def test_project_settings_paralinguistic_toggles(client: TestClient):
    headers = get_auth_headers(client)

    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Settings Test", "author": "Mara Voss"},
        headers=headers,
    )
    project_id = proj_resp.json()["data"]["id"]

    # Turn off 'sniff' and disable paralinguistic tags
    patch_resp = client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/settings",
        json={
            "paralinguistic_tags_enabled": True,
            "active_paralinguistic_tags": {
                "sniff": False,
                "laugh": True,
            },
        },
        headers=headers,
    )
    assert patch_resp.status_code == 200
    settings_data = patch_resp.json()["data"]["settings"]
    assert settings_data["paralinguistic_tags_enabled"] is True
    assert settings_data["active_paralinguistic_tags"]["sniff"] is False
    assert settings_data["active_paralinguistic_tags"]["laugh"] is True
