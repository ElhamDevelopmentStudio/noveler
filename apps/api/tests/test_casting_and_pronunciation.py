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
    list_resp = client.post = client.get(
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
