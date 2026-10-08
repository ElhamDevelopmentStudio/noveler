from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.chapter import (
    ChapterDetailResponse,
    ChapterSummaryResponse,
    ParseOptionsSchema,
    ParseResponse,
)
from app.schemas.character import (
    BatchCastAssignRequest,
    CharacterResponse,
)
from app.schemas.production_job import StageBJobResponse
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.schemas.pronunciation import (
    PronunciationRuleCreate,
    PronunciationRuleResponse,
    PronunciationSearchRequest,
    PronunciationSearchResponse,
)
from app.services.chapter import ChapterService
from app.services.character import CharacterService
from app.services.project import ProjectService
from app.services.pronunciation import PronunciationService
from app.services.stage_b import StageBService
from fastapi import APIRouter, Depends, Query, status
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=ApiResponse[ProjectListResponse])
async def list_projects(
    search: str | None = Query(default=None, description="Search by title or author"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
    sort_by: str = Query(default="updated_at", description="Sort field: updated_at, created_at, title, author"),
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


@router.get("/{project_id}/chapters/{chapter_id}", response_model=ApiResponse[ChapterDetailResponse])
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


@router.get("/{project_id}/characters", response_model=ApiResponse[list[CharacterResponse]])
async def get_project_characters(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all discovered characters and their assigned voices."""
    chars = await CharacterService.get_project_characters(project_id, db)
    return ApiResponse(
        data=chars,
        message="Characters retrieved successfully",
    )


@router.post("/{project_id}/characters/batch-assign", response_model=ApiResponse[list[CharacterResponse]])
async def batch_assign_voices(
    project_id: str,
    payload: BatchCastAssignRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch assign voices to characters."""
    chars = await CharacterService.batch_assign_voices(project_id, payload, db)
    return ApiResponse(
        data=chars,
        message="Character voice assignments updated",
    )


@router.post("/{project_id}/characters/defaults-by-gender", response_model=ApiResponse[list[CharacterResponse]])
async def set_defaults_by_gender(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set default voices based on inferred gender."""
    chars = await CharacterService.set_defaults_by_gender(project_id, db)
    return ApiResponse(
        data=chars,
        message="Default voices assigned by inferred gender",
    )


@router.post("/{project_id}/pronunciation/search", response_model=ApiResponse[PronunciationSearchResponse])
async def search_pronunciation_occurrences(
    project_id: str,
    payload: PronunciationSearchRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search for phrase occurrences across the manuscript."""
    result = await PronunciationService.search_occurrences(project_id, payload, db)
    return ApiResponse(
        data=result,
        message="Pronunciation occurrences scanned successfully",
    )


@router.get("/{project_id}/pronunciation", response_model=ApiResponse[list[PronunciationRuleResponse]])
async def list_pronunciation_rules(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved pronunciation rules."""
    rules = await PronunciationService.list_rules(project_id, db)
    return ApiResponse(
        data=rules,
        message="Pronunciation rules retrieved successfully",
    )


@router.post("/{project_id}/pronunciation", response_model=ApiResponse[PronunciationRuleResponse])
async def save_pronunciation_rule(
    project_id: str,
    payload: PronunciationRuleCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a new pronunciation rule."""
    rule = await PronunciationService.save_rule(project_id, payload, db)
    return ApiResponse(
        data=rule,
        message="Pronunciation rule saved successfully",
    )


@router.get("/{project_id}/stage-b/status", response_model=ApiResponse[StageBJobResponse])
async def get_stage_b_status(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get active Stage B production job status."""
    job = await StageBService.get_or_create_stage_b_job(project_id, db)
    return ApiResponse(
        data=job,
        message="Stage B status retrieved successfully",
    )


@router.post("/{project_id}/stage-b/start", response_model=ApiResponse[StageBJobResponse])
async def start_stage_b(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start or resume Stage B attribution job."""
    job = await StageBService.start_stage_b_job(project_id, db)
    return ApiResponse(
        data=job,
        message="Stage B job is running",
    )


@router.post("/{project_id}/stage-b/stop", response_model=ApiResponse[StageBJobResponse])
async def stop_stage_b(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop active Stage B attribution job."""
    job = await StageBService.stop_stage_b_job(project_id, db)
    return ApiResponse(
        data=job,
        message="Stage B job stopped",
    )


@router.post("/{project_id}/stage-b/step", response_model=ApiResponse[StageBJobResponse])
async def step_stage_b(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simulate batch progression for Stage B attribution job."""
    job = await StageBService.step_stage_b_job(project_id, db)
    return ApiResponse(
        data=job,
        message="Stage B job advanced",
    )
