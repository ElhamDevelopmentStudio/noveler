from typing import Any

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.sfx import SFXListResponse, SFXResponseSchema
from app.services.attachment import AttachmentService
from app.services.sfx import SFXService
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from novelova_core.exceptions import NotFoundError
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=ApiResponse[SFXListResponse])
async def list_sfx(
    project_id: str | None = Query(None, description="Project ID to include local project sounds alongside global sounds"),
    category: str | None = Query(None, description="Filter by category ('foley' or 'atmosphere')"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SFXListResponse]:
    """Retrieve sound effects belonging to the authenticated user."""
    items = await SFXService.list_sfx(
        user_id=current_user.id,
        project_id=project_id,
        category=category,
        db=db,
    )
    res_items = [SFXService.to_response(item) for item in items]
    return ApiResponse(
        data=SFXListResponse(items=res_items, total=len(res_items)),
        message="Sound effects retrieved successfully",
    )


@router.post("", response_model=ApiResponse[SFXResponseSchema])
async def create_sfx(
    name: str = Form(..., description="Display label for the sound effect"),
    category: str = Form("foley", description="'foley' for spot cue sounds, 'atmosphere' for ambient tracks"),
    is_global: bool = Form(True, description="True if available across all projects"),
    project_id: str | None = Form(None, description="Optional project ID if scoped to a single project"),
    default_volume: float = Form(1.0, description="Default playback volume multiplier (0.0 to 1.0)"),
    audio_file: UploadFile = File(..., description="Audio file (.wav, .mp3, .m4a, .ogg, .flac)"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SFXResponseSchema]:
    """Upload a new sound effect item."""
    item = await SFXService.create_sfx(
        user_id=current_user.id,
        name=name,
        audio_file=audio_file,
        category=category,
        is_global=is_global,
        project_id=project_id,
        default_volume=default_volume,
        db=db,
    )
    return ApiResponse(
        data=SFXService.to_response(item),
        message=f"Sound effect '{item.name}' created successfully",
    )


@router.get("/{sfx_id}", response_model=ApiResponse[SFXResponseSchema])
async def get_sfx(
    sfx_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SFXResponseSchema]:
    """Retrieve details of a specific sound effect item."""
    item = await SFXService.get_sfx_by_id(sfx_id, current_user.id, db)
    return ApiResponse(
        data=SFXService.to_response(item),
        message="Sound effect retrieved successfully",
    )


@router.patch("/{sfx_id}", response_model=ApiResponse[SFXResponseSchema])
async def update_sfx(
    sfx_id: str,
    name: str | None = Form(None),
    category: str | None = Form(None),
    is_global: bool | None = Form(None),
    default_volume: float | None = Form(None),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SFXResponseSchema]:
    """Update metadata, category, scope, or default volume of an SFX item."""
    item = await SFXService.update_sfx(
        sfx_id=sfx_id,
        user_id=current_user.id,
        name=name,
        category=category,
        is_global=is_global,
        default_volume=default_volume,
        db=db,
    )
    return ApiResponse(
        data=SFXService.to_response(item),
        message=f"Sound effect '{item.name}' updated successfully",
    )


@router.delete("/{sfx_id}", response_model=ApiResponse[dict[str, Any]])
async def delete_sfx(
    sfx_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, Any]]:
    """Delete a sound effect item and its associated storage assets."""
    await SFXService.delete_sfx(sfx_id, current_user.id, db)
    return ApiResponse(
        data={"deleted_id": sfx_id},
        message="Sound effect deleted successfully",
    )


@router.get("/storage/{key:path}")
async def get_stored_sfx_file(key: str) -> FileResponse:
    """Serve locally cached audio file when running in local development mode without R2."""
    local_path = AttachmentService.get_local_file_path(key)
    if not local_path.exists():
        raise NotFoundError("Sound effect asset not found in storage")
    return FileResponse(local_path)
