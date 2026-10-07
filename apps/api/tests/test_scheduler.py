def test_scheduler_jobs_list(client):
    response = client.get("/api/v1/scheduler/jobs")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert isinstance(payload["data"], list)
    assert len(payload["data"]) >= 1
    job_ids = [job["id"] for job in payload["data"]]
    assert "system_heartbeat" in job_ids
