import uuid

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.schemas.chapter import (
    ChapterDetailResponse,
    ChapterSummaryResponse,
    ParseOptionsSchema,
    ParseResponse,
    ScriptSegmentMergeSchema,
    ScriptSegmentResponse,
    ScriptSegmentSplitSchema,
    ScriptSegmentUpdateSchema,
)
from app.services.parser import WORDS_PER_MINUTE, ManuscriptParserService
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import delete, select, update
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

            batch_num = ManuscriptParserService.compute_batch_number(chap_data["number"])
            chapter = ChapterModel(
                id=str(uuid.uuid4()),
                project_id=project.id,
                chapter_number=chap_data["number"],
                batch_number=batch_num,
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
            for seg_idx, parsed_seg in enumerate(segments_data):
                segment = ScriptSegmentModel(
                    id=str(uuid.uuid4()),
                    chapter_id=chapter.id,
                    order_index=seg_idx,
                    text=parsed_seg.text,
                    delivery_type=parsed_seg.delivery_type,
                    continuation_type=parsed_seg.continuation_type,
                    parent_turn_id=parsed_seg.parent_turn_id,
                    dialogue_chain_id=parsed_seg.dialogue_chain_id,
                    raw_speaker_tag=parsed_seg.raw_speaker_tag,
                    is_dialogue=parsed_seg.is_dialogue,
                    is_internal_thought=parsed_seg.is_internal_thought,
                    speaker=parsed_seg.speaker if parsed_seg.speaker else ("Narrator" if not parsed_seg.is_dialogue else None),
                    speaker_gender=parsed_seg.speaker_gender if parsed_seg.speaker_gender else ("neutral" if not parsed_seg.is_dialogue else None),
                    emotion=None,
                    audio_status="pending",
                )
                db.add(segment)

            created_chapters.append(chapter)

        # Update project status
        project.status = "in_production"
        await db.commit()

        summaries = [ChapterSummaryResponse.model_validate(chap) for chap in created_chapters]
        total_batches = max((c.batch_number for c in created_chapters), default=1)

        logger.info(
            "Parsed project %s into %d chapters (%d batches) with %d total words",
            project_id,
            len(created_chapters),
            total_batches,
            total_words,
        )

        return ParseResponse(
            project_id=project.id,
            status=project.status,
            total_chapters=len(created_chapters),
            total_batches=total_batches,
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

    @staticmethod
    async def update_segment(
        project_id: str,
        segment_id: str,
        payload: ScriptSegmentUpdateSchema,
        db: AsyncSession,
    ) -> ScriptSegmentResponse:
        """Update segment fields like text, speaker, delivery_type, and emotion."""
        stmt = (
            select(ScriptSegmentModel)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(ScriptSegmentModel.id == segment_id, ChapterModel.project_id == project_id)
        )
        res = await db.execute(stmt)
        segment = res.scalar_one_or_none()
        if not segment:
            raise NotFoundError(f"Segment with ID '{segment_id}' not found in project '{project_id}'")

        dump = payload.model_dump(exclude_unset=True)

        if "text" in dump and dump["text"] is not None:
            segment.text = dump["text"]

        if "delivery_type" in dump and dump["delivery_type"] is not None:
            dt = dump["delivery_type"]
            segment.delivery_type = dt
            if dt == "dialogue":
                segment.is_dialogue = True
                segment.is_internal_thought = False
            elif dt == "internal_thought":
                segment.is_dialogue = False
                segment.is_internal_thought = True
                if "speaker" not in dump:
                    segment.speaker = "Narrator"
                    segment.speaker_gender = "neutral"
                    segment.character_id = None
            elif dt == "system_prompt":
                segment.is_dialogue = False
                segment.is_internal_thought = False
                if "speaker" not in dump:
                    segment.speaker = "System / Interface"
                    segment.speaker_gender = "neutral"
                    segment.character_id = None
            elif dt == "narration":
                segment.is_dialogue = False
                segment.is_internal_thought = False
                if "speaker" not in dump:
                    segment.speaker = "Narrator"
                    segment.speaker_gender = "neutral"
                    segment.character_id = None

        if "speaker" in dump:
            spk = dump["speaker"]
            segment.speaker = spk
            if spk in ("Narrator", "System / Interface", None):
                segment.character_id = None
                segment.speaker_gender = "neutral"
            else:
                char_id = dump.get("character_id")
                if char_id:
                    segment.character_id = char_id
                    char_res = await db.execute(
                        select(CharacterModel).where(
                            CharacterModel.id == char_id,
                            CharacterModel.project_id == project_id,
                        )
                    )
                    char_obj = char_res.scalar_one_or_none()
                    if char_obj and "speaker_gender" not in dump:
                        segment.speaker_gender = char_obj.gender
                else:
                    char_res = await db.execute(
                        select(CharacterModel).where(
                            CharacterModel.project_id == project_id,
                            CharacterModel.name.ilike(spk),
                        )
                    )
                    char_obj = char_res.scalar_one_or_none()
                    if char_obj:
                        segment.character_id = char_obj.id
                        if "speaker_gender" not in dump:
                            segment.speaker_gender = char_obj.gender

        if "speaker_gender" in dump and dump["speaker_gender"] is not None:
            segment.speaker_gender = dump["speaker_gender"]

        if "character_id" in dump:
            segment.character_id = dump["character_id"]

        if "emotion" in dump:
            segment.emotion = dump["emotion"] if dump["emotion"] else None

        if "is_dialogue" in dump and dump["is_dialogue"] is not None:
            segment.is_dialogue = dump["is_dialogue"]

        if "is_internal_thought" in dump and dump["is_internal_thought"] is not None:
            segment.is_internal_thought = dump["is_internal_thought"]

        if "raw_speaker_tag" in dump:
            segment.raw_speaker_tag = dump["raw_speaker_tag"]

        await db.commit()
        await db.refresh(segment)
        return ScriptSegmentResponse.model_validate(segment)

    @staticmethod
    async def split_segment(
        project_id: str,
        segment_id: str,
        payload: ScriptSegmentSplitSchema,
        db: AsyncSession,
    ) -> list[ScriptSegmentResponse]:
        """Split a segment into two segments at split_index character offset."""
        stmt = (
            select(ScriptSegmentModel)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(ScriptSegmentModel.id == segment_id, ChapterModel.project_id == project_id)
        )
        res = await db.execute(stmt)
        segment = res.scalar_one_or_none()
        if not segment:
            raise NotFoundError(f"Segment with ID '{segment_id}' not found in project '{project_id}'")

        split_idx = payload.split_index
        if split_idx <= 0 or split_idx >= len(segment.text):
            raise ValidationError(
                f"Split index {split_idx} is out of bounds for segment text of length {len(segment.text)}"
            )

        left_text = segment.text[:split_idx].rstrip()
        right_text = segment.text[split_idx:].lstrip()

        if not left_text or not right_text:
            raise ValidationError("Split index creates empty text for one of the segments")

        # Shift all subsequent segments order_index by +1
        await db.execute(
            update(ScriptSegmentModel)
            .where(
                ScriptSegmentModel.chapter_id == segment.chapter_id,
                ScriptSegmentModel.order_index > segment.order_index,
            )
            .values(order_index=ScriptSegmentModel.order_index + 1)
        )

        segment.text = left_text

        new_segment = ScriptSegmentModel(
            id=str(uuid.uuid4()),
            chapter_id=segment.chapter_id,
            order_index=segment.order_index + 1,
            text=right_text,
            delivery_type=segment.delivery_type,
            continuation_type=segment.continuation_type,
            parent_turn_id=segment.parent_turn_id,
            dialogue_chain_id=segment.dialogue_chain_id,
            raw_speaker_tag=segment.raw_speaker_tag,
            is_dialogue=segment.is_dialogue,
            is_internal_thought=segment.is_internal_thought,
            speaker=segment.speaker,
            speaker_gender=segment.speaker_gender,
            character_id=segment.character_id,
            emotion=segment.emotion,
            audio_status="pending",
        )
        db.add(new_segment)
        await db.commit()
        await db.refresh(segment)
        await db.refresh(new_segment)

        return [
            ScriptSegmentResponse.model_validate(segment),
            ScriptSegmentResponse.model_validate(new_segment),
        ]

    @staticmethod
    async def merge_segment(
        project_id: str,
        segment_id: str,
        payload: ScriptSegmentMergeSchema,
        db: AsyncSession,
    ) -> ScriptSegmentResponse:
        """Merge a segment with either its succeeding ('next') or preceding ('previous') neighbor."""
        stmt = (
            select(ScriptSegmentModel)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(ScriptSegmentModel.id == segment_id, ChapterModel.project_id == project_id)
        )
        res = await db.execute(stmt)
        segment = res.scalar_one_or_none()
        if not segment:
            raise NotFoundError(f"Segment with ID '{segment_id}' not found in project '{project_id}'")

        if payload.direction == "previous":
            target_order = segment.order_index - 1
            n_stmt = select(ScriptSegmentModel).where(
                ScriptSegmentModel.chapter_id == segment.chapter_id,
                ScriptSegmentModel.order_index == target_order,
            )
            n_res = await db.execute(n_stmt)
            neighbor = n_res.scalar_one_or_none()
            if not neighbor:
                raise ValidationError("No previous segment exists to merge with")

            neighbor.text = f"{neighbor.text.rstrip()} {segment.text.lstrip()}".strip()
            deleted_order = segment.order_index
            await db.delete(segment)

            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id == neighbor.chapter_id,
                    ScriptSegmentModel.order_index > deleted_order,
                )
                .values(order_index=ScriptSegmentModel.order_index - 1)
            )

            await db.commit()
            await db.refresh(neighbor)
            return ScriptSegmentResponse.model_validate(neighbor)

        elif payload.direction == "next":
            target_order = segment.order_index + 1
            n_stmt = select(ScriptSegmentModel).where(
                ScriptSegmentModel.chapter_id == segment.chapter_id,
                ScriptSegmentModel.order_index == target_order,
            )
            n_res = await db.execute(n_stmt)
            neighbor = n_res.scalar_one_or_none()
            if not neighbor:
                raise ValidationError("No next segment exists to merge with")

            segment.text = f"{segment.text.rstrip()} {neighbor.text.lstrip()}".strip()
            deleted_order = neighbor.order_index
            await db.delete(neighbor)

            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id == segment.chapter_id,
                    ScriptSegmentModel.order_index > deleted_order,
                )
                .values(order_index=ScriptSegmentModel.order_index - 1)
            )

            await db.commit()
            await db.refresh(segment)
            return ScriptSegmentResponse.model_validate(segment)
        else:
            raise ValidationError(
                f"Invalid merge direction '{payload.direction}', must be 'next' or 'previous'"
            )
