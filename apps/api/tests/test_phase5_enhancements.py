from app.core.config import settings


def _auth_headers(client):
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


def test_patch_user_preferences_merges_and_persists(client):
    headers = _auth_headers(client)

    patch_resp = client.patch(
        f"{settings.API_V1_STR}/auth/me/preferences",
        headers=headers,
        json={"preferences": {"auto_follow_audio": False, "default_tagging_strategy": "resume"}},
    )
    assert patch_resp.status_code == 200
    prefs = patch_resp.json()["data"]["preferences"]
    assert prefs["auto_follow_audio"] is False
    assert prefs["default_tagging_strategy"] == "resume"

    # Partial merge keeps previous keys intact
    patch_resp2 = client.patch(
        f"{settings.API_V1_STR}/auth/me/preferences",
        headers=headers,
        json={"preferences": {"editor_density": "comfortable"}},
    )
    assert patch_resp2.status_code == 200
    merged = patch_resp2.json()["data"]["preferences"]
    assert merged["auto_follow_audio"] is False
    assert merged["editor_density"] == "comfortable"


def test_logout_endpoint(client):
    headers = _auth_headers(client)
    resp = client.post(f"{settings.API_V1_STR}/auth/logout", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["logged_out"] is True


def test_consolidated_active_jobs_and_sse_stream(client):
    headers = _auth_headers(client)

    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Phase 5 Jobs Test"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # 1. Consolidated active jobs endpoint
    active_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/jobs/active",
        headers=headers,
    )
    assert active_resp.status_code == 200
    data = active_resp.json()["data"]
    assert data["project_id"] == project_id
    assert data["has_active"] is False
    assert "batch_audio" in data
    assert "voice_design_jobs" in data

    # 2. SSE events endpoint (bypasses gzip, emits data frame, closes cleanly when idle)
    sse_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/jobs/events",
        headers=headers,
    )
    assert sse_resp.status_code == 200
    assert sse_resp.headers["content-type"].startswith("text/event-stream")
    assert sse_resp.headers.get("x-accel-buffering") == "no"
    assert "data:" in sse_resp.text
