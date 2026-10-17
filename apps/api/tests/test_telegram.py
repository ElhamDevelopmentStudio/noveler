from unittest.mock import AsyncMock, patch

from app.core.config import settings
from fastapi.testclient import TestClient


def _get_auth_header(client: TestClient) -> dict[str, str]:
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    token = login_resp.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_telegram_settings_unauthorized(client: TestClient):
    resp = client.get(f"{settings.API_V1_STR}/profile/telegram")
    assert resp.status_code == 401


def test_telegram_settings_lifecycle(client: TestClient):
    headers = _get_auth_header(client)

    # 1. Fetch initial settings
    resp = client.get(f"{settings.API_V1_STR}/profile/telegram", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "enabled" in data
    assert "has_token" in data

    # 2. Update Telegram settings
    update_resp = client.put(
        f"{settings.API_V1_STR}/profile/telegram",
        headers=headers,
        json={
            "enabled": True,
            "bot_token": "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
            "chat_id": "987654321",
        },
    )
    assert update_resp.status_code == 200
    updated_data = update_resp.json()["data"]
    assert updated_data["enabled"] is True
    assert updated_data["has_token"] is True
    assert updated_data["chat_id"] == "987654321"
    assert "123456" in updated_data["bot_token_masked"]
    assert "•" in updated_data["bot_token_masked"]

    # 3. Update without changing token (preserves existing token)
    update_resp2 = client.put(
        f"{settings.API_V1_STR}/profile/telegram",
        headers=headers,
        json={
            "enabled": False,
            "chat_id": "11223344",
        },
    )
    assert update_resp2.status_code == 200
    assert update_resp2.json()["data"]["enabled"] is False
    assert update_resp2.json()["data"]["chat_id"] == "11223344"
    assert update_resp2.json()["data"]["has_token"] is True


@patch("app.services.telegram.TelegramService.test_connection", new_callable=AsyncMock)
def test_telegram_test_endpoint(mock_test_conn: AsyncMock, client: TestClient):
    headers = _get_auth_header(client)
    mock_test_conn.return_value = {
        "success": True,
        "message": "Successfully verified @test_bot and delivered a test message!",
        "bot_username": "test_bot",
        "bot_name": "Test Bot",
    }

    resp = client.post(
        f"{settings.API_V1_STR}/profile/telegram/test",
        headers=headers,
        json={
            "bot_token": "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
            "chat_id": "987654321",
        },
    )
    assert resp.status_code == 200
    res_data = resp.json()["data"]
    assert res_data["success"] is True
    assert res_data["bot_username"] == "test_bot"
