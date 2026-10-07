from app.core.config import settings
from fastapi.testclient import TestClient


def get_auth_headers(client: TestClient) -> dict[str, str]:
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


def test_stage_b_lifecycle_and_simulation(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Stage B Attribution Project",
            "author": "Jin Sang-Min",
            "status": "in_production",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 2. Get Stage B status (auto-initializes realistic job)
    status_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/stage-b/status",
        headers=headers,
    )
    assert status_resp.status_code == 200
    job = status_resp.json()["data"]
    assert job["job_code"] == "126d4001"
    assert job["status"] == "running"
    assert job["current_batch"] == 13
    assert job["total_batches"] == 72
    assert job["records_processed"] == 1529
    assert job["total_records"] == 8400
    assert "Jin Sang-Min" in job["most_recent_step"]
    assert job["heartbeat_display"] is not None
    assert job["elapsed_display"] is not None

    # 3. Advance / step job by 1 batch
    step_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/stage-b/step",
        headers=headers,
    )
    assert step_resp.status_code == 200
    stepped_job = step_resp.json()["data"]
    assert stepped_job["current_batch"] == 14
    assert stepped_job["records_processed"] > 1529
    assert stepped_job["progress_percent"] > 18.2

    # 4. Stop job
    stop_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/stage-b/stop",
        headers=headers,
    )
    assert stop_resp.status_code == 200
    stopped_job = stop_resp.json()["data"]
    assert stopped_job["status"] == "stopped"
    assert stopped_job["current_operation"] == "Job stopped by user"

    # 5. Start / resume job
    start_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/stage-b/start",
        headers=headers,
    )
    assert start_resp.status_code == 200
    resumed_job = start_resp.json()["data"]
    assert resumed_job["status"] == "running"
    assert resumed_job["current_operation"] == "Attributing dialogue line..."
