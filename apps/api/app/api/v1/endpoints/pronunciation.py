from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.pronunciation import PronunciationRuleModel
from app.models.user import UserModel
from app.schemas.pronunciation import (
    PronunciationExtractRequestSchema,
    PronunciationExtractResponseSchema,
    PronunciationFindRequestSchema,
    PronunciationFindResponseSchema,
    PronunciationRuleCreateSchema,
    PronunciationRuleListResponse,
    PronunciationRuleResponseSchema,
    PronunciationRuleToggleSchema,
)
from app.services.pronunciation import PronunciationService
from app.services.pronunciation_extractor import PronunciationExtractorService
from fastapi import APIRouter, Depends
from novelova_core.exceptions import NotFoundError
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


@router.post(
    "/projects/{project_id}/pronunciation/extract",
    response_model=ApiResponse[PronunciationExtractResponseSchema],
    summary="Auto-extract pronunciation glossary suggestions using LLM",
)
async def extract_glossary(
    project_id: str,
    dto: PronunciationExtractRequestSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    res = await PronunciationExtractorService.extract_glossary(
        project_id=project_id,
        db=db,
        chapter_ids=dto.chapter_ids,
        sample_chapters=dto.sample_chapters,
        save_as_drafts=dto.save_as_drafts,
    )
    return ApiResponse(
        success=True,
        data=PronunciationExtractResponseSchema(**res),
        message=res["message"],
    )


@router.patch(
    "/projects/{project_id}/pronunciation/{rule_id}/toggle",
    response_model=ApiResponse[PronunciationRuleResponseSchema],
    summary="Activate or deactivate a pronunciation rule (e.g., approve draft)",
)
async def toggle_rule(
    project_id: str,
    rule_id: str,
    dto: PronunciationRuleToggleSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    rule = await db.get(PronunciationRuleModel, rule_id)
    if not rule or rule.project_id != project_id:
        raise NotFoundError(f"Pronunciation rule '{rule_id}' not found")
    rule.is_active = dto.is_active
    await db.commit()
    await db.refresh(rule)
    return ApiResponse(
        success=True,
        data=PronunciationRuleResponseSchema.model_validate(rule),
        message=f"Pronunciation rule '{rule.phrase}' {'activated' if rule.is_active else 'deactivated'}",
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
