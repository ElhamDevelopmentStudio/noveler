import pytest
from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret
from app.services import telegram as telegram_service
from app.services.llm_client import LLMClientError
from app.services.project import ProjectService
from fastapi.testclient import TestClient
from novelova_core.exceptions import ValidationError


def test_storage_path_traversal_blocked(client: TestClient):
    """Ensure path traversal on voice and SFX storage helpers & routes is strictly forbidden."""
    from app.services.attachment import AttachmentService
    from novelova_core.exceptions import ForbiddenError

    with pytest.raises(ForbiddenError):
        AttachmentService.get_local_file_path("../../../../.env")
    with pytest.raises(ForbiddenError):
        AttachmentService.get_local_file_path("voices/../../.env", allowed_prefixes=("voices/",))
    with pytest.raises(ForbiddenError):
        AttachmentService.get_local_file_path("other/file.wav", allowed_prefixes=("voices/",))

    # URL-encoded traversal sent over HTTP
    voice_resp = client.get(f"{settings.API_V1_STR}/voices/storage/voices/%2e%2e/%2e%2e/.env")
    assert voice_resp.status_code == 403
    sfx_resp = client.get(f"{settings.API_V1_STR}/sfx/storage/sfx/%2e%2e/%2e%2e/.env")
    assert sfx_resp.status_code == 403


def test_llm_client_error_instantiation():
    """Verify LLMClientError no longer crashes with TypeError on status_code."""
    err = LLMClientError("Rate limited", error_type="rate_limit", status_code=429)
    assert err.message == "Rate limited"
    assert err.code == "RATE_LIMIT"
    assert err.status_code == 429
    assert err.error_type == "rate_limit"


def test_telegram_asyncio_imported():
    """Verify asyncio is imported in telegram service for batch delivery sleep."""
    assert hasattr(telegram_service, "asyncio")


def test_secret_encryption_roundtrip_and_failure():
    """Verify Fernet encryption round-trip and that invalid ciphertext raises ValueError."""
    cipher = encrypt_secret("my-super-secret-token")
    assert not cipher.startswith("enc:v1:")
    assert decrypt_secret(cipher) == "my-super-secret-token"

    with pytest.raises(ValueError, match="Failed to decrypt stored secret"):
        decrypt_secret("not-a-valid-fernet-token")


@pytest.mark.asyncio
async def test_import_text_from_url_blocks_ssrf():
    """Ensure localhost and cloud metadata endpoints are rejected by import_text_from_url."""
    for blocked_url in (
        "http://127.0.0.1:8000/api/v1/health",
        "http://localhost:8000/api/v1/health",
        "http://169.254.169.254/latest/meta-data/",
    ):
        with pytest.raises(ValidationError):
            await ProjectService.import_text_from_url(blocked_url)


def test_forgot_password_hides_token_in_production(client: TestClient, monkeypatch):
    """Ensure reset_token is never returned in HTTP response outside development."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    resp = client.post(
        f"{settings.API_V1_STR}/auth/forgot-password",
        json={"email": settings.FIRST_USER_EMAIL},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["reset_token"] is None
