from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.character import (
    CharacterAliasSuggestionSchema,
    CharacterCreateSchema,
    CharacterListResponse,
    CharacterMergeSchema,
    CharacterResponseSchema,
    CharacterUpdateSchema,
)
from app.services.character import CharacterService
from fastapi import APIRouter, Depends
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get(
    "/projects/{project_id}/characters",
    response_model=ApiResponse[CharacterListResponse],
    summary="List characters for project",
)
async def list_project_characters(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    chars = await CharacterService.get_project_characters(project_id, db)
    # If no characters exist yet, auto-sync from segments if available
    if not chars:
        chars = await CharacterService.sync_characters_from_segments(project_id, db)

    resp_chars = [CharacterResponseSchema.model_validate(c) for c in chars]
    unassigned = sum(1 for c in resp_chars if not c.assigned_voice_id)

    return ApiResponse(
        success=True,
        data=CharacterListResponse(
            characters=resp_chars,
            total=len(resp_chars),
            unassigned_count=unassigned,
        ),
    )


@router.post(
    "/projects/{project_id}/characters",
    response_model=ApiResponse[CharacterResponseSchema],
    summary="Create character for project",
)
async def create_character(
    project_id: str,
    dto: CharacterCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    char = await CharacterService.create_character(project_id, dto, db)
    return ApiResponse(
        success=True,
        data=CharacterResponseSchema.model_validate(char),
        message=f"Character '{char.name}' created",
    )


@router.put(
    "/projects/{project_id}/characters/{character_id}",
    response_model=ApiResponse[CharacterResponseSchema],
    summary="Update character or override name with alias propagation",
)
async def update_character(
    project_id: str,
    character_id: str,
    dto: CharacterUpdateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    char = await CharacterService.update_character(project_id, character_id, dto, db)
    return ApiResponse(
        success=True,
        data=CharacterResponseSchema.model_validate(char),
        message=f"Character '{char.name}' updated",
    )


@router.post(
    "/projects/{project_id}/characters/set-defaults-by-gender",
    response_model=ApiResponse[list[CharacterResponseSchema]],
    summary="Assign default voices based on inferred gender",
)
async def set_defaults_by_gender(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    chars = await CharacterService.set_defaults_by_gender(project_id, db)
    return ApiResponse(
        success=True,
        data=[CharacterResponseSchema.model_validate(c) for c in chars],
        message="Default voices assigned by inferred gender",
    )


@router.post(
    "/projects/{project_id}/characters/reset-all",
    response_model=ApiResponse[list[CharacterResponseSchema]],
    summary="Reset all voice casting for project",
)
async def reset_all_cast(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    chars = await CharacterService.reset_all_cast(project_id, db)
    return ApiResponse(
        success=True,
        data=[CharacterResponseSchema.model_validate(c) for c in chars],
        message="Voice casting reset for all characters",
    )


@router.post(
    "/projects/{project_id}/characters/sync",
    response_model=ApiResponse[list[CharacterResponseSchema]],
    summary="Sync and aggregate characters from parsed dialogue segments",
)
async def sync_characters(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    chars = await CharacterService.sync_characters_from_segments(project_id, db)
    return ApiResponse(
        success=True,
        data=[CharacterResponseSchema.model_validate(c) for c in chars],
        message=f"Synced {len(chars)} characters from dialogue segments",
    )


@router.post(
    "/projects/{project_id}/characters/merge",
    response_model=ApiResponse[CharacterResponseSchema],
    summary="Merge redundant character into canonical character",
)
async def merge_characters(
    project_id: str,
    payload: CharacterMergeSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    char = await CharacterService.merge_characters(project_id, payload, db)
    return ApiResponse(
        success=True,
        data=CharacterResponseSchema.model_validate(char),
        message=f"Merged character into '{char.name}'",
    )


@router.get(
    "/projects/{project_id}/characters/alias-suggestions",
    response_model=ApiResponse[list[CharacterAliasSuggestionSchema]],
    summary="Get detected character alias merge candidates",
)
async def get_alias_suggestions(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    suggestions = await CharacterService.get_alias_suggestions(project_id, db)
    return ApiResponse(
        success=True,
        data=suggestions,
        message=f"Found {len(suggestions)} alias suggestions",
    )
