import io
from app.core.config import settings
from fastapi.testclient import TestClient


def test_attachment_upload_claim_flow(client: TestClient):
    # 1. Login to get token
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

    # 2. Upload an image attachment
    fake_image_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    files = {
        "file": ("test_avatar.png", io.BytesIO(fake_image_bytes), "image/png"),
    }
    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        headers=headers,
        files=files,
    )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.json()
    assert upload_data["success"] is True
    attachment = upload_data["data"]
    attachment_id = attachment["id"]
    assert attachment["filename"] == "test_avatar.png"
    assert attachment["content_type"] == "image/png"
    assert attachment["claimed_at"] is None
    assert "url" in attachment
    assert attachment["url"] is not None

    # 3. Verify getting attachment by ID directly
    get_resp = client.get(
        f"{settings.API_V1_STR}/attachments/{attachment_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["id"] == attachment_id
    assert get_resp.json()["data"]["claimed_at"] is None

    # 4. Claim the attachment by associating with user profile
    update_resp = client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "avatar_attachment_id": attachment_id,
        },
    )
    assert update_resp.status_code == 200
    updated_user = update_resp.json()["data"]
    assert updated_user["avatar_attachment_id"] == attachment_id
    assert updated_user["avatar_url"] is not None

    # 5. Verify the attachment's claimed_at is now populated
    claimed_get_resp = client.get(
        f"{settings.API_V1_STR}/attachments/{attachment_id}",
        headers=headers,
    )
    assert claimed_get_resp.status_code == 200
    assert claimed_get_resp.json()["data"]["claimed_at"] is not None

    # 6. Verify GET /me returns the avatar_attachment_id and presigned avatar_url
    me_resp = client.get(f"{settings.API_V1_STR}/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["data"]["avatar_attachment_id"] == attachment_id
    assert me_resp.json()["data"]["avatar_url"] is not None

    # 7. Reset avatar back to None for clean teardown
    client.put(
        f"{settings.API_V1_STR}/auth/me",
        headers=headers,
        json={
            "avatar_attachment_id": "",
        },
    )
