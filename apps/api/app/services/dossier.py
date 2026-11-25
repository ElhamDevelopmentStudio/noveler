from datetime import UTC, datetime
from typing import Any

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.schemas.voice_design import (
    BuildDossiersResponseSchema,
    CharacterDossierResultItem,
    CharacterDossierSchema,
)
from app.services.llm_client import StructuredLLMClient
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.dossier")

DOSSIER_SYSTEM_PROMPT = """You are an expert audiobook casting director and voice designer.
Given a character's name, gender, aliases, and representative excerpts from a novel (their dialogue lines plus surrounding narration), synthesize a rich Character Dossier and a voice design prompt for `Qwen3-TTS-12Hz-1.7B-VoiceDesign`.

CRITICAL RULES:
1. Ground every trait (age_group, personality_traits, vocal_traits, relationships, summary) in the provided excerpts. Do not invent contradictory facts.
2. `voice_design_prompt` MUST describe the character's **natural vocal identity** (2-3 natural-language sentences) suitable as the `instruct` prompt for `Qwen3-TTS-12Hz-1.7B-VoiceDesign`.
   - **Design the voice, NOT the emotion.** Do NOT lock the voice into a single emotional state (such as "aggressively intimidating", "intensely dramatic", "perpetually cheerful", "always furious", or "constantly sorrowful"), and avoid making the voice overly dramatic, cinematic, monotonous, or exaggerated.
   - Focus strictly on acoustic and delivery characteristics that make the character recognizable while preserving full emotional versatility for voice cloning across calm, joyful, angry, or sorrowful scenes:
     * Gender and apparent age.
     * Pitch and vocal range (e.g., medium-low baritone, bright lyric alto, light tenor, resonant contralto).
     * Tone and texture (e.g., warm, crisp, smooth, lightly raspy, husky, sharp, breathy, dry).
     * Resonance and vocal weight (e.g., grounded chest resonance, light airy weight, firm projection).
     * Clarity, articulation, and speaking cadence (e.g., clean enunciation, unhurried measured pacing, brisk clipped rhythm, relaxed conversational flow).
     * Subtle, natural baseline vocal character (e.g., "a sharp, slightly cool, naturally assertive tone" is good; "aggressively intimidating" or "intensely dramatic" is bad).
   - Example:
     "A man in his late twenties with a medium-low, smooth baritone voice and grounded chest resonance. His tone is clear and slightly cool with clean articulation, moderate vocal weight, and an unhurried, naturally composed cadence."
3. `sample_lines` MUST contain 2 to 3 clean, natural, standalone sentences (roughly 25-45 words total, ~8-15 seconds of speech) in the character's authentic diction and baseline conversational register.
   - Avoid shouting, whispering, melodrama, sound effects, or tiny 1-2 word fragments.
   - Steady, clear, emotionally balanced sentences produce the cleanest, most versatile zero-shot voice cloning reference in Chatterbox-Turbo.
"""


