from app.core.config import settings


def _admin_headers(client):
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


def test_scheduler_requires_auth(client):
    response = client.get("/api/v1/scheduler/jobs")
    assert response.status_code == 401


def test_scheduler_jobs_list(client):
    response = client.get("/api/v1/scheduler/jobs", headers=_admin_headers(client))
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert isinstance(payload["data"], list)
    assert len(payload["data"]) >= 1
    job_ids = [job["id"] for job in payload["data"]]
    assert "system_heartbeat" in job_ids
    # Verify kaggle_receipt_sync is not active and not jamming scheduler
    assert "kaggle_receipt_sync" not in job_ids


def test_scheduler_job_pause_resume(client):
    headers = _admin_headers(client)
    pause_res = client.post("/api/v1/scheduler/jobs/system_heartbeat/pause", headers=headers)
    assert pause_res.status_code == 200
    assert pause_res.json()["data"]["paused"] is True

    resume_res = client.post("/api/v1/scheduler/jobs/system_heartbeat/resume", headers=headers)
    assert resume_res.status_code == 200
    assert resume_res.json()["data"]["paused"] is False


def test_scheduler_job_not_found(client):
    res = client.post("/api/v1/scheduler/jobs/non_existent_job/pause", headers=_admin_headers(client))
    assert res.status_code == 404
