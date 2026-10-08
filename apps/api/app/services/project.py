import math
from collections.abc import Sequence
from datetime import UTC, datetime

from app.models.project import STATUS_LABELS, ProjectModel, ProjectStatus
from app.models.user import UserModel
from app.schemas.project import (
    ProjectCounts,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.attachment import AttachmentService
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from novelova_core.models import PaginationMeta
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.project")


def utc_now() -> datetime:
    return datetime.now(UTC)


def infer_source_from_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    lower = filename.lower()
    if lower.endswith(".docx"):
        return "DOCX"
    if lower.endswith(".pdf"):
        return "PDF"
    if lower.endswith(".epub"):
        return "EPUB"
    if lower.endswith(".rtf"):
        return "RTF"
    if lower.endswith(".txt"):
        return "TXT"
    if lower.endswith(".md"):
        return "MD"
    parts = filename.rsplit(".", 1)
    if len(parts) > 1:
        return parts[1].upper()
    return None


class ProjectService:
    @staticmethod
    def project_to_response(project: ProjectModel) -> ProjectResponse:
        thumbnail_url: str | None = None
        if project.thumbnail_attachment:
            thumbnail_url = AttachmentService.get_presigned_url(project.thumbnail_attachment)

        manuscript_url: str | None = None
        manuscript_filename: str | None = None
        manuscript_size: int | None = None

        if project.manuscript_attachment:
            manuscript_url = AttachmentService.get_presigned_url(project.manuscript_attachment)
            manuscript_filename = project.manuscript_attachment.filename
            manuscript_size = project.manuscript_attachment.size

        status_label = STATUS_LABELS.get(project.status, project.status.replace("_", " ").title())

        return ProjectResponse(
            id=project.id,
            title=project.title,
            author=project.author,
            owner=project.owner,
            source=project.source,
            status=project.status,
            status_label=status_label,
            language=project.language,
            genre=project.genre,
            publication_date=project.publication_date,
            created_date=project.created_date,
            isbn=project.isbn,
            thumbnail_attachment_id=project.thumbnail_attachment_id,
            thumbnail_url=thumbnail_url,
            manuscript_attachment_id=project.manuscript_attachment_id,
            manuscript_filename=manuscript_filename,
            manuscript_size=manuscript_size,
            manuscript_url=manuscript_url,
            settings=project.settings or {},
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    @staticmethod
    async def list_projects(
        db: AsyncSession,
        current_user: UserModel,
        search: str | None = None,
        status: str | None = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 50,
    ) -> ProjectListResponse:
        """List and filter projects, returning status counts and paginated items."""
        # Calculate counts across all accessible projects
        base_query = select(ProjectModel)

        all_projects_result = await db.execute(base_query)
        all_projects = all_projects_result.scalars().all()

        counts = ProjectCounts(
            all=len(all_projects),
            in_production=sum(
                1 for p in all_projects if p.status == ProjectStatus.IN_PRODUCTION.value
            ),
            needs_review=sum(1 for p in all_projects if p.status == ProjectStatus.REVIEW.value),
            complete=sum(1 for p in all_projects if p.status == ProjectStatus.COMPLETE.value),
            ready_to_parse=sum(
                1 for p in all_projects if p.status == ProjectStatus.READY_TO_PARSE.value
            ),
        )

        # Build filtered query
        query = select(ProjectModel).options(
            selectinload(ProjectModel.thumbnail_attachment),
            selectinload(ProjectModel.manuscript_attachment),
        )

        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            query = query.where(
                or_(
                    func.lower(ProjectModel.title).like(term),
                    func.lower(ProjectModel.author).like(term),
                )
            )

        if status and status != "all":
            if status in ("review", "needs_review"):
                query = query.where(ProjectModel.status == ProjectStatus.REVIEW.value)
            elif status == "in_production":
                query = query.where(ProjectModel.status == ProjectStatus.IN_PRODUCTION.value)
            elif status == "complete":
                query = query.where(ProjectModel.status == ProjectStatus.COMPLETE.value)
            elif status == "ready_to_parse":
                query = query.where(ProjectModel.status == ProjectStatus.READY_TO_PARSE.value)
            else:
                query = query.where(ProjectModel.status == status)

        # Total filtered count
        count_query = select(func.count()).select_from(query.subquery())
        total_items = (await db.execute(count_query)).scalar() or 0

        # Sorting
        sort_column = getattr(ProjectModel, sort_by, ProjectModel.updated_at)
        if sort_order.lower() == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        # Pagination
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await db.execute(query)
        items: Sequence[ProjectModel] = result.scalars().all()

        total_pages = max(1, math.ceil(total_items / page_size)) if total_items > 0 else 1

        meta = PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

        return ProjectListResponse(
            items=[ProjectService.project_to_response(p) for p in items],
            counts=counts,
            meta=meta,
        )

    @staticmethod
    async def get_project_by_id(
        project_id: str,
        db: AsyncSession,
    ) -> ProjectModel:
        query = (
            select(ProjectModel)
            .options(
                selectinload(ProjectModel.thumbnail_attachment),
                selectinload(ProjectModel.manuscript_attachment),
            )
            .where(ProjectModel.id == project_id)
        )
        result = await db.execute(query)
        project = result.scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")
        return project

    @staticmethod
    async def create_project(
        payload: ProjectCreate,
        current_user: UserModel,
        db: AsyncSession,
    ) -> ProjectModel:
        # Claim attachments if supplied
        if payload.thumbnail_attachment_id:
            await AttachmentService.claim_attachment(payload.thumbnail_attachment_id, db)

        source = payload.source
        if payload.manuscript_attachment_id:
            manuscript = await AttachmentService.claim_attachment(
                payload.manuscript_attachment_id, db
            )
            if not source:
                source = infer_source_from_filename(manuscript.filename)

        author = payload.author or current_user.name
        owner = payload.owner or current_user.handle

        project = ProjectModel(
            title=payload.title,
            author=author,
            owner=owner,
            source=source,
            status=payload.status or ProjectStatus.IN_PRODUCTION.value,
            language=payload.language,
            genre=payload.genre,
            publication_date=payload.publication_date,
            created_date=payload.created_date or utc_now().strftime("%Y-%m-%d"),
            isbn=payload.isbn,
            thumbnail_attachment_id=payload.thumbnail_attachment_id,
            manuscript_attachment_id=payload.manuscript_attachment_id,
            user_id=current_user.id,
        )

        db.add(project)
        await db.flush()
        logger.info("Created project: %s (id: %s)", project.title, project.id)
        return await ProjectService.get_project_by_id(project.id, db)

    @staticmethod
    async def update_project(
        project_id: str,
        payload: ProjectUpdate,
        db: AsyncSession,
    ) -> ProjectModel:
        project = await ProjectService.get_project_by_id(project_id, db)

        if payload.title is not None:
            project.title = payload.title
        if payload.author is not None:
            project.author = payload.author
        if payload.owner is not None:
            project.owner = payload.owner
        if payload.source is not None:
            project.source = payload.source
        if payload.status is not None:
            project.status = payload.status
        if payload.language is not None:
            project.language = payload.language
        if payload.genre is not None:
            project.genre = payload.genre
        if payload.publication_date is not None:
            project.publication_date = payload.publication_date
        if payload.created_date is not None:
            project.created_date = payload.created_date
        if payload.isbn is not None:
            project.isbn = payload.isbn

        if payload.thumbnail_attachment_id is not None:
            if payload.thumbnail_attachment_id == "":
                project.thumbnail_attachment_id = None
                project.thumbnail_attachment = None
            else:
                await AttachmentService.claim_attachment(payload.thumbnail_attachment_id, db)
                project.thumbnail_attachment_id = payload.thumbnail_attachment_id

        if payload.manuscript_attachment_id is not None:
            if payload.manuscript_attachment_id == "":
                project.manuscript_attachment_id = None
                project.manuscript_attachment = None
            else:
                manuscript = await AttachmentService.claim_attachment(
                    payload.manuscript_attachment_id, db
                )
                project.manuscript_attachment_id = payload.manuscript_attachment_id
                if not project.source:
                    project.source = infer_source_from_filename(manuscript.filename)

        project.updated_at = utc_now()
        await db.flush()
        logger.info("Updated project: %s (id: %s)", project.title, project.id)
        return await ProjectService.get_project_by_id(project.id, db)

    @staticmethod
    async def delete_project(
        project_id: str,
        db: AsyncSession,
    ) -> None:
        project = await ProjectService.get_project_by_id(project_id, db)
        await db.delete(project)
        await db.flush()
        logger.info("Deleted project: %s (id: %s)", project.title, project_id)
