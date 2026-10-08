import re
import uuid

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.pronunciation import PronunciationRuleModel
from app.schemas.pronunciation import (
    PronunciationFindRequestSchema,
    PronunciationOccurrenceSchema,
    PronunciationRuleCreateSchema,
)
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.pronunciation")


class PronunciationService:
    @classmethod
    async def find_occurrences(
        cls,
        project_id: str,
        dto: PronunciationFindRequestSchema,
        db: AsyncSession,
    ) -> list[PronunciationOccurrenceSchema]:
        """
        Scan manuscript segments for occurrences of a word or phrase,
        producing before/after previews for the Pronunciation configuration modal.
        """
        stmt = (
            select(ScriptSegmentModel, ChapterModel)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.chapter_number, ScriptSegmentModel.order_index)
        )
        if dto.scope and dto.scope != "entire_manuscript":
            stmt = stmt.where(ChapterModel.id == dto.scope)

        result = await db.execute(stmt)
        rows = result.all()

        flags = 0 if dto.match_case else re.IGNORECASE
        pattern = re.compile(rf"\b{re.escape(dto.word)}\b", flags=flags)

        occurrences: list[PronunciationOccurrenceSchema] = []
        for segment, chapter in rows:
            if pattern.search(segment.text):
                # Target word bolded in current text
                current_highlighted = pattern.sub(
                    lambda m: f"**{m.group(0)}**", segment.text
                )
                # Preview text with replacement substituted
                preview_replaced = pattern.sub(dto.replacement or dto.word, segment.text)

                occurrences.append(
                    PronunciationOccurrenceSchema(
                        chapter_id=chapter.id,
                        chapter_number=chapter.chapter_number,
                        chapter_title=chapter.title,
                        segment_id=segment.id,
                        current_text=current_highlighted,
                        preview_text=preview_replaced,
                        is_included=True,
                    )
                )

        return occurrences

    @classmethod
    async def create_rule(
        cls,
        project_id: str,
        dto: PronunciationRuleCreateSchema,
        db: AsyncSession,
    ) -> PronunciationRuleModel:
        """Create or replace a pronunciation override rule for a project."""
        # Check if identical phrase rule already exists
        stmt = select(PronunciationRuleModel).where(
            PronunciationRuleModel.project_id == project_id,
            PronunciationRuleModel.phrase == dto.phrase,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()

        find_req = PronunciationFindRequestSchema(
            word=dto.phrase,
            replacement=dto.replacement,
            match_case=dto.match_case,
            scope=dto.scope,
        )
        occurrences = await cls.find_occurrences(project_id, find_req, db)
        count = len(occurrences)

        if existing:
            existing.replacement = dto.replacement
            existing.match_case = dto.match_case
            existing.scope = dto.scope
            existing.occurrences_count = count
            existing.excluded_segment_ids = dto.excluded_segment_ids
            existing.is_active = True
            await db.commit()
            await db.refresh(existing)
            return existing

        rule = PronunciationRuleModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            phrase=dto.phrase,
            replacement=dto.replacement,
            match_case=dto.match_case,
            scope=dto.scope,
            occurrences_count=count,
            excluded_segment_ids=dto.excluded_segment_ids,
            is_active=True,
        )
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
        return rule

    @classmethod
    async def get_project_rules(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> list[PronunciationRuleModel]:
        """Fetch all pronunciation override rules for a project."""
        stmt = (
            select(PronunciationRuleModel)
            .where(PronunciationRuleModel.project_id == project_id)
            .order_by(PronunciationRuleModel.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def delete_rule(
        cls,
        project_id: str,
        rule_id: str,
        db: AsyncSession,
    ) -> None:
        """Delete a pronunciation override rule."""
        rule = await db.get(PronunciationRuleModel, rule_id)
        if not rule or rule.project_id != project_id:
            raise NotFoundError(f"Pronunciation rule '{rule_id}' not found")
        await db.delete(rule)
        await db.commit()

    @staticmethod
    def apply_rules_to_text(
        text: str,
        rules: list[PronunciationRuleModel],
        segment_id: str | None = None,
    ) -> str:
        """
        Apply active pronunciation rules non-destructively in-memory for audio generation.
        The visible manuscript text in the database remains untouched.
        """
        result = text
        for rule in rules:
            if not rule.is_active:
                continue
            if segment_id and segment_id in (rule.excluded_segment_ids or []):
                continue

            flags = 0 if rule.match_case else re.IGNORECASE
            pattern = re.compile(rf"\b{re.escape(rule.phrase)}\b", flags=flags)
            result = pattern.sub(rule.replacement, result)

        return result
