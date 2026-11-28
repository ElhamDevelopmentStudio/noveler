from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.sfx_design import (
    ApplySfxPlanRequestSchema,
    ApplySfxPlanResponseSchema,
    SfxDesignJobListResponse,
    SfxDesignJobResponseSchema,
    SfxDesignRequestSchema,
)
from app.services.sfx_design import SfxDesignService
from fastapi import APIRouter, Depends, Query
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("/sfx-design", response_model=ApiResponse[SfxDesignJobResponseSchema], status_code=202)
async def create_sfx_design_job(
    payload: SfxDesignRequestSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SfxDesignJobResponseSchema]:
    """Launch a batched Kaggle TangoFlux (44.1kHz) job to generate Foley / Atmosphere audio assets."""
    job = await SfxDesignService.start_sfx_design_job(
        payload=payload,
        user_id=current_user.id,
        db=db,
    )
    return ApiResponse(
        data=SfxDesignJobResponseSchema.model_validate(job),
        message=f"SFX Design job enqueued for {job.total_items} sound effect(s)",
    )


@router.get("/sfx-design/{job_id}", response_model=ApiResponse[SfxDesignJobResponseSchema])
async def get_sfx_design_job(
    job_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SfxDesignJobResponseSchema]:
    """Get real-time status and generated SFX results for an SFX Design job."""
    job = await SfxDesignService.get_job(job_id=job_id, user_id=current_user.id, db=db)
    return ApiResponse(
        data=SfxDesignJobResponseSchema.model_validate(job),
        message="SFX Design job retrieved",
    )


@router.get(
    "/projects/{project_id}/sfx-design/jobs",
    response_model=ApiResponse[SfxDesignJobListResponse],
)
async def list_project_sfx_design_jobs(
    project_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SfxDesignJobListResponse]:
    """List recent TangoFlux SFX Design jobs for a project."""
    jobs = await SfxDesignService.list_project_jobs(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        limit=limit,
    )
    items = [SfxDesignJobResponseSchema.model_validate(j) for j in jobs]
    return ApiResponse(
        data=SfxDesignJobListResponse(jobs=items, total=len(items)),
        message="SFX Design jobs retrieved",
    )


@router.post(
    "/projects/{project_id}/sfx/apply-plan",
    response_model=ApiResponse[ApplySfxPlanResponseSchema],
)
async def apply_reviewed_sfx_plan(
    project_id: str,
    payload: ApplySfxPlanRequestSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ApplySfxPlanResponseSchema]:
    """Apply user-reviewed Foley cues and Atmosphere spans directly to script segments."""
    res = await SfxDesignService.apply_sfx_plan(
        project_id=project_id,
        user_id=current_user.id,
        payload=payload,
        db=db,
    )
    return ApiResponse(
        data=res,
        message=res.message,
    )