class CharacterDossierService:
    @classmethod
    async def collect_character_excerpts(
        cls,
        project_id: str,
        character: CharacterModel,
        db: AsyncSession,
        max_excerpts: int = 15,
    ) -> tuple[list[dict[str, Any]], list[int]]:
        """
        Sample evenly spread appearances of a character across the novel (first appearance + spread across chapters),
        including ±1 adjacent narration segments for descriptive context.
        Scales efficiently to 2,882+ chapters using indexed character_id queries.
        """
        stmt = (
            select(
                ScriptSegmentModel.id,
                ScriptSegmentModel.chapter_id,
                ScriptSegmentModel.order_index,
                ScriptSegmentModel.text,
                ScriptSegmentModel.delivery_type,
                ChapterModel.chapter_number,
                ChapterModel.title,
            )
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(
                ChapterModel.project_id == project_id,
                ScriptSegmentModel.character_id == character.id,
            )
            .order_by(ChapterModel.chapter_number.asc(), ScriptSegmentModel.order_index.asc())
        )
        rows = (await db.execute(stmt)).all()

        # Fallback to speaker name match if character_id wasn't linked yet
        if not rows:
            stmt_name = (
                select(
                    ScriptSegmentModel.id,
                    ScriptSegmentModel.chapter_id,
                    ScriptSegmentModel.order_index,
                    ScriptSegmentModel.text,
                    ScriptSegmentModel.delivery_type,
                    ChapterModel.chapter_number,
                    ChapterModel.title,
                )
                .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
                .where(
                    ChapterModel.project_id == project_id,
                    ScriptSegmentModel.speaker == character.name,
                )
                .order_by(ChapterModel.chapter_number.asc(), ScriptSegmentModel.order_index.asc())
            )
            rows = (await db.execute(stmt_name)).all()

        if not rows:
            return [], []

        # Pick first 3 appearances + evenly spaced appearances across the rest of the novel
        total = len(rows)
        if total <= max_excerpts:
            selected = list(rows)
        else:
            selected_indices = {0, 1, 2}
            remaining = max_excerpts - len(selected_indices)
            step = (total - 3) / max(1, remaining)
            for i in range(remaining):
                idx = min(total - 1, 3 + int(i * step))
                selected_indices.add(idx)
            selected = [rows[i] for i in sorted(selected_indices)]

        # Fetch ±1 neighbor segments for narrative descriptions around selected lines
        excerpts: list[dict[str, Any]] = []
        chapters_sampled: set[int] = set()
        for row in selected:
            chapters_sampled.add(row.chapter_number)
            neighbor_stmt = (
                select(ScriptSegmentModel.order_index, ScriptSegmentModel.text, ScriptSegmentModel.speaker)
                .where(
                    ScriptSegmentModel.chapter_id == row.chapter_id,
                    ScriptSegmentModel.order_index >= row.order_index - 1,
                    ScriptSegmentModel.order_index <= row.order_index + 1,
                )
                .order_by(ScriptSegmentModel.order_index.asc())
            )
            neighbors = (await db.execute(neighbor_stmt)).all()
            context_lines = [
                f"{n.speaker or 'Narrator'}: {n.text}"
                for n in neighbors
                if n.text
            ]
            excerpts.append(
                {
                    "chapter_number": row.chapter_number,
                    "chapter_title": row.title,
                    "character_line": row.text,
                    "surrounding_context": context_lines,
                }
            )

        return excerpts, sorted(chapters_sampled)

    @classmethod
    async def build_character_dossier(
        cls,
        project_id: str,
        character: CharacterModel,
        db: AsyncSession,
        max_excerpts: int = 15,
    ) -> tuple[dict[str, Any], dict[str, int]]:
        """Synthesize and persist a structured CharacterDossier for a single character."""
        project = await db.get(ProjectModel, project_id)
        excerpts, chapters_sampled = await cls.collect_character_excerpts(
            project_id=project_id,
            character=character,
            db=db,
            max_excerpts=max_excerpts,
        )

        user_payload = {
            "project_title": project.title if project else "",
            "character": {
                "name": character.name,
                "gender": character.gender,
                "aliases": character.aliases or [],
                "existing_role_description": character.role_description,
                "dialogue_count": character.dialogue_count,
                "chapters_span": character.chapters_span,
            },
            "excerpts": excerpts,
        }

        dossier_obj, usage = await StructuredLLMClient.complete_json(
            system_prompt=DOSSIER_SYSTEM_PROMPT,
            user_payload=user_payload,
            response_model=CharacterDossierSchema,
            temperature=0.2,
        )

        dossier_dict = dossier_obj.model_dump()
        dossier_dict["chapters_sampled"] = chapters_sampled
        dossier_dict["updated_at"] = datetime.now(UTC).isoformat()

        character.dossier = dossier_dict
        if not character.role_description and dossier_obj.summary:
            character.role_description = dossier_obj.summary[:255]
        character.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(character)
        return dossier_dict, usage

    @classmethod
    async def build_project_dossiers(
        cls,
        project_id: str,
        db: AsyncSession,
        character_ids: list[str] | None = None,
        refresh: bool = False,
        max_excerpts: int = 15,
    ) -> BuildDossiersResponseSchema:
        """Generate or refresh character dossiers for selected (or all eligible) characters in a project."""
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        stmt = select(CharacterModel).where(CharacterModel.project_id == project_id)
        if character_ids:
            stmt = stmt.where(CharacterModel.id.in_(character_ids))
        else:
            stmt = stmt.where(
                CharacterModel.is_system.is_(False),
                CharacterModel.is_general.is_(False),
            )
        stmt = stmt.order_by(CharacterModel.dialogue_count.desc())
        characters = list((await db.execute(stmt)).scalars().all())

        results: list[CharacterDossierResultItem] = []
        generated_count = 0
        skipped_count = 0
        failed_count = 0
        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
            "reasoning_tokens": 0,
        }

        for char in characters:
            if char.name.lower() in {"narrator", "system / interface"} and not character_ids:
                continue
            if char.dossier and not refresh:
                skipped_count += 1
                results.append(
                    CharacterDossierResultItem(
                        character_id=char.id,
                        character_name=char.name,
                        status="skipped",
                        dossier=char.dossier,
                    )
                )
                continue

            try:
                dossier_dict, usage = await cls.build_character_dossier(
                    project_id=project_id,
                    character=char,
                    db=db,
                    max_excerpts=max_excerpts,
                )
                generated_count += 1
                for k in total_usage:
                    total_usage[k] += usage.get(k, 0)
                results.append(
                    CharacterDossierResultItem(
                        character_id=char.id,
                        character_name=char.name,
                        status="generated",
                        dossier=dossier_dict,
                    )
                )
            except Exception as exc:
                failed_count += 1
                logger.warning("Failed to build dossier for character '%s': %s", char.name, exc)
                results.append(
                    CharacterDossierResultItem(
                        character_id=char.id,
                        character_name=char.name,
                        status="failed",
                        error=str(exc),
                    )
                )

        return BuildDossiersResponseSchema(
            project_id=project_id,
            generated_count=generated_count,
            skipped_count=skipped_count,
            failed_count=failed_count,
            usage=total_usage,
            items=results,
        )
