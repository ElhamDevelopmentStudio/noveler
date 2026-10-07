from app.core.config import settings
from fastapi.testclient import TestClient


def test_login_success(client: TestClient):
    response = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert data["data"]["token_type"] == "bearer"
    user = data["data"]["user"]
    assert user["email"] == settings.FIRST_USER_EMAIL
    assert user["handle"] == settings.FIRST_USER_HANDLE
    assert user["name"] == settings.FIRST_USER_NAME


def test_login_invalid_credentials(client: TestClient):
    response = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": "wrong-password-123",
        },
    )
    assert response.status_code == 401
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "UNAUTHORIZED"


def test_get_me_unauthorized(client: TestClient):
    response = client.get(f"{settings.API_V1_STR}/auth/me")
    assert response.status_code == 401


def test_get_me_and_update_profile(client: TestClient):
    # 1. Login to get token
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get profile
    me_resp = client.get(f"{settings.API_V1_STR}/auth/me", headers=headers)
    assert me_resp.status_code == 200
    user_info = me_resp.json()["data"]
    assert user_info["email"] == settings.FIRST_USER_EMAIL
    assert user_info["role"] == "admin"

    # 3. Update profile
    update_resp = client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "name": "Updated Admin Name",
            "social": "https://x.com/admin_novelova",
        },
    )
    assert update_resp.status_code == 200
    updated_user = update_resp.json()["data"]
    assert updated_user["name"] == "Updated Admin Name"
    # 4. Restore original profile
    client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "name": settings.FIRST_USER_NAME,
            "social": settings.FIRST_USER_SOCIAL,
        },
    )


def test_change_password_verification(client: TestClient):
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Missing current_password should fail
    resp = client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={"password": "new_password_123"},
    )
    assert resp.status_code == 401
    assert "Current password is required" in resp.json()["error"]["message"]

    # Wrong current_password should fail
    resp = client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "current_password": "wrong_password",
            "password": "new_password_123",
        },
    )
    assert resp.status_code == 401
    assert "Incorrect current password" in resp.json()["error"]["message"]

    # Valid current_password should succeed
    resp = client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "current_password": settings.FIRST_USER_PASSWORD,
            "password": "new_password_123",
        },
    )
    assert resp.status_code == 200

    # Reset password back to original
    client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "current_password": "new_password_123",
            "password": settings.FIRST_USER_PASSWORD,
        },
    )


def test_forgot_and_reset_password(client: TestClient):
    # 1. Request forgot password
    forgot_resp = client.post(
        f"{settings.API_V1_STR}/auth/forgot-password",
        json={"email": settings.FIRST_USER_EMAIL},
    )
    assert forgot_resp.status_code == 200
    forgot_data = forgot_resp.json()
    assert forgot_data["success"] is True
    reset_token = forgot_data["data"]["reset_token"]
    assert reset_token is not None

    # 2. Reset password using token
    new_password = "newsecretpassword456"
    reset_resp = client.post(
        f"{settings.API_V1_STR}/auth/reset-password",
        json={
            "token": reset_token,
            "new_password": new_password,
        },
    )
    assert reset_resp.status_code == 200
    assert reset_resp.json()["success"] is True

    # 3. Verify login works with new password
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": new_password,
        },
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["success"] is True

    # 4. Restore original password
    restore_token_resp = client.post(
        f"{settings.API_V1_STR}/auth/forgot-password",
        json={"email": settings.FIRST_USER_EMAIL},
    )
    restore_token = restore_token_resp.json()["data"]["reset_token"]
    client.post(
        f"{settings.API_V1_STR}/auth/reset-password",
        json={
            "token": restore_token,
            "new_password": settings.FIRST_USER_PASSWORD,
        },
    )
