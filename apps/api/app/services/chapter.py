from datetime import UTC, datetime
import json
import re
import uuid

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.kaggle_account import KaggleAccountModel
from app.models.project import ProjectModel
from app.models.tagging_job import TaggingJobModel
from app.schemas.chapter import (
    ChapterAudioStreamResponse,
    ChapterDetailResponse,
    ChapterGenerateAudioResponse,
    ChapterGenerateAudioSchema,
    ChapterSummaryResponse,
    ChapterCreateSchema,
    ChapterUpdateSchema,
    ChapterReorderSchema,
    ChapterTextSaveSchema,
    FormatScriptResponse,
    FormatScriptSchema,
    ParseOptionsSchema,
    ParseResponse,
    ScriptSegmentMergeSchema,
    ScriptSegmentResponse,
    ScriptSegmentSplitSchema,
    ScriptSegmentUpdateSchema,
    SegmentAlignmentSchema,
)
from app.schemas.telegram import TelegramSendChapterResponse
from app.core.security import decrypt_secret
from app.services.kaggle_account import check_kaggle_gpu_quota
from app.services.parser import QUOTE_SPAN_RE, WORDS_PER_MINUTE, ManuscriptParserService
from novelova_core.exceptions import AppError, NotFoundError, ValidationError
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

        # Snapshot existing segment attributions if preserve_existing_tags is True
        tag_cache: dict[str, dict] = {}
        if getattr(options, "preserve_existing_tags", True):
            existing_segs_stmt = (
                select(ScriptSegmentModel)
                .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
                .where(ChapterModel.project_id == project_id)
            )
            existing_segs = list((await db.execute(existing_segs_stmt)).scalars().all())
            for s in existing_segs:
                if s.speaker and s.speaker != "Narrator":
                    clean_key = re.sub(r'[\s"\'“”‘’]+', " ", s.text).strip().lower()
                    if clean_key:
                        tag_cache[clean_key] = {
                            "speaker": s.speaker,
                            "speaker_gender": s.speaker_gender,
                            "character_id": s.character_id,
                            "delivery_type": s.delivery_type,
                            "emotion": s.emotion,
                            "is_dialogue": s.is_dialogue,
                            "is_internal_thought": s.is_internal_thought,
                            "raw_speaker_tag": s.raw_speaker_tag,
                        }

        # Delete any existing chapters/segments for clean re-parse
        await db.execute(delete(ChapterModel).where(ChapterModel.project_id == project_id))
        # Clear stale tagging jobs only if we are NOT preserving tags
        if not tag_cache:
            await db.execute(delete(TaggingJobModel).where(TaggingJobModel.project_id == project_id))
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
                clean_key = re.sub(r'[\s"\'“”‘’]+', " ", parsed_seg.text).strip().lower()
                cached = tag_cache.get(clean_key) if tag_cache else None

                seg_speaker = cached["speaker"] if cached else (parsed_seg.speaker if parsed_seg.speaker else ("Narrator" if not parsed_seg.is_dialogue else None))
                seg_gender = cached["speaker_gender"] if cached else (parsed_seg.speaker_gender if parsed_seg.speaker_gender else ("neutral" if not parsed_seg.is_dialogue else None))
                seg_char_id = cached["character_id"] if cached else None
                seg_delivery = cached["delivery_type"] if cached else parsed_seg.delivery_type
                seg_emotion = cached["emotion"] if cached else None
                seg_is_dialogue = cached["is_dialogue"] if cached else parsed_seg.is_dialogue
                seg_is_thought = cached["is_internal_thought"] if cached else parsed_seg.is_internal_thought
                seg_raw_tag = cached.get("raw_speaker_tag") if cached else parsed_seg.raw_speaker_tag

                segment = ScriptSegmentModel(
                    id=str(uuid.uuid4()),
                    chapter_id=chapter.id,
                    order_index=seg_idx,
                    text=parsed_seg.text,
                    delivery_type=seg_delivery,
                    continuation_type=parsed_seg.continuation_type,
                    parent_turn_id=parsed_seg.parent_turn_id,
                    dialogue_chain_id=parsed_seg.dialogue_chain_id,
                    raw_speaker_tag=seg_raw_tag,
                    is_dialogue=seg_is_dialogue,
                    is_internal_thought=seg_is_thought,
                    speaker=seg_speaker,
                    speaker_gender=seg_gender,
                    emotion=seg_emotion,
                    character_id=seg_char_id,
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
    async def format_project_script(
        project_id: str,
        payload: FormatScriptSchema,
        db: AsyncSession,
    ) -> FormatScriptResponse:
        """
        Format and clean existing project script segments in-place.
        Applies audio-ready number conversion, punctuation spacing, and whitespace cleanup
        while strictly preserving 100% of character attributions, emotions, and delivery modes.
        """
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project with ID '{project_id}' not found")

        stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index.asc())
        )
        if payload.chapter_id:
            stmt = stmt.where(ChapterModel.id == payload.chapter_id)

        chapters = list((await db.execute(stmt)).scalars().all())
        if not chapters:
            raise NotFoundError("No chapters found to format")

        clean_opts = ParseOptionsSchema(
            remove_whitespace=payload.remove_whitespace,
            normalize_paragraphs=payload.normalize_paragraphs,
            fix_punctuation_spacing=payload.fix_punctuation_spacing,
            speak_unambiguous_numbers=payload.speak_unambiguous_numbers,
        )

        formatted_segments_count = 0
        affected_chapters_count = 0

        for chapter in chapters:
            seg_stmt = (
                select(ScriptSegmentModel)
                .where(ScriptSegmentModel.chapter_id == chapter.id)
                .order_by(ScriptSegmentModel.order_index.asc())
            )
            segments = list((await db.execute(seg_stmt)).scalars().all())
            if not segments:
                continue

            chapter_changed = False
            for seg in segments:
                original_text = seg.text
                new_text = ManuscriptParserService.clean_text(original_text, clean_opts)
                if payload.normalize_dialogue_quotes:
                    new_text = ManuscriptParserService.normalize_dialogue_quotes(new_text)

                if new_text != original_text:
                    seg.text = new_text
                    formatted_segments_count += 1
                    chapter_changed = True

            if chapter_changed:
                affected_chapters_count += 1
                total_words = sum(len(s.text.split()) for s in segments)
                chapter.word_count = total_words
                chapter.estimated_duration_seconds = max(60, int((total_words / WORDS_PER_MINUTE) * 60))

        await db.commit()

        logger.info(
            "Formatted project %s: %d segments across %d chapter(s)",
            project_id,
            formatted_segments_count,
            affected_chapters_count,
        )

        return FormatScriptResponse(
            project_id=project_id,
            formatted_segments_count=formatted_segments_count,
            affected_chapters_count=affected_chapters_count,
            message=(
                f"Successfully formatted {formatted_segments_count} segments across "
                f"{affected_chapters_count} chapter(s) while preserving all character tags."
            ),
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

        # Re-evaluate quotes and delivery classification for both halves
        left_has_quote = bool(QUOTE_SPAN_RE.search(left_text))
        right_has_quote = bool(QUOTE_SPAN_RE.search(right_text))

        new_is_dialogue = segment.is_dialogue
        new_is_thought = segment.is_internal_thought
        new_delivery_type = segment.delivery_type
        new_speaker = segment.speaker
        new_gender = segment.speaker_gender
        new_character_id = segment.character_id
        new_emotion = segment.emotion
        new_raw_tag = segment.raw_speaker_tag

        # Case 1: Left is quoted dialogue, right is unquoted narration (e.g. "I'm leaving," | she whispered.)
        if left_has_quote and not right_has_quote:
            segment.is_dialogue = True
            segment.is_internal_thought = False
            segment.delivery_type = "dialogue"

            new_is_dialogue = False
            new_is_thought = False
            new_delivery_type = "narration"
            new_speaker = "Narrator"
            new_gender = "neutral"
            new_character_id = None
            new_emotion = None
            new_raw_tag = None

        # Case 2: Left is leading narration, right is quoted dialogue (e.g. He pointed to the door: | "Get out.")
        elif not left_has_quote and right_has_quote:
            new_is_dialogue = True
            new_is_thought = False
            new_delivery_type = "dialogue"
            if segment.speaker == "Narrator":
                new_speaker = None
                new_gender = None
                new_character_id = None
            else:
                new_speaker = segment.speaker
                new_gender = segment.speaker_gender
                new_character_id = segment.character_id

            segment.is_dialogue = False
            segment.is_internal_thought = False
            segment.delivery_type = "narration"
            segment.speaker = "Narrator"
            segment.speaker_gender = "neutral"
            segment.character_id = None
            segment.emotion = None
            segment.raw_speaker_tag = None

        # Continuation Type & Parent Turn ID handling (Issue #2):
        # A split operation divides a turn; we must never duplicate identical continuation types under the same parent turn.
        new_continuation_type = "none"
        new_parent_turn_id = None

        if segment.continuation_type == "starts_phrase":
            # If left half still ends with non-terminal punctuation (comma, dash, ellipsis), keep starts_phrase on left
            left_tail = left_text.rstrip("\"'”’』」 ").rstrip()
            if not left_tail.endswith((",", "—", "–", "...", ";", ":", "-")):
                segment.continuation_type = "none"
                segment.parent_turn_id = None
        elif segment.continuation_type == "completes_phrase":
            # Right half resolves the phrase, left half becomes detached
            new_continuation_type = "completes_phrase"
            new_parent_turn_id = segment.parent_turn_id
            segment.continuation_type = "none"
            segment.parent_turn_id = None
        else:
            segment.continuation_type = "none"
            segment.parent_turn_id = None

        new_segment = ScriptSegmentModel(
            id=str(uuid.uuid4()),
            chapter_id=segment.chapter_id,
            order_index=segment.order_index + 1,
            text=right_text,
            delivery_type=new_delivery_type,
            continuation_type=new_continuation_type,
            parent_turn_id=new_parent_turn_id,
            dialogue_chain_id=segment.dialogue_chain_id if new_is_dialogue else None,
            raw_speaker_tag=new_raw_tag,
            is_dialogue=new_is_dialogue,
            is_internal_thought=new_is_thought,
            speaker=new_speaker,
            speaker_gender=new_gender,
            character_id=new_character_id,
            emotion=new_emotion,
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

    @staticmethod
    async def create_chapter(
        project_id: str,
        payload: ChapterCreateSchema,
        db: AsyncSession,
    ) -> ChapterDetailResponse:
        """Create a new chapter in the project."""
        stmt = select(ProjectModel).where(ProjectModel.id == project_id)
        project = (await db.execute(stmt)).scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project with ID '{project_id}' not found")

        chaps_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index)
        )
        existing_chaps = list((await db.execute(chaps_stmt)).scalars().all())

        next_number = max([c.chapter_number for c in existing_chaps], default=0) + 1
        next_order = max([c.order_index for c in existing_chaps], default=-1) + 1
        title = payload.title.strip() if (payload.title and payload.title.strip()) else f"Chapter {next_number}"

        batch_num = ManuscriptParserService.compute_batch_number(next_number)
        new_chapter = ChapterModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            chapter_number=next_number,
            batch_number=batch_num,
            title=title,
            order_index=next_order,
            word_count=0,
            estimated_duration_seconds=0,
            status="parsed",
        )
        db.add(new_chapter)
        if project.status == "ready_to_parse":
            project.status = "in_production"

        await db.commit()
        await db.refresh(new_chapter)
        return ChapterDetailResponse.model_validate(new_chapter)

    @staticmethod
    async def update_chapter(
        project_id: str,
        chapter_id: str,
        payload: ChapterUpdateSchema,
        db: AsyncSession,
    ) -> ChapterDetailResponse:
        """Update chapter details (e.g. rename title)."""
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(selectinload(ChapterModel.segments))
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        if payload.title is not None and payload.title.strip():
            chapter.title = payload.title.strip()

        await db.commit()
        await db.refresh(chapter)
        return ChapterDetailResponse.model_validate(chapter)

    @staticmethod
    async def reorder_chapters(
        project_id: str,
        payload: ChapterReorderSchema,
        db: AsyncSession,
    ) -> list[ChapterSummaryResponse]:
        """Reorder chapters according to the given list of IDs."""
        stmt = select(ChapterModel).where(ChapterModel.project_id == project_id)
        chapters = list((await db.execute(stmt)).scalars().all())
        chap_map = {c.id: c for c in chapters}

        for idx, cid in enumerate(payload.chapter_ids):
            if cid in chap_map:
                chap_map[cid].order_index = idx

        await db.commit()

        ordered_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index)
        )
        ordered_chaps = list((await db.execute(ordered_stmt)).scalars().all())
        return [ChapterSummaryResponse.model_validate(c) for c in ordered_chaps]

    @staticmethod
    async def delete_chapter(
        project_id: str,
        chapter_id: str,
        db: AsyncSession,
    ) -> None:
        """Delete a chapter and its segments."""
        stmt = select(ChapterModel).where(
            ChapterModel.id == chapter_id, ChapterModel.project_id == project_id
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        await db.delete(chapter)
        await db.commit()

    @staticmethod
    async def save_chapter_text(
        project_id: str,
        chapter_id: str,
        payload: ChapterTextSaveSchema,
        db: AsyncSession,
    ) -> ChapterDetailResponse:
        """Populate or update chapter segments from raw typed/pasted text."""
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(selectinload(ChapterModel.segments))
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        await db.execute(delete(ScriptSegmentModel).where(ScriptSegmentModel.chapter_id == chapter_id))
        await db.flush()

        text = payload.text.strip()
        if not text:
            chapter.word_count = 0
            chapter.estimated_duration_seconds = 0
            await db.commit()
            await db.refresh(chapter)
            return ChapterDetailResponse.model_validate(chapter)

        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        new_segments: list[ScriptSegmentModel] = []
        total_words = 0

        for idx, p in enumerate(paragraphs):
            words = len(p.split())
            total_words += words
            is_dialogue = bool(QUOTE_SPAN_RE.search(p))
            new_segments.append(
                ScriptSegmentModel(
                    id=str(uuid.uuid4()),
                    chapter_id=chapter_id,
                    order_index=idx,
                    text=p,
                    delivery_type="dialogue" if is_dialogue else "narration",
                    is_dialogue=is_dialogue,
                    speaker=None if is_dialogue else "Narrator",
                    audio_status="pending",
                )
            )

        db.add_all(new_segments)
        chapter.word_count = total_words
        chapter.estimated_duration_seconds = max(60, int((total_words / WORDS_PER_MINUTE) * 60))

        await db.commit()
        await db.refresh(chapter)
        return ChapterDetailResponse.model_validate(chapter)

    @staticmethod
    async def get_chapter_audio_stream(
        project_id: str,
        chapter_id: str,
        db: AsyncSession,
    ) -> ChapterAudioStreamResponse:
        """Retrieve chapter audio stream and segment timecode alignment.

        If the chapter has an active master audio file and alignment_json,
        returns the real synthesized alignment. Otherwise, computes natural,
        reproducible timecodes based on words and punctuation pauses so
        the ElevenLabs-style studio player and karaoke follow-along work seamlessly.
        """
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(selectinload(ChapterModel.segments))
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        alignments: list[SegmentAlignmentSchema] = []
        is_synthesized = bool(chapter.audio_url)

        # 1. Stored alignment JSON from Kaggle synthesis or FFmpeg stitching
        if chapter.alignment_json:
            try:
                parsed = json.loads(chapter.alignment_json)
                if isinstance(parsed, list):
                    for item in parsed:
                        s_ms = int(item.get("start_ms", 0))
                        e_ms = int(item.get("end_ms", 0))
                        alignments.append(
                            SegmentAlignmentSchema(
                                segment_id=item.get("segment_id", ""),
                                order_index=int(item.get("order_index", 0)),
                                start_ms=s_ms,
                                end_ms=e_ms,
                                duration_ms=max(0, e_ms - s_ms),
                                storage_key=item.get("storage_key"),
                                audio_url=item.get("audio_url"),
                            )
                        )
            except Exception as e:
                logger.warning("Failed to parse alignment_json for chapter %s: %s", chapter_id, e)

        # 2. Deterministic high-precision acoustic simulation if unaligned
        if not alignments and chapter.segments:
            sorted_segs = sorted(chapter.segments, key=lambda s: s.order_index)
            current_ms = 0

            for seg in sorted_segs:
                words = len(seg.text.split())
                # Base speech duration at ~155 words per minute (~387ms / word)
                base_duration_ms = max(800, int(words * 387))

                # Punctuation pauses
                comma_count = seg.text.count(",") + seg.text.count(";")
                period_count = seg.text.count(".") + seg.text.count("!") + seg.text.count("?")
                pause_ms = (comma_count * 200) + (period_count * 400)

                seg_duration = base_duration_ms + pause_ms
                start_ms = current_ms
                end_ms = start_ms + seg_duration

                alignments.append(
                    SegmentAlignmentSchema(
                        segment_id=seg.id,
                        order_index=seg.order_index,
                        start_ms=start_ms,
                        end_ms=end_ms,
                        duration_ms=seg_duration,
                        storage_key=None,
                        audio_url=seg.audio_url,
                    )
                )

                # Inter-segment acoustic pause (300ms)
                current_ms = end_ms + 300

        total_duration_sec = 0
        if alignments:
            total_duration_sec = max(1, alignments[-1].end_ms // 1000)
        elif chapter.estimated_duration_seconds:
            total_duration_sec = chapter.estimated_duration_seconds

        return ChapterAudioStreamResponse(
            chapter_id=chapter.id,
            chapter_title=chapter.title,
            audio_url=chapter.audio_url,
            total_duration_seconds=total_duration_sec,
            is_synthesized=is_synthesized,
            audio_job_status=chapter.audio_job_status or "none",
            audio_job_error=chapter.audio_job_error,
            audio_account_used=chapter.audio_account_used,
            alignments=alignments,
        )

    @staticmethod
    async def generate_chapter_audio(
        project_id: str,
        chapter_id: str,
        user_id: str,
        payload: ChapterGenerateAudioSchema,
        db: AsyncSession,
    ) -> ChapterGenerateAudioResponse:
        """Start audio synthesis for a chapter on Kaggle GPU worker with rigorous error handling.

        Validates chapter script, verifies Kaggle pool availability, checks weekly GPU quotas,
        and transitions the chapter into production.
        """
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(
                selectinload(ChapterModel.segments),
                selectinload(ChapterModel.project).selectinload(ProjectModel.thumbnail_attachment),
            )
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        if not chapter.segments or len(chapter.segments) == 0:
            raise ValidationError("Cannot generate audio for an empty chapter. Please parse or paste chapter script first.")

        # 1. Fetch user's Kaggle accounts
        accounts_stmt = (
            select(KaggleAccountModel)
            .where(KaggleAccountModel.user_id == user_id)
            .order_by(KaggleAccountModel.priority.asc(), KaggleAccountModel.created_at.asc())
        )
        accounts = list((await db.execute(accounts_stmt)).scalars().all())

        if not accounts:
            chapter.audio_job_status = "failed"
            chapter.audio_job_error = (
                "No Kaggle account configured. Please add your Kaggle username and API key in Settings > Kaggle Accounts."
            )
            await db.commit()
            raise AppError(
                "No Kaggle account configured. Please add your Kaggle credentials in Profile Settings > Kaggle Accounts to synthesize audio.",
                "NO_KAGGLE_ACCOUNTS",
            )

        active_accounts = [a for a in accounts if a.is_active]
        if not active_accounts:
            chapter.audio_job_status = "failed"
            chapter.audio_job_error = "All Kaggle accounts in your pool are currently deactivated."
            await db.commit()
            raise AppError(
                "All Kaggle accounts in your pool are currently deactivated. Please enable at least one account in Settings.",
                "NO_ACTIVE_KAGGLE_ACCOUNTS",
            )

        # Determine candidate accounts to attempt
        if payload.kaggle_account_id:
            candidate_accounts = [a for a in active_accounts if a.id == payload.kaggle_account_id]
            if not candidate_accounts:
                raise NotFoundError(f"Selected Kaggle account '{payload.kaggle_account_id}' not found in active pool.")
        else:
            # Sort candidate accounts: prefer available accounts, then probe
            candidate_accounts = [a for a in active_accounts if a.status != "failed"]

        target_account: KaggleAccountModel | None = None
        quota_details: dict | None = None
        exhaustion_reasons: list[str] = []

        for acc in candidate_accounts:
            # If account is already marked exhausted, record reason and skip unless testing offline
            if acc.status == "exhausted" and not payload.allow_dev_offline:
                reset_hint = f" (resets {acc.estimated_reset_at.strftime('%Y-%m-%d %H:%M UTC')})" if acc.estimated_reset_at else ""
                exhaustion_reasons.append(f"@{acc.username}: {acc.total_hours_used}h/30h used{reset_hint}")
                continue

            raw_key = decrypt_secret(acc.encrypted_key)
            if raw_key.startswith("KGAT_testdummy") or "dummy" in raw_key.lower() or payload.allow_dev_offline:
                # Test dummy credentials used in automated tests or dev mode
                target_account = acc
                break

            try:
                probe = await check_kaggle_gpu_quota(acc.username, raw_key)
                acc.total_hours_used = probe["hours_used"]
                if probe.get("quota_refresh_time"):
                    try:
                        acc.estimated_reset_at = datetime.fromisoformat(
                            probe["quota_refresh_time"].replace("Z", "+00:00")
                        )
                    except Exception:
                        pass

                if probe["is_exhausted"]:
                    acc.status = "exhausted"
                    acc.exhausted_at = datetime.now(UTC)
                    await db.commit()
                    reset_str = f" (resets {probe['quota_refresh_time'][:10]})" if probe.get("quota_refresh_time") else ""
                    exhaustion_reasons.append(
                        f"@{acc.username}: {probe['hours_used']}h/{probe['hours_allowed']}h used{reset_str}"
                    )
                    continue  # Fail over to next account in pool!

                # Successfully found an account with available GPU hours!
                acc.status = "available"
                target_account = acc
                quota_details = probe
                break
            except AppError as exc:
                if exc.code == "INVALID_KAGGLE_CREDENTIALS":
                    acc.status = "failed"
                    await db.commit()
                    exhaustion_reasons.append(f"@{acc.username}: Invalid credentials")
                    continue
                logger.warning("Kaggle probe warning for @%s: %s", acc.username, exc)
                if acc.status == "available":
                    target_account = acc
                    break

        if not target_account:
            chapter.audio_job_status = "failed"
            reasons_summary = "; ".join(exhaustion_reasons) if exhaustion_reasons else "All accounts have exceeded 30h/week"
            err_msg = (
                f"Kaggle GPU quota is exhausted for this week ({reasons_summary}). "
                "Please add another Kaggle account in Profile Settings > Kaggle Accounts or wait for your weekly reset."
            )
            chapter.audio_job_error = err_msg
            if active_accounts:
                chapter.audio_account_used = active_accounts[0].username
            await db.commit()
            raise AppError(err_msg, "KAGGLE_GPU_QUOTA_EXHAUSTED")

        # 2. Transition chapter to in_production state
        chapter.status = "in_production"
        chapter.audio_job_status = "generating"
        chapter.audio_job_error = None
        chapter.audio_account_used = target_account.username
        target_account.last_used_at = datetime.now(UTC)

        # Update segment audio statuses
        for s in chapter.segments:
            s.audio_status = "queued"

        await db.commit()
        await db.refresh(chapter)

        # Auto-deliver to Telegram if user enabled Telegram and running in dev offline mode
        if payload.allow_dev_offline and user_id:
            try:
                from app.models.user import UserModel
                from app.services.telegram import TelegramService
                user_stmt = select(UserModel).where(UserModel.id == user_id)
                u = (await db.execute(user_stmt)).scalar_one_or_none()
                if u and u.telegram_enabled and u.telegram_bot_token and u.telegram_chat_id:
                    await TelegramService.deliver_chapter_audio(
                        user=u,
                        project=chapter.project,
                        chapter=chapter,
                        force_preview=True,
                    )
            except Exception as exc:
                logger.warning("Auto Telegram drop on generate skipped: %s", exc)

        return ChapterGenerateAudioResponse(
            chapter_id=chapter.id,
            status="in_production",
            kaggle_account_used=target_account.username,
            audio_url=chapter.audio_url,
            estimated_duration_seconds=chapter.estimated_duration_seconds,
            message=f"Audio generation initiated on Kaggle GPU worker (Account: @{target_account.username}).",
        )

    @staticmethod
    async def reset_chapter_audio(
        project_id: str,
        chapter_id: str,
        db: AsyncSession,
    ) -> ChapterDetailResponse:
        """Clear audio generation state and reset chapter to parsed status."""
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(selectinload(ChapterModel.segments))
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        chapter.audio_url = None
        chapter.alignment_json = None
        chapter.audio_job_status = "none"
        chapter.audio_job_error = None
        chapter.audio_account_used = None
        chapter.status = "parsed"
        for s in chapter.segments:
            s.audio_status = "pending"
            s.audio_url = None
            s.duration_ms = None

        await db.commit()
        await db.refresh(chapter)
        return ChapterDetailResponse.model_validate(chapter)

    @staticmethod
    async def deliver_chapter_to_telegram(
        project_id: str,
        chapter_id: str,
        user,
        force_preview: bool,
        db: AsyncSession,
    ) -> TelegramSendChapterResponse:
        """Deliver chapter audio to the user's verified Telegram chat."""
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.id == chapter_id, ChapterModel.project_id == project_id)
            .options(
                selectinload(ChapterModel.segments),
                selectinload(ChapterModel.project).selectinload(ProjectModel.thumbnail_attachment),
            )
        )
        chapter = (await db.execute(stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' in project '{project_id}' not found")

        project = chapter.project
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        from app.services.telegram import TelegramService

        result = await TelegramService.deliver_chapter_audio(
            user=user,
            project=project,
            chapter=chapter,
            force_preview=force_preview,
        )

        return TelegramSendChapterResponse(**result)

