from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.chapter import (
    BatchAtmosphereSchema,
    BatchAudioLaneSchema,
    BatchAudioStatusResponse,
    CancelBatchAudioResponse,
    ChapterAudioStreamResponse,
    ChapterDetailResponse,
    ChapterGenerateAudioResponse,
    ChapterGenerateAudioSchema,
    ChapterPreflightAudioRequest,
    ChapterPreflightAudioResponse,
    ChapterSummaryResponse,
    ChapterCreateSchema,
    ChapterUpdateSchema,
    ChapterReorderSchema,
    ChapterTextSaveSchema,
    FormatScriptResponse,
    FormatScriptSchema,
    GenerateBatchAudioResponse,
    GenerateBatchAudioSchema,
    ParseOptionsSchema,
    ParseResponse,
    ScriptSegmentMergeSchema,
    ScriptSegmentResponse,
    ScriptSegmentSplitSchema,
    ScriptSegmentUpdateSchema,
    SegmentRegenerateAudioResponse,
    SegmentRegenerateAudioSchema,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectSettingsUpdate,
    ProjectUpdate,
    RawContentResponse,
    UrlImportRequest,
    UrlImportResponse,
)
from app.schemas.telegram import (
    TelegramSendChapterRequest,
    TelegramSendChapterResponse,
)
from app.models.chapter import ChapterModel
from app.services.chapter import ChapterService
from app.services.kaggle_worker import presign_r2_url_or_key
from app.services.project import ProjectService
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import RedirectResponse, StreamingResponse
from novelova_core.exceptions import NotFoundError
from novelova_core.models import ApiResponse
from sqlalchemy import select
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


