import asyncio
from datetime import UTC, datetime
from typing import Any

from app.db.session import get_session_factory
from app.models.parse_job import ParseJobModel
from app.models.project import ProjectModel
from app.schemas.chapter import ParseOptionsSchema, FormatScriptSchema
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.parse_job")

ACTIVE_PARSE_TASKS: dict[str, asyncio.Task] = {}


def utc_now() -> datetime:
    return datetime.now(UTC)


class ParseJobService:
    @classmethod
    async def get_latest_job(
        cls,
        project_id: str,
        job_type: str = "parse",
        db: AsyncSession | None = None,
    ) -> ParseJobModel | None:
        """Fetch the most recent parse or format job for a project."""
        stmt = (
            select(ParseJobModel)
            .where(
                ParseJobModel.project_id == project_id,
                ParseJobModel.job_type == job_type,
            )
            .order_by(ParseJobModel.created_at.desc())
            .limit(1)
        )
        if db is not None:
            res = await db.execute(stmt)
            return res.scalar_one_or_none()

        factory = get_session_factory()
        async with factory() as session:
            res = await session.execute(stmt)
            return res.scalar_one_or_none()

    @classmethod
    async def start_parse_job(
        cls,
        project_id: str,
        options: ParseOptionsSchema,
        db: AsyncSession,
    ) -> ParseJobModel:
        """
        Enqueue an asynchronous manuscript parsing background job.
        Guarantees single-flight idempotency per project.
        Returns 202 Accepted job model immediately.
        """
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Check existing active job
        existing = await cls.get_latest_job(project_id, job_type="parse", db=db)
        if existing and existing.status in ("pending", "running"):
            task = ACTIVE_PARSE_TASKS.get(project_id)
            if task and not task.done():
                logger.info("Returning already active parse job %s for project %s", existing.id, project_id)
                return existing

        job = ParseJobModel(
            project_id=project_id,
            job_type="parse",
            status="pending",
            total_chapters=0,
            processed_chapters=0,
            total_segments=0,
            processed_segments=0,
            progress_percent=0.0,
            current_step="Manuscript parse queued...",
            started_at=utc_now(),
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        task = asyncio.create_task(
            cls._execute_parse_worker(job_id=job.id, project_id=project_id, options=options)
        )
        ACTIVE_PARSE_TASKS[project_id] = task

        return job

    @classmethod
    async def _execute_parse_worker(
        cls,
        job_id: str,
        project_id: str,
        options: ParseOptionsSchema,
    ) -> None:
        """Background worker that parses manuscript, batches DB inserts, and tracks progress."""
        from app.services.chapter import ChapterService

        factory = get_session_factory()

        async def update_progress(
            db: AsyncSession,
            processed_chapters: int,
            total_chapters: int,
            processed_segments: int,
            total_segments: int,
            progress_percent: float,
            current_step: str,
        ):
            j = await db.get(ParseJobModel, job_id)
            if j:
                j.processed_chapters = processed_chapters
                j.total_chapters = total_chapters
                j.processed_segments = processed_segments
                j.total_segments = total_segments
                j.progress_percent = round(progress_percent, 1)
                j.current_step = current_step
                await db.flush()

        try:
            async with factory() as db:
                job = await db.get(ParseJobModel, job_id)
                if not job:
                    return
                job.status = "running"
                job.started_at = utc_now()
                job.current_step = "Extracting text and identifying chapters..."
                await db.commit()

                await ChapterService.parse_project(
                    project_id=project_id,
                    options=options,
                    db=db,
                    progress_callback=update_progress,
                )

                j = await db.get(ParseJobModel, job_id)
                if j:
                    j.status = "completed"
                    j.progress_percent = 100.0
                    j.current_step = "Manuscript successfully parsed."
                    j.completed_at = utc_now()
                    await db.commit()
            logger.info("Background parse job %s for project %s completed successfully", job_id, project_id)

        except Exception as exc:
            logger.error("Background parse job %s failed: %s", job_id, exc, exc_info=True)
            async with factory() as db:
                j = await db.get(ParseJobModel, job_id)
                if j:
                    j.status = "failed"
                    j.error_message = str(exc)
                    j.completed_at = utc_now()
                    await db.commit()
        finally:
            ACTIVE_PARSE_TASKS.pop(project_id, None)

    @classmethod
    async def start_format_job(
        cls,
        project_id: str,
        options: FormatScriptSchema,
        db: AsyncSession,
    ) -> ParseJobModel:
        """
        Enqueue an asynchronous script formatting background job.
        Guarantees single-flight idempotency per project.
        """
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        existing = await cls.get_latest_job(project_id, job_type="format", db=db)
        if existing and existing.status in ("pending", "running"):
            task = ACTIVE_PARSE_TASKS.get(f"{project_id}_format")
            if task and not task.done():
                return existing

        job = ParseJobModel(
            project_id=project_id,
            job_type="format",
            status="pending",
            total_chapters=0,
            processed_chapters=0,
            total_segments=0,
            processed_segments=0,
            progress_percent=0.0,
            current_step="Script formatting queued...",
            started_at=utc_now(),
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        task = asyncio.create_task(
            cls._execute_format_worker(job_id=job.id, project_id=project_id, options=options)
        )
        ACTIVE_PARSE_TASKS[f"{project_id}_format"] = task

        return job

    @classmethod
    async def _execute_format_worker(
        cls,
        job_id: str,
        project_id: str,
        options: FormatScriptSchema,
    ) -> None:
        """Background worker that formats script segments and updates progress."""
        from app.services.chapter import ChapterService

        factory = get_session_factory()
        async with factory() as db:
            job = await db.get(ParseJobModel, job_id)
            if not job:
                return
            job.status = "running"
            job.started_at = utc_now()
            job.current_step = "Formatting script segments..."
            await db.commit()

        async def update_format_progress(
            db: AsyncSession,
            processed_chapters: int,
            total_chapters: int,
            formatted_segments: int,
            processed_segments: int,
            progress_percent: float,
            current_step: str,
        ):
            j = await db.get(ParseJobModel, job_id)
            if j:
                j.processed_chapters = processed_chapters
                j.total_chapters = total_chapters
                j.processed_segments = processed_segments
                j.progress_percent = round(progress_percent, 1)
                j.current_step = current_step
                await db.flush()

        try:
            async with factory() as db:
                await ChapterService.format_project_script(
                    project_id=project_id,
                    payload=options,
                    db=db,
                    progress_callback=update_format_progress,
                )

            async with factory() as db:
                j = await db.get(ParseJobModel, job_id)
                if j:
                    j.status = "completed"
                    j.progress_percent = 100.0
                    j.current_step = "Script formatted successfully."
                    j.completed_at = utc_now()
                    await db.commit()
            logger.info("Background format job %s for project %s completed", job_id, project_id)

        except Exception as exc:
            logger.error("Background format job %s failed: %s", job_id, exc, exc_info=True)
            async with factory() as db:
                j = await db.get(ParseJobModel, job_id)
                if j:
                    j.status = "failed"
                    j.error_message = str(exc)
                    j.completed_at = utc_now()
                    await db.commit()
        finally:
            ACTIVE_PARSE_TASKS.pop(f"{project_id}_format", None)
