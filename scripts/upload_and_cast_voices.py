import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path
import uuid

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.db.session import get_session_factory
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.models.voice import VoiceModel
from app.services.voice import VoiceService

PROJECT_ID = "5e21e6ce-e526-4360-af10-f334537d7bde"
USER_ID = "252922e5-f62d-4ca9-933c-6fae717b18f4"
VOICES_DIR = Path("/Users/elhamdev/Downloads/voices")

VOICE_SPECS = [
    {
        "filename": "mc.wav",
        "name": "Protagonist (Deculein)",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "narrator.wav",
        "name": "Narrator",
        "gender": "neutral",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "system.wav",
        "name": "System / Interface",
        "gender": "neutral",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "male-general-narrator-like-character.mp3",
        "name": "Male General",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/mpeg",
    },
    {
        "filename": "female-general.wav",
        "name": "Female General",
        "gender": "female",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "male-adult.wav",
        "name": "Male Adult",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "male-deep-intense.mp3",
        "name": "Male Deep & Intense",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/mpeg",
    },
    {
        "filename": "male-mature.wav",
        "name": "Male Mature",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "male-storyteller-with-emotions.mp3",
        "name": "Male Storyteller",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/mpeg",
    },
    {
        "filename": "male-teenage.wav",
        "name": "Male Teenage",
        "gender": "male",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "female-adult.wav",
        "name": "Female Adult",
        "gender": "female",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "female-companion.wav",
        "name": "Female Companion",
        "gender": "female",
        "is_global": True,
        "content_type": "audio/wav",
    },
    {
        "filename": "female-energetic.mp3",
        "name": "Female Energetic",
        "gender": "female",
        "is_global": True,
        "content_type": "audio/mpeg",
    },
    {
        "filename": "female-heartbroken-and-sad.mp3",
        "name": "Female Heartbroken & Sad",
        "gender": "female",
        "is_global": True,
        "content_type": "audio/mpeg",
    },
]

CHARACTER_ASSIGNMENTS = {
    # Protagonist & System
    "Deculein": "Protagonist (Deculein)",
    "Narrator": "Narrator",
    "System / Interface": "System / Interface",
    "General Female": "Female General",
    "General Male": "Male General",

    # Major & Supporting Females
    "Sophien": "Female Adult",
    "Primienne": "Female Adult",
    "Louina": "Female Adult",
    "Josephine": "Female Adult",

    "Yeriel": "Female Companion",
    "Sylvia": "Female Companion",
    "Reylie": "Female Companion",
    "Lia": "Female Companion",

    "Epherene": "Female Energetic",
    "Ganesha": "Female Energetic",
    "Adrienne": "Female Energetic",

    "Julie": "Female Heartbroken & Sad",

    # Minor Females (<20 lines) -> Female General
    "Marone": "Female General",
    "Ellie": "Female General",
    "Julia": "Female General",

    # Mature & Elder Males
    "Ihelm": "Male Mature",
    "Chairman": "Male Mature",
    "Gindalf": "Male Mature",

    # Deep, Intense, Solemn Males
    "Keiron": "Male Deep & Intense",
    "Rohakan": "Male Deep & Intense",
    "Zeit": "Male Deep & Intense",

    # Youth / Teenage Males
    "Allen": "Male Teenage",
    "Kreto": "Male Teenage",
    "Prince Kreto": "Male Teenage",
    "Drent": "Male Teenage",
    "Leo": "Male Teenage",

    # Storyteller / Theatrical Males
    "Idnik": "Male Storyteller",
    "Relin": "Male Storyteller",
    "Carla": "Male Storyteller",
    "Hesrock": "Male Storyteller",

    # Adult Males (Servants/Staff)
    "Ren": "Male Adult",
    "Butler Ren": "Male Adult",
    "Secretary Ren": "Male Adult",

    # Minor Males (<20 lines) -> Male General
    "Jolang": "Male General",
    "Lexil": "Male General",
    "Zuphan": "Male General",
    "Captain Rockfell": "Male General",
    "Devron": "Male General",
    "Gurken": "Male General",
    "Romelock": "Male General",
    "Crebaim": "Male General",
    "Maho": "Male General",
    "Gwen": "Male General",
    "Director Drumman": "Male General",
    "Knights": "Male General",
    "Rodran": "Male General",
    "The Knight": "Male General",
}


