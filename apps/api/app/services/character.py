import uuid

from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.schemas.character import (
    BatchCastAssignRequest,
    CharacterResponse,
)
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.character")

DEFAULT_CAST = [
    {
        "name": "Narrator",
        "slug": "narrator",
        "gender": "narrator",
        "role_description": "Narration · Entire novel",
        "dialogue_count": 0,
        "word_count": 82410,
        "chapters_span": "Entire novel",
        "assigned_voice_id": "elena-park",
        "assigned_voice_name": "Elena Park",
    },
    {
        "name": "Mara Vale",
        "slug": "mara-vale",
        "gender": "female",
        "role_description": "Female · Protagonist",
        "dialogue_count": 318,
        "word_count": 14200,
        "chapters_span": "Chapters 1–24",
        "assigned_voice_id": "female-general",
        "assigned_voice_name": "Female General",
    },
    {
        "name": "Elias Thorne",
        "slug": "elias-thorne",
        "gender": "male",
        "role_description": "Male · Orchard keeper",
        "dialogue_count": 146,
        "word_count": 7650,
        "chapters_span": "Chapters 3–21",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
    {
        "name": "June Vale",
        "slug": "june-vale",
        "gender": "female",
        "role_description": "Female · Mara's sister",
        "dialogue_count": 92,
        "word_count": 4120,
        "chapters_span": "Chapters 2–18",
        "assigned_voice_id": "female-general",
        "assigned_voice_name": "Female General",
    },
    {
        "name": "Dr. Rowan Bell",
        "slug": "dr-rowan-bell",
        "gender": "male",
        "role_description": "Male · Surveyor",
        "dialogue_count": 54,
        "word_count": 2890,
        "chapters_span": "Chapters 6–14",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
    {
        "name": "Mrs. Penrose",
        "slug": "mrs-penrose",
        "gender": "female",
        "role_description": "Female · Neighbor",
        "dialogue_count": 27,
        "word_count": 1150,
        "chapters_span": "Chapters 4–9",
        "assigned_voice_id": "female-general",
        "assigned_voice_name": "Female General",
    },
    {
        "name": "Llywelyn",
        "slug": "llywelyn",
        "gender": "male",
        "role_description": "Male · Elder",
        "dialogue_count": 18,
        "word_count": 890,
        "chapters_span": "Chapters 4–17",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
    {
        "name": "Canal Overseer",
        "slug": "canal-overseer",
        "gender": "male",
        "role_description": "Male · Official",
        "dialogue_count": 14,
        "word_count": 640,
        "chapters_span": "Chapters 7–12",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
    {
        "name": "Silas Ward",
        "slug": "silas-ward",
        "gender": "male",
        "role_description": "Male · Blacksmith",
        "dialogue_count": 12,
        "word_count": 510,
        "chapters_span": "Chapters 5–10",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
    {
        "name": "Evelyn Thorne",
        "slug": "evelyn-thorne",
        "gender": "female",
        "role_description": "Female · Weaver",
        "dialogue_count": 9,
        "word_count": 380,
        "chapters_span": "Chapters 8–15",
        "assigned_voice_id": "female-general",
        "assigned_voice_name": "Female General",
    },
    {
        "name": "Young Courier",
        "slug": "young-courier",
        "gender": "male",
        "role_description": "Male · Runner",
        "dialogue_count": 6,
        "word_count": 220,
        "chapters_span": "Chapters 11–13",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
    {
        "name": "Wagon Driver",
        "slug": "wagon-driver",
        "gender": "male",
        "role_description": "Male · Traveler",
        "dialogue_count": 4,
        "word_count": 140,
        "chapters_span": "Chapters 4–5",
        "assigned_voice_id": "male-general",
        "assigned_voice_name": "Male General",
    },
]


class CharacterService:
    @staticmethod
    async def get_project_characters(
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterResponse]:
        """Fetch project characters, seeding the default cast roster if empty."""
        stmt = select(CharacterModel).where(CharacterModel.project_id == project_id)
        result = await db.execute(stmt)
        characters = result.scalars().all()

        if not characters:
            # Seed the 12 characters matching the Voice & casting screenshot
            proj_stmt = select(ProjectModel).where(ProjectModel.id == project_id)
            proj = (await db.execute(proj_stmt)).scalar_one_or_none()
            if not proj:
                raise NotFoundError(f"Project with ID '{project_id}' not found")

            created_chars = []
            for item in DEFAULT_CAST:
                c = CharacterModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    name=item["name"],
                    slug=item["slug"],
                    gender=item["gender"],
                    role_description=item["role_description"],
                    dialogue_count=item["dialogue_count"],
                    word_count=item["word_count"],
                    chapters_span=item["chapters_span"],
                    assigned_voice_id=item["assigned_voice_id"],
                    assigned_voice_name=item["assigned_voice_name"],
                )
                db.add(c)
                created_chars.append(c)

            await db.commit()
            characters = created_chars

        return [CharacterResponse.model_validate(c) for c in characters]

    @staticmethod
    async def batch_assign_voices(
        project_id: str,
        payload: BatchCastAssignRequest,
        db: AsyncSession,
    ) -> list[CharacterResponse]:
        """Update voice assignments for characters."""
        stmt = select(CharacterModel).where(CharacterModel.project_id == project_id)
        result = await db.execute(stmt)
        char_map = {c.id: c for c in result.scalars().all()}

        for assignment in payload.assignments:
            char = char_map.get(assignment.character_id)
            if char:
                char.assigned_voice_id = assignment.assigned_voice_id
                char.assigned_voice_name = assignment.assigned_voice_name

        await db.commit()
        return [CharacterResponse.model_validate(c) for c in char_map.values()]

    @staticmethod
    async def set_defaults_by_gender(
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterResponse]:
        """Automatically set default voices based on inferred gender."""
        stmt = select(CharacterModel).where(CharacterModel.project_id == project_id)
        result = await db.execute(stmt)
        characters = result.scalars().all()

        for c in characters:
            if c.gender == "narrator":
                c.assigned_voice_id = "elena-park"
                c.assigned_voice_name = "Elena Park"
            elif c.gender == "female":
                c.assigned_voice_id = "female-general"
                c.assigned_voice_name = "Female General"
            else:
                c.assigned_voice_id = "male-general"
                c.assigned_voice_name = "Male General"

        await db.commit()
        return [CharacterResponse.model_validate(c) for c in characters]
