import re
import uuid

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.schemas.character import (
    CharacterAliasSuggestionSchema,
    CharacterCreateSchema,
    CharacterMergeSchema,
    CharacterUpdateSchema,
)
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.character")

# Default voice catalog matching the Voice & Casting design mockup
DEFAULT_VOICES = {
    "narrator": {"id": "voice_elena_park", "name": "Elena Park"},
    "male": {"id": "voice_male_general", "name": "Male General"},
    "female": {"id": "voice_female_general", "name": "Female General"},
    "system": {"id": "voice_system_chime", "name": "System Chime"},
}


class CharacterService:
    @staticmethod
    def slugify(name: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
        return slug or "character"

    @classmethod
    async def get_project_characters(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterModel]:
        """Fetch all characters for a project, ordered by dialogue prominence."""
        stmt = (
            select(CharacterModel)
            .where(CharacterModel.project_id == project_id)
            .order_by(CharacterModel.dialogue_count.desc(), CharacterModel.name.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def create_character(
        cls,
        project_id: str,
        dto: CharacterCreateSchema,
        db: AsyncSession,
    ) -> CharacterModel:
        """Create a new character in a project."""
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project with ID '{project_id}' not found")

        slug = cls.slugify(dto.name)
        character = CharacterModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            name=dto.name.strip(),
            slug=slug,
            gender=dto.gender.lower(),
            role_description=dto.role_description,
            assigned_voice_id=dto.assigned_voice_id,
            assigned_voice_name=dto.assigned_voice_name,
            is_general=dto.is_general,
            aliases=[],
        )
        db.add(character)
        await db.commit()
        await db.refresh(character)
        return character

    @classmethod
    async def update_character(
        cls,
        project_id: str,
        character_id: str,
        dto: CharacterUpdateSchema,
        db: AsyncSession,
    ) -> CharacterModel:
        """
        Update character details. If character name is overridden (e.g. 'Seo' -> 'Suhh'),
        propagates the new name across all attributed segments and records old name in aliases.
        """
        character = await db.get(CharacterModel, character_id)
        if not character or character.project_id != project_id:
            raise NotFoundError(f"Character with ID '{character_id}' not found")

        if dto.name and dto.name.strip() != character.name:
            old_name = character.name
            new_name = dto.name.strip()

            # Record former name in aliases
            aliases = list(character.aliases or [])
            if old_name not in aliases:
                aliases.append(old_name)
            character.aliases = aliases

            character.name = new_name
            character.slug = cls.slugify(new_name)

            # Atomically update speaker label on all associated script segments
            await db.execute(
                update(ScriptSegmentModel)
                .where(ScriptSegmentModel.character_id == character.id)
                .values(speaker=new_name)
            )
            logger.info(
                "Renamed character '%s' to '%s' (id: %s) and updated dialogue segments",
                old_name,
                new_name,
                character.id,
            )

        if dto.gender is not None:
            character.gender = dto.gender.lower()
        if dto.role_description is not None:
            character.role_description = dto.role_description
        if dto.assigned_voice_id is not None:
            character.assigned_voice_id = dto.assigned_voice_id
        if dto.assigned_voice_name is not None:
            character.assigned_voice_name = dto.assigned_voice_name

        await db.commit()
        await db.refresh(character)
        return character

    @classmethod
    async def set_defaults_by_gender(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterModel]:
        """
        Assign default voice profiles based on inferred gender:
        - narrator -> Elena Park
        - male -> Male General
        - female -> Female General
        """
        characters = await cls.get_project_characters(project_id, db)
        for char in characters:
            if char.is_system or char.name.lower() in ("system", "system / interface"):
                default = DEFAULT_VOICES.get("system", {"id": "voice_system_chime", "name": "System Chime"})
            else:
                gender = (char.gender or "male").lower()
                default = DEFAULT_VOICES.get(gender, DEFAULT_VOICES["male"])
            char.assigned_voice_id = default["id"]
            char.assigned_voice_name = default["name"]

        await db.commit()
        for char in characters:
            await db.refresh(char)
        return characters

    @classmethod
    async def reset_all_cast(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterModel]:
        """Reset all voice assignments for characters in project."""
        characters = await cls.get_project_characters(project_id, db)
        for char in characters:
            char.assigned_voice_id = None
            char.assigned_voice_name = None

        await db.commit()
        for char in characters:
            await db.refresh(char)
        return characters

    @classmethod
    async def sync_characters_from_segments(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterModel]:
        """
        Inspect parsed segments in project, upsert character entities with dialogue counts,
        word counts, chapter spans, and link segment.character_id.
        """
        # Ensure any non-narrator speaker segments have is_dialogue set to True
        await db.execute(
            update(ScriptSegmentModel)
            .where(
                ScriptSegmentModel.chapter_id.in_(
                    select(ChapterModel.id).where(ChapterModel.project_id == project_id)
                ),
                ScriptSegmentModel.speaker.isnot(None),
                func.lower(ScriptSegmentModel.speaker) != "narrator",
                ScriptSegmentModel.is_dialogue.is_(False),
            )
            .values(is_dialogue=True)
        )

        # Find all dialogue segments in this project
        stmt = (
            select(
                ScriptSegmentModel.speaker,
                ScriptSegmentModel.speaker_gender,
                func.count(ScriptSegmentModel.id).label("line_count"),
                ChapterModel.chapter_number,
            )
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(
                ChapterModel.project_id == project_id,
                ScriptSegmentModel.is_dialogue.is_(True),
                ScriptSegmentModel.speaker.isnot(None),
            )
            .group_by(
                ScriptSegmentModel.speaker,
                ScriptSegmentModel.speaker_gender,
                ChapterModel.chapter_number,
            )
        )
        rows = (await db.execute(stmt)).all()

        speaker_stats: dict[str, dict] = {}
        for speaker, gender, count, chap_num in rows:
            if not speaker:
                continue
            if speaker not in speaker_stats:
                speaker_stats[speaker] = {
                    "gender": gender or "male",
                    "lines": 0,
                    "chapters": set(),
                }
            speaker_stats[speaker]["lines"] += count
            speaker_stats[speaker]["chapters"].add(chap_num)

        # Calculate non-dialogue prose for Narrator
        narr_stmt = (
            select(ScriptSegmentModel.text)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(
                ChapterModel.project_id == project_id,
                ScriptSegmentModel.is_dialogue.is_(False),
            )
        )
        narr_texts = (await db.execute(narr_stmt)).scalars().all()
        narr_words = sum(len(t.split()) for t in narr_texts)

        # Existing characters
        existing = await cls.get_project_characters(project_id, db)
        existing_by_name = {c.name.lower(): c for c in existing}

        created_or_updated: list[CharacterModel] = []

        # Ensure Narrator exists
        narr_char = existing_by_name.get("narrator")
        if not narr_char:
            narr_char = CharacterModel(
                id=str(uuid.uuid4()),
                project_id=project_id,
                name="Narrator",
                slug="narrator",
                gender="neutral",
                role_description="Narration · Entire novel",
                dialogue_count=0,
                word_count=narr_words,
                assigned_voice_id=DEFAULT_VOICES["narrator"]["id"],
                assigned_voice_name=DEFAULT_VOICES["narrator"]["name"],
                aliases=[],
            )
            db.add(narr_char)
            await db.flush()
        else:
            narr_char.word_count = narr_words
            if not narr_char.role_description:
                narr_char.role_description = "Narration · Entire novel"
        created_or_updated.append(narr_char)

        # Collect distinct raw_speaker_tags for each speaker to populate aliases
        alias_stmt = (
            select(
                ScriptSegmentModel.speaker,
                ScriptSegmentModel.raw_speaker_tag,
            )
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(
                ChapterModel.project_id == project_id,
                ScriptSegmentModel.is_dialogue.is_(True),
                ScriptSegmentModel.speaker.isnot(None),
                ScriptSegmentModel.raw_speaker_tag.isnot(None),
            )
            .distinct()
        )
        alias_rows = (await db.execute(alias_stmt)).all()
        aliases_by_speaker: dict[str, set[str]] = {}
        for spk, raw_tag in alias_rows:
            if spk and raw_tag and raw_tag.strip().lower() != spk.strip().lower():
                aliases_by_speaker.setdefault(spk, set()).add(raw_tag.strip())

        for name, stats in speaker_stats.items():
            if name.lower() == "narrator":
                continue
            ch_list = sorted(stats["chapters"])
            span = (
                f"Chapters {ch_list[0]}–{ch_list[-1]}"
                if len(ch_list) > 1
                else f"Chapter {ch_list[0]}"
            )

            char = existing_by_name.get(name.lower())
            new_aliases = aliases_by_speaker.get(name, set())
            if not char:
                char = CharacterModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    name=name,
                    slug=cls.slugify(name),
                    gender=stats["gender"].lower(),
                    dialogue_count=stats["lines"],
                    chapters_span=span,
                    aliases=sorted(list(new_aliases)),
                )
                db.add(char)
                await db.flush()
            else:
                char.dialogue_count = stats["lines"]
                char.chapters_span = span
                cur_aliases = set(char.aliases or [])
                char.aliases = sorted(list(cur_aliases | new_aliases))

            # Link segments to this character
            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id.in_(
                        select(ChapterModel.id).where(ChapterModel.project_id == project_id)
                    ),
                    ScriptSegmentModel.speaker == name,
                    ScriptSegmentModel.character_id.is_(None),
                )
                .values(character_id=char.id)
            )
            created_or_updated.append(char)

        # Ensure System / Interface character exists if system prompts are present
        sys_count_stmt = (
            select(func.count(ScriptSegmentModel.id))
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(
                ChapterModel.project_id == project_id,
                ScriptSegmentModel.delivery_type == "system_prompt",
            )
        )
        sys_count = (await db.execute(sys_count_stmt)).scalar() or 0
        if sys_count > 0:
            sys_char = existing_by_name.get("system / interface") or existing_by_name.get("system")
            if not sys_char:
                sys_char = CharacterModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    name="System / Interface",
                    slug="system-interface",
                    gender="neutral",
                    role_description="System alerts · LitRPG notifications",
                    dialogue_count=sys_count,
                    word_count=0,
                    assigned_voice_id=DEFAULT_VOICES["system"]["id"],
                    assigned_voice_name=DEFAULT_VOICES["system"]["name"],
                    is_general=True,
                    is_system=True,
                    aliases=[],
                )
                db.add(sys_char)
                await db.flush()
            else:
                sys_char.dialogue_count = sys_count
                sys_char.is_system = True
                if not sys_char.assigned_voice_id:
                    sys_char.assigned_voice_id = DEFAULT_VOICES["system"]["id"]
                    sys_char.assigned_voice_name = DEFAULT_VOICES["system"]["name"]
            created_or_updated.append(sys_char)

            # Link system prompt segments to this character
            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id.in_(
                        select(ChapterModel.id).where(ChapterModel.project_id == project_id)
                    ),
                    ScriptSegmentModel.delivery_type == "system_prompt",
                    ScriptSegmentModel.character_id.is_(None),
                )
                .values(character_id=sys_char.id, speaker="System / Interface")
            )

        await db.commit()
        return created_or_updated

    @classmethod
    async def merge_characters(
        cls,
        project_id: str,
        payload: CharacterMergeSchema,
        db: AsyncSession,
    ) -> CharacterModel:
        """Merge a redundant character into a canonical character and update segments."""
        if payload.source_character_id == payload.target_character_id:
            raise ValidationError("Cannot merge a character into itself")

        source = await db.get(CharacterModel, payload.source_character_id)
        if not source or source.project_id != project_id:
            raise NotFoundError(f"Source character '{payload.source_character_id}' not found in project")

        target = await db.get(CharacterModel, payload.target_character_id)
        if not target or target.project_id != project_id:
            raise NotFoundError(f"Target character '{payload.target_character_id}' not found in project")

        # 1. Accumulate aliases onto target
        target_aliases = list(target.aliases or [])
        if source.name not in target_aliases:
            target_aliases.append(source.name)
        for alias in (source.aliases or []):
            if alias not in target_aliases:
                target_aliases.append(alias)
        target.aliases = target_aliases

        # 2. Re-assign all script segments from source to target
        await db.execute(
            update(ScriptSegmentModel)
            .where(ScriptSegmentModel.character_id == source.id)
            .values(
                character_id=target.id,
                speaker=target.name,
                speaker_gender=target.gender,
            )
        )

        # Also re-assign any segments where speaker == source.name in this project
        proj_chap_stmt = select(ChapterModel.id).where(ChapterModel.project_id == project_id)
        await db.execute(
            update(ScriptSegmentModel)
            .where(
                ScriptSegmentModel.chapter_id.in_(proj_chap_stmt),
                ScriptSegmentModel.speaker == source.name,
            )
            .values(
                character_id=target.id,
                speaker=target.name,
                speaker_gender=target.gender,
            )
        )

        # 3. Aggregate dialogue count & word count
        target.dialogue_count += source.dialogue_count
        target.word_count += source.word_count

        # 4. Delete the source character
        await db.delete(source)
        await db.commit()
        await db.refresh(target)

        logger.info(
            "Merged character '%s' (%s) into canonical '%s' (%s) in project %s",
            source.name,
            source.id,
            target.name,
            target.id,
            project_id,
        )
        return target

    @classmethod
    async def get_alias_suggestions(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterAliasSuggestionSchema]:
        """Detect potential character alias merge candidates based on titles and tokens."""
        chars = await cls.get_project_characters(project_id, db)
        if len(chars) < 2:
            return []

        TITLES = {
            "director", "chief", "section chief", "elder", "brother", "senior brother",
            "junior brother", "sister", "senior sister", "master", "patriarch",
            "doctor", "dr.", "dr", "mr.", "mr", "mrs.", "mrs", "miss", "ms.", "ms",
            "captain", "general", "lieutenant", "sergeant", "lord", "lady"
        }

        suggestions: list[CharacterAliasSuggestionSchema] = []
        seen_pairs: set[tuple[str, str]] = set()

        for i, c1 in enumerate(chars):
            for c2 in chars[i + 1 :]:
                if c1.id == c2.id or c1.is_general or c2.is_general or c1.is_system or c2.is_system:
                    continue

                name1_lower = c1.name.lower().strip()
                name2_lower = c2.name.lower().strip()

                # Clean titles
                clean1 = name1_lower
                clean2 = name2_lower
                for t in sorted(TITLES, key=len, reverse=True):
                    if clean1.startswith(t + " "):
                        clean1 = clean1[len(t) + 1 :].strip()
                    if clean2.startswith(t + " "):
                        clean2 = clean2[len(t) + 1 :].strip()

                tokens1 = set(clean1.split())
                tokens2 = set(clean2.split())
                common_tokens = tokens1.intersection(tokens2)
                is_sub = (clean1 in clean2 or clean2 in clean1) and min(len(clean1), len(clean2)) >= 3

                if common_tokens or is_sub:
                    # Decide canonical target: title prefix is source/alias, clean name is canonical target
                    has_title1 = clean1 != name1_lower
                    has_title2 = clean2 != name2_lower
                    if has_title1 and not has_title2:
                        source, target = c1, c2
                    elif has_title2 and not has_title1:
                        source, target = c2, c1
                    elif c1.dialogue_count != c2.dialogue_count:
                        source, target = (c2, c1) if c1.dialogue_count > c2.dialogue_count else (c1, c2)
                    elif len(tokens1) != len(tokens2):
                        source, target = (c2, c1) if len(tokens1) > len(tokens2) else (c1, c2)
                    else:
                        source, target = (c2, c1) if len(clean1) > len(clean2) else (c1, c2)

                    pair_key = (source.id, target.id)
                    if pair_key not in seen_pairs:
                        seen_pairs.add(pair_key)
                        reason = (
                            f"'{source.name}' shares name token with '{target.name}'"
                            if common_tokens
                            else f"'{source.name}' is contained within '{target.name}'"
                        )
                        suggestions.append(
                            CharacterAliasSuggestionSchema(
                                source_character_id=source.id,
                                source_name=source.name,
                                target_character_id=target.id,
                                target_name=target.name,
                                reason=reason,
                                confidence=0.88 if common_tokens else 0.80,
                            )
                        )

        return suggestions