async def main():
    async_session = get_session_factory()
    async with async_session() as session:
        proj = await session.get(ProjectModel, PROJECT_ID)
        if not proj:
            print(f"Error: Project {PROJECT_ID} not found.")
            return

        print(f"Found project: {proj.title} (ID: {proj.id})")

        # 1. Upload/register voices
        created_voices: dict[str, VoiceModel] = {}
        
        # Check existing voices for this user
        existing_voices_res = await session.execute(
            select(VoiceModel).where(VoiceModel.user_id == USER_ID)
        )
        existing_by_name = {v.name: v for v in existing_voices_res.scalars().all()}

        for spec in VOICE_SPECS:
            file_path = VOICES_DIR / spec["filename"]
            if not file_path.exists():
                print(f"Warning: File {file_path} not found!")
                continue

            voice_name = spec["name"]
            if voice_name in existing_by_name:
                print(f"Voice '{voice_name}' already exists (ID: {existing_by_name[voice_name].id}), skipping upload.")
                created_voices[voice_name] = existing_by_name[voice_name]
                continue

            content = file_path.read_bytes()
            voice_id = str(uuid.uuid4())
            storage_key = f"voices/{USER_ID}/{voice_id}/{spec['filename']}"

            # Upload to Cloudflare R2 and cache locally
            VoiceService._upload_file_bytes(content, storage_key, spec["content_type"])
            duration = VoiceService._calculate_audio_duration(content)

            voice = VoiceModel(
                id=voice_id,
                user_id=USER_ID,
                project_id=None if spec["is_global"] else PROJECT_ID,
                name=voice_name,
                gender=spec["gender"],
                is_global=spec["is_global"],
                audio_storage_key=storage_key,
                avatar_storage_key=None,
                reference_text=None,
                duration_seconds=duration,
            )
            session.add(voice)
            created_voices[voice_name] = voice
            print(f"Uploaded voice: '{voice_name}' -> R2: {storage_key} ({duration}s, ID: {voice_id})")

        await session.flush()

        # 2. Update project default male/female voice settings
        settings_dict = dict(proj.settings or {})
        if "Male General" in created_voices:
            settings_dict["default_male_voice_id"] = created_voices["Male General"].id
            settings_dict["default_male_voice_name"] = "Male General"
        if "Female General" in created_voices:
            settings_dict["default_female_voice_id"] = created_voices["Female General"].id
            settings_dict["default_female_voice_name"] = "Female General"

        proj.settings = settings_dict
        flag_modified(proj, "settings")
        print(f"Updated project settings defaults: male={settings_dict.get('default_male_voice_name')}, female={settings_dict.get('default_female_voice_name')}")

        # 3. Assign voices to characters
        chars_res = await session.execute(
            select(CharacterModel).where(CharacterModel.project_id == PROJECT_ID)
        )
        characters = chars_res.scalars().all()
        print(f"\nAssigning voices to {len(characters)} characters...")

        assigned_count = 0
        for char in characters:
            target_voice_name = CHARACTER_ASSIGNMENTS.get(char.name)
            if not target_voice_name:
                # Fallback based on gender if unknown character appears
                if (char.gender or "").lower() == "female":
                    target_voice_name = "Female General"
                else:
                    target_voice_name = "Male General"

            target_voice = created_voices.get(target_voice_name)
            if target_voice:
                char.assigned_voice_id = target_voice.id
                char.assigned_voice_name = target_voice.name
                char.updated_at = datetime.now(UTC)
                assigned_count += 1
                print(f"  [{char.gender:6}] {char.name:20} -> {target_voice.name} ({target_voice.gender})")
            else:
                print(f"  Warning: Target voice '{target_voice_name}' not resolved for '{char.name}'")

        await session.commit()
        print(f"\nSuccessfully committed changes! Assigned voices to {assigned_count}/{len(characters)} characters.")


if __name__ == "__main__":
    asyncio.run(main())
