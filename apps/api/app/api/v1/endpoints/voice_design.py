from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.voice_design import (
    BuildDossiersRequestSchema,
    BuildDossiersResponseSchema,
    VoiceDesignJobListResponse,
    VoiceDesignJobResponseSchema,
    VoiceDesignRequestSchema,
)
from app.services.dossier import CharacterDossierService
from app.services.voice_design import VoiceDesignService
from fastapi import APIRouter, Depends, Query
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("/voice-design", response_model=ApiResponse[VoiceDesignJobResponseSchema], status_code=202)
async def create_voice_design_job(
    payload: VoiceDesignRequestSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceDesignJobResponseSchema]:
    """
    Launch a manual batched Kaggle Qwen3-TTS-12Hz-1.7B-VoiceDesign job for selected characters.
    Generated clips are registered in the Voice Collection with character name & VoiceDesign prompt description.
    """
    job = await VoiceDesignService.start_voice_design_job(
        payload=payload,
        user_id=current_user.id,
        db=db,
    )
    return ApiResponse(
        data=VoiceDesignJobResponseSchema.model_validate(job),
        message=f"VoiceDesign job enqueued for {job.total_characters} character(s)",
    )


@router.get("/voice-design/{job_id}", response_model=ApiResponse[VoiceDesignJobResponseSchema])
async def get_voice_design_job(
    job_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceDesignJobResponseSchema]:
    """Get real-time status and generated voice results for a VoiceDesign job."""
    job = await VoiceDesignService.get_job(job_id=job_id, user_id=current_user.id, db=db)
    return ApiResponse(
        data=VoiceDesignJobResponseSchema.model_validate(job),
        message="VoiceDesign job retrieved",
    )


@router.get(
    "/projects/{project_id}/voice-design/jobs",
    response_model=ApiResponse[VoiceDesignJobListResponse],
)
async def list_project_voice_design_jobs(
    project_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceDesignJobListResponse]:
    """List recent VoiceDesign jobs for a project."""
    jobs = await VoiceDesignService.list_project_jobs(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        limit=limit,
    )
    items = [VoiceDesignJobResponseSchema.model_validate(j) for j in jobs]
    return ApiResponse(
        data=VoiceDesignJobListResponse(jobs=items, total=len(items)),
        message="VoiceDesign jobs retrieved",
    )


@router.post(
    "/projects/{project_id}/characters/dossiers/generate",
    response_model=ApiResponse[BuildDossiersResponseSchema],
)
async def generate_character_dossiers(
    project_id: str,
    payload: BuildDossiersRequestSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[BuildDossiersResponseSchema]:
    """Build or refresh structured Character Dossiers (and VoiceDesign prompts) from tagged chapters."""
    result = await CharacterDossierService.build_project_dossiers(
        project_id=project_id,
        db=db,
        character_ids=payload.character_ids,
        refresh=payload.refresh,
        max_excerpts=payload.max_excerpts_per_character,
    )
    return ApiResponse(
        data=result,
        message=f"Generated {result.generated_count} character dossier(s) (skipped {result.skipped_count})",
    )
