from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.tagging_job import TaggingJobResponse
from app.services.tagger import StageBTaggingService
from fastapi import APIRouter, Depends, status
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post(
    "/projects/{project_id}/tag",
    response_model=ApiResponse[TaggingJobResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue asynchronous Stage B dialogue attribution job",
)
async def enqueue_tag_project(
    project_id: str,
    resume: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Launch asynchronous dialogue tagging in the background queue.
    Immediately returns 202 Accepted with the job tracking metadata.
    """
    job = await StageBTaggingService.start_tagging_job(
        project_id=project_id,
        db=db,
        resume=resume,
    )
    return ApiResponse(
        success=True,
        data=TaggingJobResponse.model_validate(job),
        message="Stage B tagging job enqueued in background scheduler queue",
    )


@router.get(
    "/projects/{project_id}/tag/status",
    response_model=ApiResponse[TaggingJobResponse | None],
    summary="Get current or latest Stage B tagging job status",
)
async def get_tagging_status(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Query real-time status, percentage progress, ETA, and errors of the tagging job.
    """
    job = await StageBTaggingService.get_latest_job(project_id, db)
    return ApiResponse(
        success=True,
        data=TaggingJobResponse.model_validate(job) if job else None,
        message="Latest tagging job status retrieved",
    )


@router.post(
    "/projects/{project_id}/tag/cancel",
    response_model=ApiResponse[TaggingJobResponse],
    summary="Cancel active Stage B dialogue tagging job",
)
async def cancel_tagging_job(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Cancel an active background tagging job for this project.
    """
    job = await StageBTaggingService.cancel_job(project_id, db)
    return ApiResponse(
        success=True,
        data=TaggingJobResponse.model_validate(job),
        message="Stage B tagging job cancelled",
    )
