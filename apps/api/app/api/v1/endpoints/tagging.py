from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.services.tagger import StageBTaggingService
from fastapi import APIRouter, Depends
from novelova_core.models import ApiResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


class TaggingSummaryResponse(BaseModel):
    project_id: str
    chapters_tagged: int
    total_segments_tagged: int
    total_characters: int


@router.post(
    "/projects/{project_id}/tag",
    response_model=ApiResponse[TaggingSummaryResponse],
    summary="Run Stage B dialogue attribution and tagging for project",
)
async def tag_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    summary = await StageBTaggingService.tag_project(project_id, db)
    return ApiResponse(
        success=True,
        data=TaggingSummaryResponse(**summary),
        message=f"Stage B tagging completed: {summary['total_segments_tagged']} segments processed",
    )


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/tag",
    response_model=ApiResponse[dict],
    summary="Run Stage B tagging for a specific chapter",
)
async def tag_chapter(
    project_id: str,
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    tagged_count = await StageBTaggingService.tag_chapter_segments(chapter_id, db)
    return ApiResponse(
        success=True,
        data={"chapter_id": chapter_id, "segments_tagged": tagged_count},
        message=f"Chapter tagging completed: {tagged_count} segments processed",
    )
