import io
import re
import uuid
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.sfx import SFXModel
from app.schemas.sfx import (
    ApplyFoleyResponseSchema,
    ApplyFoleyTargetSchema,
    FoleyOccurrenceSchema,
    ScanFoleyResponseSchema,
    SFXResponseSchema,
)
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
            triggers=item.triggers or [],
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
        triggers: list[str] | None = None,
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
        triggers_clean = [t.strip() for t in (triggers or []) if t and t.strip()]

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
            triggers=triggers_clean,
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
        triggers: list[str] | None = None,
        db: AsyncSession = None,  # type: ignore
    ) -> SFXModel:
        """Update metadata, category, scope, triggers, or default volume of an SFX item."""
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

        if triggers is not None:
            item.triggers = [t.strip() for t in triggers if t and t.strip()]

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

    @classmethod
    async def scan_foley_occurrences(
        cls,
        sfx_id: str,
        project_id: str,
        user_id: str,
        triggers: list[str] | None,
        chapter_ids: list[str] | None,
        db: AsyncSession,
    ) -> ScanFoleyResponseSchema:
        """Scan project chapters for occurrences of triggers for this Foley sound effect."""
        item = await cls.get_sfx_by_id(sfx_id, user_id, db)
        search_triggers = triggers if triggers is not None and len(triggers) > 0 else (item.triggers or [])
        clean_triggers = [t.strip() for t in search_triggers if t and t.strip()]

        if not clean_triggers:
            return ScanFoleyResponseSchema(
                sfx_id=sfx_id,
                triggers=[],
                total_matches=0,
                occurrences=[],
            )

        sorted_triggers = sorted(clean_triggers, key=len, reverse=True)
        escaped_patterns = [re.escape(t) for t in sorted_triggers]
        # Match trigger words with word boundary or surrounded by punctuation
        pattern = re.compile(rf"(?:\b|_)(?:{'|'.join(escaped_patterns)})(?:\b|_|[!?.,;:—\-]*)", re.IGNORECASE)

        from app.models.chapter import ChapterModel, ScriptSegmentModel

        stmt = (
            select(ScriptSegmentModel, ChapterModel)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(ChapterModel.project_id == project_id)
        )
        if chapter_ids:
            stmt = stmt.where(ChapterModel.id.in_(chapter_ids))
        stmt = stmt.order_by(ChapterModel.chapter_number.asc(), ScriptSegmentModel.order_index.asc())

        results = await db.execute(stmt)
        rows = results.all()

        occurrences: list[FoleyOccurrenceSchema] = []
        for segment, chapter in rows:
            text = segment.text or ""
            match = pattern.search(text)
            if match:
                matched_str = match.group(0).strip()
                sfx_cues = segment.sfx_cues or []
                existing_cue = next((c for c in sfx_cues if c.get("sfx_id") == sfx_id), None)
                occurrences.append(
                    FoleyOccurrenceSchema(
                        segment_id=segment.id,
                        chapter_id=chapter.id,
                        chapter_number=chapter.chapter_number,
                        chapter_title=chapter.title,
                        order_index=segment.order_index,
                        speaker=segment.speaker,
                        delivery_type=segment.delivery_type,
                        matched_text=matched_str,
                        segment_text=text,
                        already_has_foley=existing_cue is not None,
                        current_action=existing_cue.get("action") if existing_cue else None,
                    )
                )

        return ScanFoleyResponseSchema(
            sfx_id=sfx_id,
            triggers=clean_triggers,
            total_matches=len(occurrences),
            occurrences=occurrences,
        )

    @classmethod
    async def apply_foley_to_novel(
        cls,
        sfx_id: str,
        project_id: str,
        user_id: str,
        action: str,  # "replace" | "alongside"
        targets: list[ApplyFoleyTargetSchema] | None,
        triggers: list[str] | None,
        volume: float,
        db: AsyncSession,
    ) -> ApplyFoleyResponseSchema:
        """Apply Foley sound effect to selected or all matching segments in the novel."""
        item = await cls.get_sfx_by_id(sfx_id, user_id, db)
        from app.models.chapter import ChapterModel, ScriptSegmentModel

        # If triggers are passed and different from item.triggers, update item.triggers
        if triggers is not None:
            new_triggers = [t.strip() for t in triggers if t and t.strip()]
            if set(new_triggers) != set(item.triggers or []):
                item.triggers = new_triggers
                item.updated_at = datetime.now(UTC)

        # Build target map: segment_id -> matched_text
        target_map: dict[str, str] = {}
        if targets is not None and len(targets) > 0:
            for t in targets:
                target_map[t.segment_id] = t.target_text
        else:
            scan_res = await cls.scan_foley_occurrences(
                sfx_id=sfx_id,
                project_id=project_id,
                user_id=user_id,
                triggers=triggers or item.triggers,
                chapter_ids=None,
                db=db,
            )
            for occ in scan_res.occurrences:
                target_map[occ.segment_id] = occ.matched_text

        if not target_map:
            return ApplyFoleyResponseSchema(
                applied_count=0,
                message="No target occurrences found to apply sound effect.",
            )

        target_ids = list(target_map.keys())
        stmt = (
            select(ScriptSegmentModel)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(
                ChapterModel.project_id == project_id,
                ScriptSegmentModel.id.in_(target_ids),
            )
        )
        res = await db.execute(stmt)
        segments = res.scalars().all()

        audio_url = cls.get_presigned_url(item.audio_storage_key) or ""
        effective_vol = max(0.0, min(1.0, float(volume if volume is not None else item.default_volume)))

        applied_count = 0
        for seg in segments:
            matched_txt = target_map.get(seg.id, "")
            current_cues = list(seg.sfx_cues or [])

            # Remove existing cue for this sfx_id to avoid duplicates
            filtered_cues = [c for c in current_cues if c.get("sfx_id") != sfx_id]

            new_cue = {
                "id": str(uuid.uuid4()),
                "sfx_id": item.id,
                "sfx_name": item.name,
                "audio_url": audio_url,
                "target_text": matched_txt,
                "action": action,  # "replace" | "alongside"
                "volume": effective_vol,
            }
            filtered_cues.append(new_cue)
            seg.sfx_cues = filtered_cues
            seg.updated_at = datetime.now(UTC)
            applied_count += 1

        await db.commit()
        return ApplyFoleyResponseSchema(
            applied_count=applied_count,
            message=f"Successfully applied '{item.name}' ({action}) to {applied_count} line(s).",
        )
