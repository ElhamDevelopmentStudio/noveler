def test_scheduler_jobs_list(client):
    response = client.get("/api/v1/scheduler/jobs")
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
    pause_res = client.post("/api/v1/scheduler/jobs/system_heartbeat/pause")
    assert pause_res.status_code == 200
    assert pause_res.json()["data"]["paused"] is True

    resume_res = client.post("/api/v1/scheduler/jobs/system_heartbeat/resume")
    assert resume_res.status_code == 200
    assert resume_res.json()["data"]["paused"] is False


def test_scheduler_job_not_found(client):
    res = client.post("/api/v1/scheduler/jobs/non_existent_job/pause")
    assert res.status_code == 404
