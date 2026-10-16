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


def test_kaggle_endpoints_unauthorized(client: TestClient):
    assert client.get(f"{settings.API_V1_STR}/profile/kaggle/accounts").status_code == 401
    assert client.get(f"{settings.API_V1_STR}/profile/kaggle/summary").status_code == 401


@patch("app.api.v1.endpoints.kaggle.verify_kaggle_credentials", new_callable=AsyncMock)
@patch("app.services.kaggle_account.verify_kaggle_credentials", new_callable=AsyncMock)
def test_kaggle_account_full_lifecycle(
    mock_service_verify: AsyncMock,
    mock_endpoint_verify: AsyncMock,
    client: TestClient,
):
    headers = _get_auth_header(client)
    mock_service_verify.return_value = {
        "success": True,
        "username": "noveler_runner_test",
        "message": "Verified!",
    }
    mock_endpoint_verify.return_value = mock_service_verify.return_value

    # 1. Fetch initial summary
    sum_resp = client.get(f"{settings.API_V1_STR}/profile/kaggle/summary", headers=headers)
    assert sum_resp.status_code == 200
    initial_total = sum_resp.json()["data"]["total_accounts"]

    # 2. Add an account
    create_resp = client.post(
        f"{settings.API_V1_STR}/profile/kaggle/accounts",
        headers=headers,
        json={
            "username": "noveler_runner_test",
            "key": "9a4b2c1d8e7f6035123456789abcdef0",
            "priority": 1,
            "is_active": True,
            "verify_first": True,
        },
    )
    assert create_resp.status_code == 200
    account_data = create_resp.json()["data"]
    account_id = account_data["id"]
    assert account_data["username"] == "noveler_runner_test"
    assert "•" in account_data["key_masked"]
    assert account_data["key_masked"].endswith("ef0")

    # 3. List accounts
    list_resp = client.get(f"{settings.API_V1_STR}/profile/kaggle/accounts", headers=headers)
    assert list_resp.status_code == 200
    accounts = list_resp.json()["data"]
    assert any(a["id"] == account_id for a in accounts)

    # 4. Check summary reflects added account
    sum_resp2 = client.get(f"{settings.API_V1_STR}/profile/kaggle/summary", headers=headers)
    assert sum_resp2.status_code == 200
    assert sum_resp2.json()["data"]["total_accounts"] == initial_total + 1

    # 5. Update account priority and active status
    update_resp = client.put(
        f"{settings.API_V1_STR}/profile/kaggle/accounts/{account_id}",
        headers=headers,
        json={
            "priority": 2,
            "is_active": False,
        },
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["priority"] == 2
    assert update_resp.json()["data"]["is_active"] is False

    # 6. Test saved account
    test_resp = client.post(
        f"{settings.API_V1_STR}/profile/kaggle/accounts/{account_id}/test",
        headers=headers,
    )
    assert test_resp.status_code == 200
    assert test_resp.json()["data"]["success"] is True

    # 7. Test direct credentials without saving
    direct_test = client.post(
        f"{settings.API_V1_STR}/profile/kaggle/test-credentials",
        headers=headers,
        json={
            "username": "noveler_runner_test",
            "key": "9a4b2c1d8e7f6035123456789abcdef0",
        },
    )
    assert direct_test.status_code == 200
    assert direct_test.json()["data"]["success"] is True

    # 8. Delete account
    del_resp = client.delete(
        f"{settings.API_V1_STR}/profile/kaggle/accounts/{account_id}",
        headers=headers,
    )
    assert del_resp.status_code == 200

    # 9. Verify deleted
    list_resp2 = client.get(f"{settings.API_V1_STR}/profile/kaggle/accounts", headers=headers)
    assert not any(a["id"] == account_id for a in list_resp2.json()["data"])
