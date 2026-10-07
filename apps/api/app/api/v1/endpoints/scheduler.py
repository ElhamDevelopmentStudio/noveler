from app.scheduler.manager import get_jobs_list, scheduler
from fastapi import APIRouter, HTTPException, status
from novelova_core.models import ApiResponse

router = APIRouter()


@router.get("/jobs", response_model=ApiResponse[list[dict]])
def list_scheduled_jobs():
    """List all registered scheduled jobs and their next execution time."""
    jobs = get_jobs_list()
    return ApiResponse(
        data=jobs,
        message=f"Found {len(jobs)} scheduled background jobs",
    )


@router.post("/jobs/{job_id}/trigger", response_model=ApiResponse[dict])
def trigger_job(job_id: str):
    """Trigger a scheduled job to run immediately."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scheduled job '{job_id}' not found",
        )
    job.modify(next_run_time=None)  # forces immediate run if supported or invoke directly
    # Call the job function directly in the event loop:
    job.func()
    return ApiResponse(
        data={"job_id": job_id, "triggered": True},
        message=f"Job '{job.name}' triggered successfully",
    )
