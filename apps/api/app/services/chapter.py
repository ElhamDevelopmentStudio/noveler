import uuid

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.project import ProjectModel
from app.schemas.chapter import (
    ChapterDetailResponse,
    ChapterSummaryResponse,
    ParseOptionsSchema,
    ParseResponse,
    ScriptSegmentResponse,
)
from app.services.parser import WORDS_PER_MINUTE, ManuscriptParserService
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.chapter")


class ChapterService:
    @staticmethod
    async def parse_project(
        project_id: str,
        options: ParseOptionsSchema,
        db: AsyncSession,
    ) -> ParseResponse:
        """Parse project manuscript into structured chapters and segments."""
        stmt = (
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(
                selectinload(ProjectModel.manuscript_attachment),
                selectinload(ProjectModel.chapters),
            )
        )
        result = await db.execute(stmt)
        project = result.scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project with ID '{project_id}' not found")

        # Delete any existing chapters/segments for clean re-parse
        await db.execute(delete(ChapterModel).where(ChapterModel.project_id == project_id))
        await db.flush()

        # Extract chapter data
        chapter_dicts = await ManuscriptParserService.get_project_chapter_data(project, options)

        total_words = 0
        created_chapters: list[ChapterModel] = []

        for idx, chap_data in enumerate(chapter_dicts):
            raw_text = chap_data["text"]
            words = len(raw_text.split())
            total_words += words
            duration_sec = max(60, int((words / WORDS_PER_MINUTE) * 60))

            chapter = ChapterModel(
                id=str(uuid.uuid4()),
                project_id=project.id,
                chapter_number=chap_data["number"],
                title=chap_data["title"],
                order_index=idx,
                word_count=words,
                estimated_duration_seconds=duration_sec,
                status="parsed",
            )
            db.add(chapter)
            await db.flush()

            # Segment the chapter text
            segments_data = ManuscriptParserService.segment_text(raw_text, options)
            for seg_idx, (seg_text, is_diag) in enumerate(segments_data):
                segment = ScriptSegmentModel(
                    id=str(uuid.uuid4()),
                    chapter_id=chapter.id,
                    order_index=seg_idx,
                    text=seg_text,
                    is_dialogue=is_diag,
                    speaker="Narrator" if not is_diag else None,
                    speaker_gender="narrator" if not is_diag else None,
                    emotion=None,
                    audio_status="pending",
                )
                db.add(segment)

            created_chapters.append(chapter)

        # Update project status
        project.status = "in_production"
        await db.commit()

        summaries = [ChapterSummaryResponse.model_validate(chap) for chap in created_chapters]

        logger.info(
            "Parsed project %s into %d chapters with %d total words",
            project_id,
            len(created_chapters),
            total_words,
        )

        return ParseResponse(
            project_id=project.id,
            status=project.status,
            total_chapters=len(created_chapters),
            total_words=total_words,
            chapters=summaries,
        )

    @staticmethod
    async def get_project_chapters(
        project_id: str,
        db: AsyncSession,
    ) -> list[ChapterSummaryResponse]:
        """Fetch all chapters for a given project."""
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index.asc())
        )
        result = await db.execute(stmt)
        chapters = result.scalars().all()
        if not chapters:
            proj_stmt = select(ProjectModel).where(ProjectModel.id == project_id)
            proj_res = await db.execute(proj_stmt)
            project = proj_res.scalar_one_or_none()
            if project and project.status != "ready_to_parse":
                parse_resp = await ChapterService.parse_project(
                    project_id, ParseOptionsSchema(), db
                )
                return parse_resp.chapters

        return [ChapterSummaryResponse.model_validate(c) for c in chapters]

    @staticmethod
    async def get_chapter_detail(
        project_id: str,
        chapter_id: str,
        db: AsyncSession,
    ) -> ChapterDetailResponse:
        """Fetch chapter with its script segments."""
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(selectinload(ChapterModel.segments))
        )
        result = await db.execute(stmt)
        chapter = result.scalar_one_or_none()
        if not chapter:
            raise NotFoundError(
                f"Chapter with ID '{chapter_id}' not found in project '{project_id}'"
            )

        segments = [
            ScriptSegmentResponse.model_validate(seg)
            for seg in sorted(chapter.segments, key=lambda s: s.order_index)
        ]

        return ChapterDetailResponse(
            id=chapter.id,
            project_id=chapter.project_id,
            chapter_number=chapter.chapter_number,
            title=chapter.title,
            order_index=chapter.order_index,
            word_count=chapter.word_count,
            estimated_duration_seconds=chapter.estimated_duration_seconds,
            status=chapter.status,
            created_at=chapter.created_at,
            updated_at=chapter.updated_at,
            segments=segments,
        )