@router.patch("/{project_id}/settings", response_model=ApiResponse[ProjectResponse])
async def update_project_settings(
    project_id: str,
    payload: ProjectSettingsUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update project settings such as paralinguistic tag toggles."""
    project = await ProjectService.get_project_by_id(project_id, db)
    current_settings = dict(project.settings or {})
    if payload.paralinguistic_tags_enabled is not None:
        current_settings["paralinguistic_tags_enabled"] = payload.paralinguistic_tags_enabled
    if payload.active_paralinguistic_tags is not None:
        active = dict(current_settings.get("active_paralinguistic_tags", {}))
        active.update(payload.active_paralinguistic_tags)
        current_settings["active_paralinguistic_tags"] = active
    project.settings = current_settings
    await db.commit()
    await db.refresh(project)
    return ApiResponse(
        data=ProjectService.project_to_response(project),
        message="Project settings updated successfully",
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


@router.get("/{project_id}/export")
async def export_project_raw(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export raw project archive containing LLM system prompt context,
    dramatis personae, pronunciation glossary, chapter scripts (.md / .jsonl),
    concatenated full script, and original manuscript attachment.
    """
    zip_buf, archive_name = await ProjectService.export_project_archive(project_id, db)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
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


@router.post("/{project_id}/format", response_model=ApiResponse[FormatScriptResponse])
async def format_project_script(
    project_id: str,
    payload: FormatScriptSchema = FormatScriptSchema(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Format and clean existing project script segments in-place.
    Applies audio number conversions, punctuation spacing, and whitespace cleanup
    while preserving 100% of character attributions, emotions, and delivery modes.
    """
    data = await ChapterService.format_project_script(project_id, payload, db)
    return ApiResponse(
        data=data,
        message="Script formatted successfully",
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


@router.post(
    "/{project_id}/chapters",
    response_model=ApiResponse[ChapterDetailResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_chapter(
    project_id: str,
    payload: ChapterCreateSchema = ChapterCreateSchema(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new chapter in the project."""
    data = await ChapterService.create_chapter(project_id, payload, db)
    return ApiResponse(
        data=data,
        message="Chapter created successfully",
    )


@router.patch(
    "/{project_id}/chapters/reorder",
    response_model=ApiResponse[list[ChapterSummaryResponse]],
)
async def reorder_chapters(
    project_id: str,
    payload: ChapterReorderSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reorder chapters in the project."""
    data = await ChapterService.reorder_chapters(project_id, payload, db)
    return ApiResponse(
        data=data,
        message="Chapters reordered successfully",
    )


@router.patch(
    "/{project_id}/chapters/{chapter_id}",
    response_model=ApiResponse[ChapterDetailResponse],
)
async def update_chapter(
    project_id: str,
    chapter_id: str,
    payload: ChapterUpdateSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update chapter metadata (e.g. title)."""
    data = await ChapterService.update_chapter(project_id, chapter_id, payload, db)
    return ApiResponse(
        data=data,
        message="Chapter updated successfully",
    )


@router.delete(
    "/{project_id}/chapters/{chapter_id}",
    response_model=ApiResponse[None],
)
async def delete_chapter(
    project_id: str,
    chapter_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a chapter."""
    await ChapterService.delete_chapter(project_id, chapter_id, db)
    return ApiResponse(
        data=None,
        message="Chapter deleted successfully",
    )


@router.post(
    "/{project_id}/chapters/{chapter_id}/text",
    response_model=ApiResponse[ChapterDetailResponse],
)
async def save_chapter_text(
    project_id: str,
    chapter_id: str,
    payload: ChapterTextSaveSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save/update chapter text content directly into script segments."""
    data = await ChapterService.save_chapter_text(project_id, chapter_id, payload, db)
    return ApiResponse(
        data=data,
        message="Chapter text saved successfully",
    )


@router.get(
    "/{project_id}/chapters/{chapter_id}/audio-stream",
    response_model=ApiResponse[ChapterAudioStreamResponse],
)
async def get_chapter_audio_stream(
    project_id: str,
    chapter_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve chapter audio stream info and timecode alignments for studio playback and karaoke sync."""
    data = await ChapterService.get_chapter_audio_stream(project_id, chapter_id, db)
    return ApiResponse(
        data=data,
        message="Chapter audio stream retrieved successfully",
    )


@router.get(
    "/{project_id}/chapters/{chapter_id}/audio-content",
)
async def get_chapter_audio_content(
    project_id: str,
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Redirect to authenticated presigned audio stream for chapter."""
    chapter = (
        await db.execute(
            select(ChapterModel).where(
                ChapterModel.id == chapter_id, ChapterModel.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if not chapter or not chapter.audio_url:
        raise NotFoundError("Chapter audio not found or not synthesized yet")

    presigned = presign_r2_url_or_key(chapter.audio_url)
    if not presigned:
        raise NotFoundError("Could not resolve authenticated chapter audio stream")

    return RedirectResponse(url=presigned, status_code=302)


@router.get(
    "/{project_id}/segments/{segment_id}/audio-content",
)
async def get_segment_audio_content(
    project_id: str,
    segment_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Redirect to authenticated presigned audio take for segment."""
    presigned = presign_r2_url_or_key(f"projects/{project_id}/audio/takes/{segment_id}.wav")
    if not presigned:
        raise NotFoundError(f"Audio take for segment '{segment_id}' not found")

    return RedirectResponse(url=presigned, status_code=302)


@router.post(
    "/{project_id}/chapters/{chapter_id}/preflight-audio",
    response_model=ApiResponse[ChapterPreflightAudioResponse],
)
async def preflight_chapter_audio(
    project_id: str,
    chapter_id: str,
    payload: ChapterPreflightAudioRequest = ChapterPreflightAudioRequest(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Inspect model dataset cache status and determine if user confirmation is required."""
    data = await ChapterService.preflight_audio(
        project_id=project_id,
        chapter_id=chapter_id,
        user_id=current_user.id,
        payload=payload,
        db=db,
    )
    return ApiResponse(
        data=data,
        message=data.message,
    )


@router.post(
    "/{project_id}/chapters/{chapter_id}/generate-audio",
    response_model=ApiResponse[ChapterGenerateAudioResponse],
)
async def generate_chapter_audio(
    project_id: str,
    chapter_id: str,
    payload: ChapterGenerateAudioSchema = ChapterGenerateAudioSchema(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initiate audio synthesis for a chapter on Kaggle GPU worker with quota and pool verification."""
    data = await ChapterService.generate_chapter_audio(
        project_id=project_id,
        chapter_id=chapter_id,
        user_id=current_user.id,
        payload=payload,
        db=db,
    )
    return ApiResponse(
        data=data,
        message=data.message,
    )


@router.post(
    "/{project_id}/chapters/{chapter_id}/reset-audio",
    response_model=ApiResponse[ChapterDetailResponse],
)
async def reset_chapter_audio(
    project_id: str,
    chapter_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reset chapter audio and clear generation status back to parsed."""
    data = await ChapterService.reset_chapter_audio(project_id, chapter_id, db)
    return ApiResponse(
        data=data,
        message="Chapter audio reset successfully",
    )


@router.post(
    "/{project_id}/generate-batch-audio",
    response_model=ApiResponse[GenerateBatchAudioResponse],
)
async def generate_batch_audio(
    project_id: str,
    payload: GenerateBatchAudioSchema = GenerateBatchAudioSchema(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partition chapters across available Kaggle accounts into concurrent lanes and launch batch synthesis."""
    data = await ChapterService.generate_batch_audio(
        project_id=project_id,
        user=current_user,
        payload=payload,
        db=db,
    )
    return ApiResponse(
        data=data,
        message=data.message,
    )


@router.get(
    "/{project_id}/batch-audio-status",
    response_model=ApiResponse[BatchAudioStatusResponse],
)
async def get_batch_audio_status(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll multi-account lane progress and overall batch audio synthesis status."""
    data = await ChapterService.get_batch_audio_status(project_id=project_id, db=db)
    return ApiResponse(
        data=data,
        message="Batch audio status retrieved successfully",
    )


@router.post(
    "/{project_id}/cancel-batch-audio",
    response_model=ApiResponse[CancelBatchAudioResponse],
)
async def cancel_batch_audio(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel in-flight batch synthesis lanes and release in-use Kaggle accounts."""
    data = await ChapterService.cancel_batch_audio(project_id=project_id, db=db)
    return ApiResponse(
        data=data,
        message=data.message,
    )


@router.post(
    "/{project_id}/chapters/{chapter_id}/send-telegram",
    response_model=ApiResponse[TelegramSendChapterResponse],
)
async def send_chapter_to_telegram(
    project_id: str,
    chapter_id: str,
    payload: TelegramSendChapterRequest = TelegramSendChapterRequest(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deliver chapter audio directly to user's verified Telegram chat or channel."""
    data = await ChapterService.deliver_chapter_to_telegram(
        project_id=project_id,
        chapter_id=chapter_id,
        user=current_user,
        force_preview=payload.force_preview,
        db=db,
    )
    if not current_user.telegram_enabled:
        current_user.telegram_enabled = True
        await db.commit()

    return ApiResponse(
        data=data,
        message=data.message,
    )



@router.patch(
    "/{project_id}/segments/{segment_id}",
    response_model=ApiResponse[ScriptSegmentResponse],
)
async def update_segment(
    project_id: str,
    segment_id: str,
    payload: ScriptSegmentUpdateSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a script segment (text, speaker, delivery_type, emotion, etc.)."""
    data = await ChapterService.update_segment(project_id, segment_id, payload, db)
    return ApiResponse(
        data=data,
        message="Segment updated successfully",
    )


@router.post(
    "/{project_id}/segments/batch-atmosphere",
    response_model=ApiResponse[list[ScriptSegmentResponse]],
)
async def batch_set_atmosphere(
    project_id: str,
    payload: BatchAtmosphereSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply or clear atmosphere ambience across multiple script segments."""
    data = await ChapterService.batch_set_atmosphere(project_id, payload, db)
    return ApiResponse(
        data=data,
        message=f"Atmosphere updated for {len(data)} segment(s)",
    )


@router.post(
    "/{project_id}/segments/{segment_id}/regenerate-audio",
    response_model=ApiResponse[SegmentRegenerateAudioResponse],
)
async def regenerate_segment_audio(
    project_id: str,
    segment_id: str,
    payload: SegmentRegenerateAudioSchema = SegmentRegenerateAudioSchema(),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Surgically synthesize an isolated audio take for a single script segment."""
    data = await ChapterService.regenerate_segment_audio(
        project_id, segment_id, payload, db, user_id=current_user.id
    )
    return ApiResponse(
        data=data,
        message=data.message,
    )


@router.post(
    "/{project_id}/segments/{segment_id}/split",
    response_model=ApiResponse[list[ScriptSegmentResponse]],
)
async def split_segment(
    project_id: str,
    segment_id: str,
    payload: ScriptSegmentSplitSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Split a segment into two segments at the given character index."""
    data = await ChapterService.split_segment(project_id, segment_id, payload, db)
    return ApiResponse(
        data=data,
        message="Segment split successfully",
    )


@router.post(
    "/{project_id}/segments/{segment_id}/merge",
    response_model=ApiResponse[ScriptSegmentResponse],
)
async def merge_segment(
    project_id: str,
    segment_id: str,
    payload: ScriptSegmentMergeSchema,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge a segment with its previous or next adjacent segment."""
    data = await ChapterService.merge_segment(project_id, segment_id, payload, db)
    return ApiResponse(
        data=data,
        message="Segments merged successfully",
    )


@router.get(
    "/{project_id}/raw-content",
    response_model=ApiResponse[RawContentResponse],
)
async def get_raw_manuscript_content(
    project_id: str,
    offset: int = Query(default=0, ge=0, description="Character offset in manuscript"),
    limit: int = Query(default=150000, ge=10, le=500000, description="Chunk size in characters"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream/chunk raw unparsed manuscript content for fast, responsive infinite scrolling."""
    data = await ProjectService.get_raw_manuscript_chunk(
        project_id=project_id,
        offset=offset,
        limit=limit,
        db=db,
    )
    return ApiResponse(
        data=data,
        message="Raw manuscript content retrieved successfully",
    )


@router.post(
    "/{project_id}/import-url",
    response_model=ApiResponse[UrlImportResponse],
)
async def import_project_url(
    project_id: str,
    payload: UrlImportRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch text from a web URL for importing into project chapters."""
    text, title = await ProjectService.import_text_from_url(payload.url)
    return ApiResponse(
        data=UrlImportResponse(url=payload.url, title=title, text=text),
        message="Text imported from URL successfully",
    )


