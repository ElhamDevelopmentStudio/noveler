from datetime import UTC, datetime

from app.api.deps import require_admin
from app.models.user import UserModel
from app.scheduler.manager import get_jobs_list, scheduler
from fastapi import APIRouter, Depends, HTTPException, status
from novelova_core.models import ApiResponse

router = APIRouter()


@router.get("/jobs", response_model=ApiResponse[list[dict]])
def list_scheduled_jobs(
    _: UserModel = Depends(require_admin),
):
    """List all registered scheduled jobs and their next execution time."""
    jobs = get_jobs_list()
    return ApiResponse(
        data=jobs,
        message=f"Found {len(jobs)} scheduled background jobs",
    )


@router.post("/jobs/{job_id}/trigger", response_model=ApiResponse[dict])
def trigger_job(
    job_id: str,
    _: UserModel = Depends(require_admin),
):
    """Trigger a scheduled job to run immediately."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scheduled job '{job_id}' not found",
        )
    job.modify(next_run_time=datetime.now(UTC))
    return ApiResponse(
        data={"job_id": job_id, "triggered": True},
        message=f"Job '{job.name}' triggered successfully",
    )


@router.post("/jobs/{job_id}/pause", response_model=ApiResponse[dict])
def pause_job(
    job_id: str,
    _: UserModel = Depends(require_admin),
):
    """Pause a scheduled job."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scheduled job '{job_id}' not found",
        )
    job.pause()
    return ApiResponse(
        data={"job_id": job_id, "paused": True},
        message=f"Job '{job.name}' paused successfully",
    )


@router.post("/jobs/{job_id}/resume", response_model=ApiResponse[dict])
def resume_job(
    job_id: str,
    _: UserModel = Depends(require_admin),
):
    """Resume a scheduled job."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scheduled job '{job_id}' not found",
        )
    job.resume()
    return ApiResponse(
        data={"job_id": job_id, "paused": False},
        message=f"Job '{job.name}' resumed successfully",
    )


@router.delete("/jobs/{job_id}", response_model=ApiResponse[dict])
def delete_job(
    job_id: str,
    _: UserModel = Depends(require_admin),
):
    """Delete/remove a scheduled job."""
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scheduled job '{job_id}' not found",
        )
    scheduler.remove_job(job_id)
    return ApiResponse(
        data={"job_id": job_id, "removed": True},
        message=f"Job '{job_id}' removed successfully",
    )
