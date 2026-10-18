from typing import Any

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.voice import VoiceListResponse, VoiceResponseSchema
from app.services.attachment import AttachmentService
from app.services.voice import VoiceService
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from novelova_core.exceptions import NotFoundError
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=ApiResponse[VoiceListResponse])
async def list_voices(
    project_id: str | None = Query(None, description="Project ID to include local project voices alongside global voices"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceListResponse]:
    """Retrieve all global voices and any project-specific voices belonging to the authenticated user."""
    voices = await VoiceService.list_voices(
        user_id=current_user.id,
        project_id=project_id,
        db=db,
    )
    items = [VoiceService.to_response(v) for v in voices]
    return ApiResponse(
        data=VoiceListResponse(voices=items, total=len(items)),
        message="Voices retrieved successfully",
    )


@router.post("", response_model=ApiResponse[VoiceResponseSchema])
async def create_voice(
    name: str = Form(..., description="Display name for the voice"),
    gender: str = Form("neutral", description="male, female, or neutral"),
    is_global: bool = Form(True, description="True if available across all projects"),
    project_id: str | None = Form(None, description="Optional project ID if scoped to single project"),
    reference_text: str | None = Form(None, description="Optional transcript of the audio sample"),
    audio_file: UploadFile = File(..., description="Reference audio file (.wav, .mp3, .m4a)"),
    avatar_file: UploadFile | None = File(None, description="Optional voice avatar image"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceResponseSchema]:
    """Upload a new reference voice sample with optional avatar and scope settings."""
    voice = await VoiceService.create_voice(
        user_id=current_user.id,
        name=name,
        audio_file=audio_file,
        gender=gender,
        is_global=is_global,
        project_id=project_id,
        reference_text=reference_text,
        avatar_file=avatar_file,
        db=db,
    )
    return ApiResponse(
        data=VoiceService.to_response(voice),
        message=f"Voice '{voice.name}' created successfully",
    )


@router.get("/{voice_id}", response_model=ApiResponse[VoiceResponseSchema])
async def get_voice(
    voice_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceResponseSchema]:
    """Get details of a specific voice."""
    voice = await VoiceService.get_voice_by_id(voice_id, current_user.id, db)
    return ApiResponse(
        data=VoiceService.to_response(voice),
        message="Voice retrieved successfully",
    )


@router.patch("/{voice_id}", response_model=ApiResponse[VoiceResponseSchema])
async def update_voice(
    voice_id: str,
    name: str | None = Form(None),
    gender: str | None = Form(None),
    is_global: bool | None = Form(None),
    reference_text: str | None = Form(None),
    avatar_file: UploadFile | None = File(None),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[VoiceResponseSchema]:
    """Update metadata, scope, transcript, or avatar of a voice."""
    voice = await VoiceService.update_voice(
        voice_id=voice_id,
        user_id=current_user.id,
        name=name,
        gender=gender,
        is_global=is_global,
        reference_text=reference_text,
        avatar_file=avatar_file,
        db=db,
    )
    return ApiResponse(
        data=VoiceService.to_response(voice),
        message=f"Voice '{voice.name}' updated successfully",
    )


@router.delete("/{voice_id}", response_model=ApiResponse[dict[str, Any]])
async def delete_voice(
    voice_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, Any]]:
    """Delete a custom voice and its associated storage assets."""
    await VoiceService.delete_voice(voice_id, current_user.id, db)
    return ApiResponse(
        data={"deleted_id": voice_id},
        message="Voice deleted successfully",
    )


@router.get("/storage/{key:path}")
async def get_stored_voice_file(key: str) -> FileResponse:
    """Serve locally cached audio or avatar file when running in local development mode without R2."""
    local_path = AttachmentService.get_local_file_path(key)
    if not local_path.exists():
        raise NotFoundError("Voice asset not found in storage")
    return FileResponse(local_path)
