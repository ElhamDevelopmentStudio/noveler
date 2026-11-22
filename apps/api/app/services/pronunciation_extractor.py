import re
import uuid
from typing import Any

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.models.pronunciation import PronunciationRuleModel
from app.services.llm_client import StructuredLLMClient
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.pronunciation_extractor")


class LLMPronunciationSuggestion(BaseModel):
    phrase: str = Field(..., min_length=2, max_length=255)
    replacement: str = Field(..., min_length=2, max_length=255, description="Phonetic English respelling for TTS")
    match_case: bool = Field(default=True)
    reason: str = Field(default="", description="Why TTS needs help (e.g., Korean romanization, fantasy spell)")


class LLMPronunciationGlossary(BaseModel):
    suggestions: list[LLMPronunciationSuggestion] = Field(default_factory=list)


PRONUNCIATION_SYSTEM_PROMPT = """You are an audiobook pronunciation director for English TTS engines (Chatterbox-Turbo / Kokoro).
Given character names and sampled novel excerpts, identify ONLY terms that an English TTS engine is likely to mispronounce:
- Fantasy/sci-fi proper nouns, place names, magic spells, ranks, titles
- Korean, Chinese, or Japanese romanized names (e.g., "Baek Yu-Seol" -> "Beck Yoo-Suhl", "Deculein" -> "Deh-kyoo-lane")
- Unusual abbreviations or coined words

RULES:
1. Do NOT include common everyday English words or standard Western names ("John", "Sarah", "London").
2. Do NOT repeat any phrase already listed in "existing_rules".
3. Provide clear, intuitive English phonetic respellings (hyphens for syllable breaks, plain Latin letters—no obscure IPA symbols that TTS engines ignore).
4. Return at most 25 highest-impact suggestions.
"""


class PronunciationExtractorService:
    @classmethod
    async def extract_glossary(
        cls,
        *,
        project_id: str,
        db: AsyncSession,
        chapter_ids: list[str] | None = None,
        sample_chapters: int = 8,
        save_as_drafts: bool = True,
    ) -> dict[str, Any]:
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Existing rules to avoid duplicates
        existing_rules = list(
            (
                await db.execute(
                    select(PronunciationRuleModel).where(PronunciationRuleModel.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        existing_phrases_lower = {r.phrase.strip().lower() for r in existing_rules}

        # Character names & aliases
        chars = list(
            (
                await db.execute(
                    select(CharacterModel)
                    .where(
                        CharacterModel.project_id == project_id,
                        CharacterModel.is_system.is_(False),
                        CharacterModel.is_general.is_(False),
                    )
                    .order_by(CharacterModel.dialogue_count.desc())
                    .limit(60)
                )
            )
            .scalars()
            .all()
        )
        character_terms = []
        for c in chars:
            character_terms.append(c.name)
            for alias in (c.aliases or []):
                if alias:
                    character_terms.append(alias)

        # Sample chapters
        ch_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index.asc())
        )
        if chapter_ids:
            ch_stmt = ch_stmt.where(ChapterModel.id.in_(chapter_ids))
        else:
            ch_stmt = ch_stmt.limit(sample_chapters)
        chapters = list((await db.execute(ch_stmt)).scalars().all())

        excerpts: list[str] = []
        for ch in chapters:
            seg_stmt = (
                select(ScriptSegmentModel.text)
                .where(ScriptSegmentModel.chapter_id == ch.id)
                .order_by(ScriptSegmentModel.order_index.asc())
                .limit(40)
            )
            seg_texts = [t for t in (await db.execute(seg_stmt)).scalars().all() if t]
            if seg_texts:
                excerpts.append(f"[Chapter {ch.chapter_number}: {ch.title}]\n" + " ".join(seg_texts)[:2200])

        glossary_obj, usage = await StructuredLLMClient.complete_json(
            system_prompt=PRONUNCIATION_SYSTEM_PROMPT,
            user_payload={
                "project_title": project.title,
                "existing_rules": sorted(existing_phrases_lower),
                "character_names_and_aliases": list(dict.fromkeys(character_terms))[:80],
                "sampled_excerpts": excerpts[:sample_chapters],
            },
            response_model=LLMPronunciationGlossary,
            temperature=0.1,
        )

        # Count occurrences across project segments
        all_texts = [
            t
            for t in (
                await db.execute(
                    select(ScriptSegmentModel.text)
                    .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
                    .where(ChapterModel.project_id == project_id)
                )
            )
            .scalars()
            .all()
            if t
        ]

        suggestions_out: list[dict[str, Any]] = []
        created_count = 0

        for item in glossary_obj.suggestions:
            phrase = item.phrase.strip()
            replacement = item.replacement.strip()
            if not phrase or not replacement or phrase.lower() == replacement.lower():
                continue
            if phrase.lower() in existing_phrases_lower:
                continue

            flags = 0 if item.match_case else re.IGNORECASE
            pattern = re.compile(rf"\b{re.escape(phrase)}\b", flags)
            occ = sum(len(pattern.findall(t)) for t in all_texts)

            rule_id = None
            if save_as_drafts:
                rule = PronunciationRuleModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    phrase=phrase,
                    replacement=replacement,
                    match_case=item.match_case,
                    scope="entire_manuscript",
                    occurrences_count=occ,
                    excluded_segment_ids=[],
                    is_active=False,  # Draft until user approves!
                )
                db.add(rule)
                rule_id = rule.id
                created_count += 1
                existing_phrases_lower.add(phrase.lower())

            suggestions_out.append(
                {
                    "rule_id": rule_id,
                    "phrase": phrase,
                    "replacement": replacement,
                    "match_case": item.match_case,
                    "reason": item.reason,
                    "occurrences_count": occ,
                    "is_active": False,
                }
            )

        if save_as_drafts and created_count > 0:
            await db.commit()

        return {
            "project_id": project_id,
            "created_drafts_count": created_count,
            "suggestions": suggestions_out,
            "usage": usage,
            "message": f"Extracted {len(suggestions_out)} pronunciation suggestion(s) ({created_count} saved as drafts).",
        }
