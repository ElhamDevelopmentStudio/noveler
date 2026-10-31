import json
from typing import Any

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.sfx import (
    ApplyFoleyResponseSchema,
    ApplyFoleySchema,
    ScanFoleyOccurrencesSchema,
    ScanFoleyResponseSchema,
    SFXListResponse,
    SFXResponseSchema,
)
from app.services.attachment import AttachmentService
from app.services.sfx import SFXService
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from novelova_core.exceptions import NotFoundError
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _parse_triggers(raw: str | None) -> list[str] | None:
    if raw is None:
        return None
    raw_str = raw.strip()
    if not raw_str:
        return []
    try:
        loaded = json.loads(raw_str)
        if isinstance(loaded, list):
            return [str(x).strip() for x in loaded if str(x).strip()]
    except Exception:
        pass
    return [t.strip() for t in raw_str.split(",") if t.strip()]


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
    triggers: str | None = Form(None, description="JSON array or comma-separated list of trigger sound cues"),
    audio_file: UploadFile = File(..., description="Audio file (.wav, .mp3, .m4a, .ogg, .flac)"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SFXResponseSchema]:
    """Upload a new sound effect item."""
    parsed_triggers = _parse_triggers(triggers) or []
    item = await SFXService.create_sfx(
        user_id=current_user.id,
        name=name,
        audio_file=audio_file,
        category=category,
        is_global=is_global,
        project_id=project_id,
        default_volume=default_volume,
        triggers=parsed_triggers,
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
    triggers: str | None = Form(None),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SFXResponseSchema]:
    """Update metadata, category, scope, triggers, or default volume of an SFX item."""
    parsed_triggers = _parse_triggers(triggers)
    item = await SFXService.update_sfx(
        sfx_id=sfx_id,
        user_id=current_user.id,
        name=name,
        category=category,
        is_global=is_global,
        default_volume=default_volume,
        triggers=parsed_triggers,
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


@router.post("/{sfx_id}/scan", response_model=ApiResponse[ScanFoleyResponseSchema])
async def scan_foley_occurrences(
    sfx_id: str,
    payload: ScanFoleyOccurrencesSchema,
    project_id: str = Query(..., description="Project ID to scan"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ScanFoleyResponseSchema]:
    """Scan novel segments for trigger words matching this Foley sound."""
    res = await SFXService.scan_foley_occurrences(
        sfx_id=sfx_id,
        project_id=project_id,
        user_id=current_user.id,
        triggers=payload.triggers,
        chapter_ids=payload.chapter_ids,
        db=db,
    )
    return ApiResponse(
        data=res,
        message=f"Found {res.total_matches} occurrences in project",
    )


@router.post("/{sfx_id}/apply", response_model=ApiResponse[ApplyFoleyResponseSchema])
async def apply_foley_to_novel(
    sfx_id: str,
    payload: ApplyFoleySchema,
    project_id: str = Query(..., description="Project ID to apply sound effect"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ApplyFoleyResponseSchema]:
    """Apply Foley sound effect to chosen segments or all matching trigger lines."""
    res = await SFXService.apply_foley_to_novel(
        sfx_id=sfx_id,
        project_id=project_id,
        user_id=current_user.id,
        action=payload.action,
        targets=payload.targets,
        triggers=payload.triggers,
        volume=payload.volume,
        db=db,
    )
    return ApiResponse(
        data=res,
        message=res.message,
    )


@router.get("/storage/{key:path}")
async def get_stored_sfx_file(key: str) -> FileResponse:
    """Serve locally cached audio file when running in local development mode without R2."""
    local_path = AttachmentService.get_local_file_path(key)
    if not local_path.exists():
        raise NotFoundError("Sound effect asset not found in storage")
    return FileResponse(local_path)
