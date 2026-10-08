from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.chapter import (
    ChapterDetailResponse,
    ChapterSummaryResponse,
    ParseOptionsSchema,
    ParseResponse,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.chapter import ChapterService
from app.services.project import ProjectService
from fastapi import APIRouter, Depends, Query, status
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=ApiResponse[ProjectListResponse])
async def list_projects(
    search: str | None = Query(default=None, description="Search by title or author"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
    sort_by: str = Query(
        default="updated_at", description="Sort field: updated_at, created_at, title, author"
    ),
    sort_order: str = Query(default="desc", description="Sort order: asc, desc"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve list of projects with filter counts and pagination."""
    data = await ProjectService.list_projects(
        db=db,
        current_user=current_user,
        search=search,
        status=status_filter,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    return ApiResponse(
        data=data,
        message="Projects retrieved successfully",
    )


@router.post("", response_model=ApiResponse[ProjectResponse], status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project with optional manuscript and thumbnail."""
    project = await ProjectService.create_project(
        payload=payload,
        current_user=current_user,
        db=db,
    )
    return ApiResponse(
        data=ProjectService.project_to_response(project),
        message="Project created successfully",
    )


@router.get("/{project_id}", response_model=ApiResponse[ProjectResponse])
async def get_project(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve details for a single project."""
    project = await ProjectService.get_project_by_id(project_id, db)
    return ApiResponse(
        data=ProjectService.project_to_response(project),
        message="Project retrieved successfully",
    )


@router.put("/{project_id}", response_model=ApiResponse[ProjectResponse])
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update project details or attachments."""
    project = await ProjectService.update_project(
        project_id=project_id,
        payload=payload,
        db=db,
    )
    return ApiResponse(
        data=ProjectService.project_to_response(project),
        message="Project updated successfully",
    )


@router.delete("/{project_id}", response_model=ApiResponse[dict])
async def delete_project(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a project."""
    await ProjectService.delete_project(project_id, db)
    return ApiResponse(
        data={"deleted": True, "id": project_id},
        message="Project deleted successfully",
    )


@router.post("/{project_id}/parse", response_model=ApiResponse[ParseResponse])
async def parse_project(
    project_id: str,
    payload: ParseOptionsSchema = ParseOptionsSchema(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse manuscript into chapters and segments."""
    data = await ChapterService.parse_project(project_id, payload, db)
    return ApiResponse(
        data=data,
        message="Manuscript parsed successfully",
    )


@router.get("/{project_id}/chapters", response_model=ApiResponse[list[ChapterSummaryResponse]])
async def get_project_chapters(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get list of chapters for a project."""
    chapters = await ChapterService.get_project_chapters(project_id, db)
    return ApiResponse(
        data=chapters,
        message="Chapters retrieved successfully",
    )


@router.get(
    "/{project_id}/chapters/{chapter_id}", response_model=ApiResponse[ChapterDetailResponse]
)
async def get_chapter_detail(
    project_id: str,
    chapter_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get single chapter details with script segments."""
    data = await ChapterService.get_chapter_detail(project_id, chapter_id, db)
    return ApiResponse(
        data=data,
        message="Chapter details retrieved successfully",
    )
