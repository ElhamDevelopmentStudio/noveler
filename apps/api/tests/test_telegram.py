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


def test_send_chapter_telegram_not_configured(client: TestClient):
    headers = _get_auth_header(client)
    # Ensure telegram is disabled
    client.put(
        f"{settings.API_V1_STR}/profile/telegram",
        headers=headers,
        json={"enabled": False, "bot_token": None, "chat_id": None},
    )

    # Create dummy project & chapter
    p_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Telegram Project Test"},
    )
    p_id = p_resp.json()["data"]["id"]

    c_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters",
        headers=headers,
        json={"title": "Chapter 1"},
    )
    c_id = c_resp.json()["data"]["id"]

    resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/send-telegram",
        headers=headers,
    )
    assert resp.status_code == 400
    data = resp.json()
    assert "TELEGRAM_NOT_CONFIGURED" in str(data)


@patch("app.services.telegram.TelegramService.send_audio", new_callable=AsyncMock)
def test_send_chapter_telegram_success(mock_send_audio: AsyncMock, client: TestClient):
    headers = _get_auth_header(client)
    mock_send_audio.return_value = {"ok": True, "result": {"message_id": 999}}

    # Configure telegram
    client.put(
        f"{settings.API_V1_STR}/profile/telegram",
        headers=headers,
        json={
            "enabled": True,
            "bot_token": "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
            "chat_id": "987654321",
        },
    )

    # Create project & chapter
    p_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Audio Delivery Novel"},
    )
    p_id = p_resp.json()["data"]["id"]

    c_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters",
        headers=headers,
        json={"title": "The Golden Dawn"},
    )
    c_id = c_resp.json()["data"]["id"]

    # Send preview to Telegram
    resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/send-telegram",
        headers=headers,
        json={"force_preview": True},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["success"] is True
    assert data["chat_id"] == "987654321"
    assert "Golden Dawn" in data["title"]
    assert data["is_preview"] is True

    # Verify mock call
    mock_send_audio.assert_called_once()
    kwargs = mock_send_audio.call_args.kwargs
    assert kwargs["bot_token"] == "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
    assert kwargs["chat_id"] == "987654321"
    assert "Golden Dawn" in kwargs["title"]
    assert len(kwargs["audio_bytes"]) > 0
    assert kwargs["filename"].endswith(".wav")
