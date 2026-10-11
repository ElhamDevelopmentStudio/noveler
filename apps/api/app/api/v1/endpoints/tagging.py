import json

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.tagging_job import TaggingJobRequest, TaggingJobResponse
from app.services.tagger import StageBTaggingService
from fastapi import APIRouter, Depends, Response, status
from novelova_core.exceptions import NotFoundError
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
    payload: TaggingJobRequest | None = None,
    resume: bool = True,
    allow_offline_heuristic: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Launch asynchronous dialogue tagging in the background queue.
    Supports partial tagging for specific chapter_ids, chapter ranges, or full novel.
    Immediately returns 202 Accepted with the job tracking metadata.
    """
    req_resume = payload.resume if payload is not None else resume
    req_allow_offline = payload.allow_offline_heuristic if payload is not None else allow_offline_heuristic
    req_force = payload.force if payload is not None else False
    req_chapter_ids = payload.chapter_ids if payload is not None else None
    req_start_chapter = payload.start_chapter if payload is not None else None
    req_end_chapter = payload.end_chapter if payload is not None else None

    job = await StageBTaggingService.start_tagging_job(
        project_id=project_id,
        db=db,
        resume=req_resume,
        force=req_force,
        allow_offline_heuristic=req_allow_offline,
        chapter_ids=req_chapter_ids,
        start_chapter=req_start_chapter,
        end_chapter=req_end_chapter,
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


@router.get(
    "/projects/{project_id}/tag/history",
    response_model=ApiResponse[list[TaggingJobResponse]],
    summary="Get all historical Stage B tagging jobs for project",
)
async def get_tagging_history(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Query full history of tagging jobs, ordered newest to oldest,
    including scope (full novel, chapter range, or single chapter) and metrics.
    """
    jobs = await StageBTaggingService.get_job_history(project_id, db)
    return ApiResponse(
        success=True,
        data=[TaggingJobResponse.model_validate(j) for j in jobs],
        message="Tagging jobs history retrieved",
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


@router.get(
    "/projects/{project_id}/tag/report/download",
    summary="Download JSON status report of a tagging job",
)
async def download_tagging_report(
    project_id: str,
    job_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Download a structured JSON status report of an LLM run.
    If job_id is provided, downloads that specific job's report, otherwise downloads the latest.
    """
    if job_id:
        job = await StageBTaggingService.get_job_by_id(job_id, db)
    else:
        job = await StageBTaggingService.get_latest_job(project_id, db)

    if not job or not job.llm_report:
        raise NotFoundError("No tagging report found for this job.")

    report_json = json.dumps(job.llm_report, indent=2)
    filename = f"novelova_tagging_report_{job.id[:8]}.json"
    return Response(
        content=report_json,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
