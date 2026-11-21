from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.security import hash_api_token
from app.models.api_token import ApiTokenModel
from app.models.user import UserModel
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def get_jwt_headers(client: TestClient) -> dict[str, str]:
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


def test_api_token_lifecycle_and_dual_auth(client: TestClient):
    jwt_headers = get_jwt_headers(client)

    # 1. Create a permanent API token
    create_resp = client.post(
        f"{settings.API_V1_STR}/profile/api-tokens",
        json={
            "name": "CLI Agent Token",
            "rate_limit_rpm": 60,
        },
        headers=jwt_headers,
    )
    assert create_resp.status_code == 201
    created_data = create_resp.json()["data"]
    raw_token = created_data["token"]
    token_id = created_data["id"]

    assert raw_token.startswith("nv_live_")
    assert created_data["token_prefix"] == raw_token[:16]
    assert created_data["name"] == "CLI Agent Token"
    assert created_data["expires_at"] is None
    assert created_data["is_active"] is True

    # 2. Authenticate to /me using X-API-Key header
    me_resp_x_api_key = client.get(
        f"{settings.API_V1_STR}/auth/me",
        headers={"x-api-key": raw_token},
    )
    assert me_resp_x_api_key.status_code == 200
    assert me_resp_x_api_key.json()["data"]["email"] == settings.FIRST_USER_EMAIL

    # 3. Authenticate to /me using Authorization: Bearer <nv_live_token>
    me_resp_bearer = client.get(
        f"{settings.API_V1_STR}/auth/me",
        headers={"Authorization": f"Bearer {raw_token}"},
    )
    assert me_resp_bearer.status_code == 200
    assert me_resp_bearer.json()["data"]["email"] == settings.FIRST_USER_EMAIL

    # 4. List tokens and ensure secret token is NOT leaked
    list_resp = client.get(
        f"{settings.API_V1_STR}/profile/api-tokens",
        headers=jwt_headers,
    )
    assert list_resp.status_code == 200
    tokens = list_resp.json()["data"]["tokens"]
    matching = [t for t in tokens if t["id"] == token_id]
    assert len(matching) == 1
    assert "token" not in matching[0]
    assert matching[0]["token_prefix"] == raw_token[:16]
    assert matching[0]["last_used_at"] is not None

    # 5. Revoke token
    del_resp = client.delete(
        f"{settings.API_V1_STR}/profile/api-tokens/{token_id}",
        headers=jwt_headers,
    )
    assert del_resp.status_code == 200

    # 6. Verify revoked token can no longer authenticate
    failed_resp = client.get(
        f"{settings.API_V1_STR}/auth/me",
        headers={"x-api-key": raw_token},
    )
    assert failed_resp.status_code == 401


def test_api_token_invalid_or_expired(client: TestClient):
    # Invalid token format
    res = client.get(
        f"{settings.API_V1_STR}/auth/me",
        headers={"x-api-key": "nv_live_bogus_fake_token_1234567890"},
    )
    assert res.status_code == 401
