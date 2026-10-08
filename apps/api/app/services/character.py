from app.models.character import CharacterModel
from app.schemas.character import (
    BatchCastAssignRequest,
    CharacterResponse,
)
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.character")


class CharacterService:
    @staticmethod
    async def get_project_characters(
        project_id: str,
        db: AsyncSession,
    ) -> list[CharacterResponse]:
        """Fetch project characters."""
        stmt = select(CharacterModel).where(CharacterModel.project_id == project_id)
        result = await db.execute(stmt)
        characters = result.scalars().all()
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
