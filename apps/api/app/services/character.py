import re
import uuid

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.schemas.character import CharacterCreateSchema, CharacterUpdateSchema
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
            if not char:
                char = CharacterModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    name=name,
                    slug=cls.slugify(name),
                    gender=stats["gender"].lower(),
                    dialogue_count=stats["lines"],
                    chapters_span=span,
                    aliases=[],
                )
                db.add(char)
                await db.flush()
            else:
                char.dialogue_count = stats["lines"]
                char.chapters_span = span

            # Link segments to this character
            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.speaker == name,
                    ScriptSegmentModel.character_id.is_(None),
                )
                .values(character_id=char.id)
            )
            created_or_updated.append(char)

        await db.commit()
        return created_or_updated
