import io
import re
import uuid
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.voice import VoiceModel
from app.schemas.voice import VoiceResponseSchema
from app.services.attachment import AttachmentService, get_s3_client
from fastapi import UploadFile
from novelova_core.exceptions import ForbiddenError, NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.voice")

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac"}
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal or invalid characters."""
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)
    return clean or "unnamed_file"


class VoiceService:
    @staticmethod
    def get_presigned_url(object_key: str | None, expires_in: int = 86400) -> str | None:
        """Generate a presigned GET URL for an R2 key or fallback to local API route."""
        if not object_key:
            return None
        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            try:
                return s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.R2_BUCKET, "Key": object_key},
                    ExpiresIn=expires_in,
                )
            except Exception as exc:
                logger.warning("Could not generate presigned URL for %s: %s", object_key, exc)

        return f"{settings.API_V1_STR}/voices/storage/{object_key}"

    @classmethod
    def to_response(cls, voice: VoiceModel) -> VoiceResponseSchema:
        """Convert a VoiceModel entity into a VoiceResponseSchema with presigned URLs."""
        return VoiceResponseSchema(
            id=voice.id,
            user_id=voice.user_id,
            project_id=voice.project_id,
            name=voice.name,
            gender=voice.gender,
            is_global=voice.is_global,
            audio_url=cls.get_presigned_url(voice.audio_storage_key) or "",
            audio_storage_key=voice.audio_storage_key,
            avatar_url=cls.get_presigned_url(voice.avatar_storage_key),
            avatar_storage_key=voice.avatar_storage_key,
            reference_text=voice.reference_text,
            duration_seconds=voice.duration_seconds,
            created_at=voice.created_at,
            updated_at=voice.updated_at,
        )

    @staticmethod
    def _upload_file_bytes(
        content: bytes,
        object_key: str,
        content_type: str,
    ) -> None:
        """Store bytes to Cloudflare R2 if available, caching to local uploads directory."""
        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            try:
                s3.put_object(
                    Bucket=settings.R2_BUCKET,
                    Key=object_key,
                    Body=content,
                    ContentType=content_type,
                )
                logger.info("Uploaded %d bytes to R2: %s", len(content), object_key)
            except Exception as exc:
                logger.error("Failed to upload object to R2 (%s): %s", object_key, exc)
                raise ValidationError(f"Storage upload failed: {exc}")

        # Cache locally
        try:
            local_path = AttachmentService.get_local_file_path(object_key)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_bytes(content)
        except Exception as local_err:
            logger.warning("Could not write local cache for %s: %s", object_key, local_err)

    @staticmethod
    def _delete_storage_key(object_key: str | None) -> None:
        """Remove file from R2 and local cache."""
        if not object_key:
            return
        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            try:
                s3.delete_object(Bucket=settings.R2_BUCKET, Key=object_key)
                logger.info("Deleted object from R2: %s", object_key)
            except Exception as exc:
                logger.warning("Could not delete object from R2 (%s): %s", object_key, exc)

        try:
            local_path = AttachmentService.get_local_file_path(object_key)
            if local_path.exists():
                local_path.unlink()
        except Exception:
            pass

    @staticmethod
    def _calculate_audio_duration(content: bytes) -> float | None:
        """Calculate duration in seconds for WAV audio."""
        try:
            with wave.open(io.BytesIO(content), "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0:
                    return round(frames / float(rate), 2)
        except Exception:
            pass
        return None

    @classmethod
    async def list_voices(
        cls,
        user_id: str,
        project_id: str | None,
        db: AsyncSession,
    ) -> list[VoiceModel]:
        """Fetch custom voices for the user (global voices + local project voices)."""
        stmt = select(VoiceModel).where(VoiceModel.user_id == user_id)
        if project_id:
            stmt = stmt.where(
                or_(VoiceModel.is_global.is_(True), VoiceModel.project_id == project_id)
            )
        stmt = stmt.order_by(VoiceModel.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_voice_by_id(
        cls,
        voice_id: str,
        user_id: str,
        db: AsyncSession,
    ) -> VoiceModel:
        """Retrieve a voice by ID and ensure ownership."""
        stmt = select(VoiceModel).where(VoiceModel.id == voice_id)
        result = await db.execute(stmt)
        voice = result.scalar_one_or_none()
        if not voice:
            raise NotFoundError(f"Voice '{voice_id}' not found")
        if voice.user_id != user_id:
            raise ForbiddenError("You do not have permission to access this voice")
        return voice

    @classmethod
    async def create_voice(
        cls,
        user_id: str,
        name: str,
        audio_file: UploadFile,
        gender: str = "neutral",
        is_global: bool = True,
        project_id: str | None = None,
        reference_text: str | None = None,
        avatar_file: UploadFile | None = None,
        db: AsyncSession = None,  # type: ignore
    ) -> VoiceModel:
        """Create a new custom voice with audio sample and optional avatar."""
        name = name.strip()
        if not name:
            raise ValidationError("Voice name is required")

        if not audio_file.filename:
            raise ValidationError("Audio file must have a valid filename")

        audio_ext = Path(audio_file.filename).suffix.lower()
        if audio_ext not in ALLOWED_AUDIO_EXTENSIONS:
            raise ValidationError(
                f"Audio format '{audio_ext}' is not supported. Use: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}"
            )

        audio_bytes = await audio_file.read()
        if len(audio_bytes) == 0:
            raise ValidationError("Audio file content cannot be empty")

        voice_id = str(uuid.uuid4())
        safe_audio_name = sanitize_filename(audio_file.filename)
        audio_storage_key = f"voices/{user_id}/{voice_id}/{safe_audio_name}"
        cls._upload_file_bytes(
            audio_bytes,
            audio_storage_key,
            audio_file.content_type or "audio/wav",
        )

        duration_seconds = cls._calculate_audio_duration(audio_bytes)

        # Handle optional avatar image
        avatar_storage_key: str | None = None
        if avatar_file and avatar_file.filename:
            avatar_ext = Path(avatar_file.filename).suffix.lower()
            if avatar_ext in ALLOWED_IMAGE_EXTENSIONS:
                avatar_bytes = await avatar_file.read()
                if len(avatar_bytes) > 0:
                    safe_avatar_name = sanitize_filename(avatar_file.filename)
                    avatar_storage_key = f"voices/{user_id}/{voice_id}/avatar_{safe_avatar_name}"
                    cls._upload_file_bytes(
                        avatar_bytes,
                        avatar_storage_key,
                        avatar_file.content_type or "image/png",
                    )

        voice = VoiceModel(
            id=voice_id,
            user_id=user_id,
            project_id=None if is_global else project_id,
            name=name,
            gender=gender,
            is_global=is_global,
            audio_storage_key=audio_storage_key,
            avatar_storage_key=avatar_storage_key,
            reference_text=reference_text.strip() if reference_text else None,
            duration_seconds=duration_seconds,
        )
        db.add(voice)
        await db.commit()
        await db.refresh(voice)
        logger.info("Created custom voice '%s' (%s) for user %s", voice.name, voice.id, user_id)
        return voice

    @classmethod
    async def update_voice(
        cls,
        voice_id: str,
        user_id: str,
        name: str | None = None,
        gender: str | None = None,
        is_global: bool | None = None,
        reference_text: str | None = None,
        avatar_file: UploadFile | None = None,
        db: AsyncSession = None,  # type: ignore
    ) -> VoiceModel:
        """Update metadata or avatar for an existing voice."""
        voice = await cls.get_voice_by_id(voice_id, user_id, db)

        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise ValidationError("Voice name cannot be empty")
            voice.name = clean_name

        if gender is not None:
            voice.gender = gender

        if is_global is not None:
            voice.is_global = is_global
            if is_global:
                voice.project_id = None

        if reference_text is not None:
            voice.reference_text = reference_text.strip() if reference_text.strip() else None

        if avatar_file and avatar_file.filename:
            avatar_ext = Path(avatar_file.filename).suffix.lower()
            if avatar_ext in ALLOWED_IMAGE_EXTENSIONS:
                avatar_bytes = await avatar_file.read()
                if len(avatar_bytes) > 0:
                    # Remove previous avatar if exists
                    if voice.avatar_storage_key:
                        cls._delete_storage_key(voice.avatar_storage_key)

                    safe_avatar_name = sanitize_filename(avatar_file.filename)
                    avatar_storage_key = f"voices/{user_id}/{voice.id}/avatar_{safe_avatar_name}"
                    cls._upload_file_bytes(
                        avatar_bytes,
                        avatar_storage_key,
                        avatar_file.content_type or "image/png",
                    )
                    voice.avatar_storage_key = avatar_storage_key

        voice.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(voice)
        logger.info("Updated custom voice '%s' (%s)", voice.name, voice.id)
        return voice

    @classmethod
    async def delete_voice(
        cls,
        voice_id: str,
        user_id: str,
        db: AsyncSession,
    ) -> None:
        """Delete custom voice and its associated storage assets."""
        voice = await cls.get_voice_by_id(voice_id, user_id, db)

        cls._delete_storage_key(voice.audio_storage_key)
        if voice.avatar_storage_key:
            cls._delete_storage_key(voice.avatar_storage_key)

        await db.delete(voice)
        await db.commit()
        logger.info("Deleted custom voice '%s' (%s)", voice.name, voice.id)
