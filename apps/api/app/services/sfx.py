import io
import re
import uuid
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.sfx import SFXModel
from app.schemas.sfx import SFXResponseSchema
from app.services.attachment import AttachmentService, get_s3_client
from fastapi import UploadFile
from novelova_core.exceptions import ForbiddenError, NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.sfx")

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac"}
VALID_CATEGORIES = {"foley", "atmosphere"}


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal or invalid characters."""
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)
    return clean or "unnamed_audio"


class SFXService:
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

        return f"{settings.API_V1_STR}/sfx/storage/{object_key}"

    @classmethod
    def to_response(cls, item: SFXModel) -> SFXResponseSchema:
        """Convert an SFXModel entity into an SFXResponseSchema with presigned audio URL."""
        return SFXResponseSchema(
            id=item.id,
            user_id=item.user_id,
            project_id=item.project_id,
            name=item.name,
            category=item.category,
            is_global=item.is_global,
            audio_url=cls.get_presigned_url(item.audio_storage_key) or "",
            audio_storage_key=item.audio_storage_key,
            duration_seconds=item.duration_seconds,
            default_volume=item.default_volume,
            created_at=item.created_at,
            updated_at=item.updated_at,
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

        # Cache locally for offline dev mode
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
    async def list_sfx(
        cls,
        user_id: str,
        project_id: str | None = None,
        category: str | None = None,
        db: AsyncSession = None,  # type: ignore
    ) -> list[SFXModel]:
        """Fetch sound effects for the user (global sounds + local project sounds)."""
        stmt = select(SFXModel).where(SFXModel.user_id == user_id)
        if project_id:
            stmt = stmt.where(
                or_(SFXModel.is_global.is_(True), SFXModel.project_id == project_id)
            )
        if category and category.lower() in VALID_CATEGORIES:
            stmt = stmt.where(SFXModel.category == category.lower())

        stmt = stmt.order_by(SFXModel.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_sfx_by_id(
        cls,
        sfx_id: str,
        user_id: str,
        db: AsyncSession,
    ) -> SFXModel:
        """Retrieve an SFX item by ID and verify ownership."""
        stmt = select(SFXModel).where(SFXModel.id == sfx_id)
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()
        if not item:
            raise NotFoundError(f"Sound effect '{sfx_id}' not found")
        if item.user_id != user_id:
            raise ForbiddenError("You do not have permission to access this sound effect")
        return item

    @classmethod
    async def create_sfx(
        cls,
        user_id: str,
        name: str,
        audio_file: UploadFile,
        category: str = "foley",
        is_global: bool = True,
        project_id: str | None = None,
        default_volume: float = 1.0,
        db: AsyncSession = None,  # type: ignore
    ) -> SFXModel:
        """Create and store a new sound effect item."""
        name = name.strip()
        if not name:
            raise ValidationError("Sound effect name is required")

        category_clean = category.lower().strip()
        if category_clean not in VALID_CATEGORIES:
            category_clean = "foley"

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

        sfx_id = str(uuid.uuid4())
        safe_filename = sanitize_filename(audio_file.filename)
        audio_storage_key = f"sfx/{user_id}/{sfx_id}/{safe_filename}"
        cls._upload_file_bytes(
            audio_bytes,
            audio_storage_key,
            audio_file.content_type or "audio/wav",
        )

        duration_seconds = cls._calculate_audio_duration(audio_bytes)
        vol = max(0.0, min(1.0, float(default_volume)))

        item = SFXModel(
            id=sfx_id,
            user_id=user_id,
            project_id=None if is_global else project_id,
            name=name,
            category=category_clean,
            is_global=is_global,
            audio_storage_key=audio_storage_key,
            duration_seconds=duration_seconds,
            default_volume=vol,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        logger.info("Created sound effect '%s' (%s, cat: %s) for user %s", item.name, item.id, item.category, user_id)
        return item

    @classmethod
    async def update_sfx(
        cls,
        sfx_id: str,
        user_id: str,
        name: str | None = None,
        category: str | None = None,
        is_global: bool | None = None,
        default_volume: float | None = None,
        db: AsyncSession = None,  # type: ignore
    ) -> SFXModel:
        """Update metadata, category, scope, or default volume of an SFX item."""
        item = await cls.get_sfx_by_id(sfx_id, user_id, db)

        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise ValidationError("Sound effect name cannot be empty")
            item.name = clean_name

        if category is not None:
            clean_cat = category.lower().strip()
            if clean_cat in VALID_CATEGORIES:
                item.category = clean_cat

        if is_global is not None:
            item.is_global = is_global
            if is_global:
                item.project_id = None

        if default_volume is not None:
            item.default_volume = max(0.0, min(1.0, float(default_volume)))

        item.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(item)
        logger.info("Updated sound effect '%s' (%s)", item.name, item.id)
        return item

    @classmethod
    async def delete_sfx(
        cls,
        sfx_id: str,
        user_id: str,
        db: AsyncSession,
    ) -> None:
        """Delete an SFX item and remove stored audio assets."""
        item = await cls.get_sfx_by_id(sfx_id, user_id, db)

        cls._delete_storage_key(item.audio_storage_key)

        await db.delete(item)
        await db.commit()
        logger.info("Deleted sound effect '%s' (%s)", item.name, item.id)
