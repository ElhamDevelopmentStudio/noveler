from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.pronunciation import (
    PronunciationFindRequestSchema,
    PronunciationFindResponseSchema,
    PronunciationRuleCreateSchema,
    PronunciationRuleListResponse,
    PronunciationRuleResponseSchema,
)
from app.services.pronunciation import PronunciationService
from fastapi import APIRouter, Depends
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post(
    "/projects/{project_id}/pronunciation/find",
    response_model=ApiResponse[PronunciationFindResponseSchema],
    summary="Search occurrences of a word or phrase with before/after previews",
)
async def find_occurrences(
    project_id: str,
    dto: PronunciationFindRequestSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    occurrences = await PronunciationService.find_occurrences(project_id, dto, db)
    return ApiResponse(
        success=True,
        data=PronunciationFindResponseSchema(
            word=dto.word,
            replacement=dto.replacement,
            occurrences=occurrences,
            total_found=len(occurrences),
        ),
    )


@router.get(
    "/projects/{project_id}/pronunciation",
    response_model=ApiResponse[PronunciationRuleListResponse],
    summary="List all pronunciation rules for project",
)
async def list_rules(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    rules = await PronunciationService.get_project_rules(project_id, db)
    resp_rules = [PronunciationRuleResponseSchema.model_validate(r) for r in rules]
    return ApiResponse(
        success=True,
        data=PronunciationRuleListResponse(
            rules=resp_rules,
            total=len(resp_rules),
        ),
    )


@router.post(
    "/projects/{project_id}/pronunciation",
    response_model=ApiResponse[PronunciationRuleResponseSchema],
    summary="Save a pronunciation rule",
)
async def save_rule(
    project_id: str,
    dto: PronunciationRuleCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    rule = await PronunciationService.create_rule(project_id, dto, db)
    return ApiResponse(
        success=True,
        data=PronunciationRuleResponseSchema.model_validate(rule),
        message=f"Pronunciation rule for '{rule.phrase}' saved",
    )


@router.delete(
    "/projects/{project_id}/pronunciation/{rule_id}",
    response_model=ApiResponse[None],
    summary="Delete a pronunciation rule",
)
async def delete_rule(
    project_id: str,
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    await PronunciationService.delete_rule(project_id, rule_id, db)
    return ApiResponse(
        success=True,
        data=None,
        message="Pronunciation rule deleted",
    )
