import asyncio
import io
import json
import re
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.storage import get_s3_client
from app.models.attachment import AttachmentModel
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.parse_job import ParseJobModel
from app.models.project import ProjectModel
from app.models.pronunciation import PronunciationRuleModel
from app.models.sfx import SFXModel
from app.models.tagging_job import TaggingJobModel
from app.models.voice import VoiceModel
from app.schemas.project import ProjectArchivePreviewResponse
from app.services.attachment import AttachmentService
from app.services.sfx import SFXService
from app.services.voice import VoiceService, sanitize_filename
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.archive")


def sanitize_archive_slug(name: str) -> str:
    """Turn a project title into a clean filename-safe slug."""
    clean = re.sub(r"[^\w\s\-]", "", name).strip()
    return re.sub(r"[\s\-]+", "_", clean) or "project"


class ProjectArchiveService:
    @staticmethod
    async def _get_asset_bytes(storage_key: str | None) -> bytes | None:
        """Retrieve binary asset bytes from local disk cache or Cloudflare R2 bucket."""
        if not storage_key:
            return None
        try:
            local_path = AttachmentService.get_local_file_path(storage_key)
            if local_path.exists() and local_path.stat().st_size > 0:
                return local_path.read_bytes()
        except Exception as e:
            logger.debug("Local file lookup failed for %s: %s", storage_key, e)

        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            try:
                resp = s3.get_object(Bucket=settings.R2_BUCKET, Key=storage_key)
                content = resp["Body"].read()
                try:
                    local_path = AttachmentService.get_local_file_path(storage_key)
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    local_path.write_bytes(content)
                except Exception:
                    pass
                return content
            except Exception as exc:
                logger.warning("Could not fetch storage key %s from R2: %s", storage_key, exc)
        return None

    @classmethod
    async def export_project(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> tuple[io.BytesIO, str]:
        """
        Package a project into a self-contained ZIP archive containing:
        - manifest.json (project metadata & stats, including total_voices, total_sfx, total_foley_cues)
        - characters.json (character roster & voice casting)
        - chapters.json (all chapters and their script segments with sfx_cues & atmospheres)
        - rules.json (pronunciations, SFX with audio paths, and custom/project voices with audio paths)
        - history.json (parse jobs & tagging runs)
        - media/ (cover art, manuscript files, voice audio files, and SFX audio files)
        Returns (zip_bytes_io, safe_filename).
        """
        stmt = (
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(
                selectinload(ProjectModel.thumbnail_attachment),
                selectinload(ProjectModel.manuscript_attachment),
                selectinload(ProjectModel.characters),
                selectinload(ProjectModel.pronunciation_rules),
                selectinload(ProjectModel.sfx_items),
                selectinload(ProjectModel.voices),
                selectinload(ProjectModel.chapters).selectinload(ChapterModel.segments),
            )
        )
        res = await db.execute(stmt)
        project = res.scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Query parse and tagging history
        parse_jobs_stmt = (
            select(ParseJobModel)
            .where(ParseJobModel.project_id == project_id)
            .order_by(ParseJobModel.created_at.asc())
        )
        parse_jobs = list((await db.execute(parse_jobs_stmt)).scalars().all())

        tagging_jobs_stmt = (
            select(TaggingJobModel)
            .where(TaggingJobModel.project_id == project_id)
            .order_by(TaggingJobModel.created_at.asc())
        )
        tagging_jobs = list((await db.execute(tagging_jobs_stmt)).scalars().all())

        total_chapters = len(project.chapters)
        total_segments = sum(len(c.segments) for c in project.chapters)
        tagged_chapters_count = sum(
            1 for c in project.chapters if c.status in {"tagged", "synthesizing", "complete"}
        )
        untagged_chapters_count = total_chapters - tagged_chapters_count
        total_words = sum(c.word_count for c in project.chapters)

        # 1. Collect all voices: project-scoped voices, character assigned voices, and default project voices
        assigned_voice_ids = {c.assigned_voice_id for c in project.characters if c.assigned_voice_id}
        proj_settings = project.settings or {}
        for k in ("default_male_voice_id", "default_female_voice_id", "narrator_voice_id"):
            val = proj_settings.get(k)
            if val:
                assigned_voice_ids.add(val)

        all_export_voices_map = {v.id: v for v in project.voices}
        missing_voice_ids = assigned_voice_ids - set(all_export_voices_map.keys())
        if missing_voice_ids:
            extra_voices_stmt = select(VoiceModel).where(VoiceModel.id.in_(list(missing_voice_ids)))
            extra_voices = list((await db.execute(extra_voices_stmt)).scalars().all())
            for ev in extra_voices:
                all_export_voices_map[ev.id] = ev
        all_export_voices = list(all_export_voices_map.values())

        # 2. Collect all SFX: project-scoped SFX and any SFX used in chapter segments (foley replacements & atmospheres)
        all_export_sfx_map = {s.id: s for s in project.sfx_items}
        referenced_sfx_ids = set(all_export_sfx_map.keys())
        total_foley_cues = 0

        for ch in project.chapters:
            for seg in ch.segments:
                if seg.atmosphere_id:
                    referenced_sfx_ids.add(seg.atmosphere_id)
                if seg.sfx_cues:
                    for cue in seg.sfx_cues:
                        total_foley_cues += 1
                        cue_sfx_id = cue.get("sfx_id")
                        if cue_sfx_id:
                            referenced_sfx_ids.add(cue_sfx_id)

        missing_sfx_ids = referenced_sfx_ids - set(all_export_sfx_map.keys())
        if missing_sfx_ids:
            extra_sfx_stmt = select(SFXModel).where(SFXModel.id.in_(list(missing_sfx_ids)))
            extra_sfx = list((await db.execute(extra_sfx_stmt)).scalars().all())
            for es in extra_sfx:
                all_export_sfx_map[es.id] = es
        all_export_sfx = list(all_export_sfx_map.values())

        # 3. Retrieve binary audio/avatar assets for voices
        voice_audio_bytes_map: dict[str, tuple[str, bytes]] = {}
        voice_avatar_bytes_map: dict[str, tuple[str, bytes]] = {}
        for v in all_export_voices:
            if v.audio_storage_key:
                v_bytes = await cls._get_asset_bytes(v.audio_storage_key)
                if v_bytes:
                    v_ext = Path(v.audio_storage_key).suffix or ".wav"
                    v_path = f"media/voices/{v.id}{v_ext}"
                    voice_audio_bytes_map[v.id] = (v_path, v_bytes)
            if v.avatar_storage_key:
                av_bytes = await cls._get_asset_bytes(v.avatar_storage_key)
                if av_bytes:
                    av_ext = Path(v.avatar_storage_key).suffix or ".jpg"
                    av_path = f"media/voices/{v.id}_avatar{av_ext}"
                    voice_avatar_bytes_map[v.id] = (av_path, av_bytes)

        # 4. Retrieve binary audio assets for SFX
        sfx_audio_bytes_map: dict[str, tuple[str, bytes]] = {}
        for s in all_export_sfx:
            if s.audio_storage_key:
                s_bytes = await cls._get_asset_bytes(s.audio_storage_key)
                if s_bytes:
                    s_ext = Path(s.audio_storage_key).suffix or ".mp3"
                    s_path = f"media/sfx/{s.id}{s_ext}"
                    sfx_audio_bytes_map[s.id] = (s_path, s_bytes)

        manifest = {
            "schema_version": "1.0",
            "generator": "Novelova v0.1.0",
            "exported_at": datetime.now(UTC).isoformat(),
            "project": {
                "title": project.title,
                "author": project.author,
                "owner": project.owner,
                "source": project.source,
                "status": project.status,
                "language": project.language,
                "genre": project.genre,
                "publication_date": project.publication_date,
                "created_date": project.created_date,
                "isbn": project.isbn,
                "settings": project.settings,
            },
            "stats": {
                "total_chapters": total_chapters,
                "total_segments": total_segments,
                "tagged_chapters_count": tagged_chapters_count,
                "untagged_chapters_count": untagged_chapters_count,
                "total_words": total_words,
                "total_characters": len(project.characters),
                "total_voices": len(all_export_voices),
                "total_sfx": len(all_export_sfx),
                "total_foley_cues": total_foley_cues,
            },
            "media": {
                "has_thumbnail": bool(project.thumbnail_attachment),
                "thumbnail_filename": project.thumbnail_attachment.filename
                if project.thumbnail_attachment
                else None,
                "has_manuscript": bool(project.manuscript_attachment),
                "manuscript_filename": project.manuscript_attachment.filename
                if project.manuscript_attachment
                else None,
            },
        }

        characters_data = [
            {
                "id": c.id,
                "name": c.name,
                "slug": c.slug,
                "gender": c.gender,
                "role_description": c.role_description,
                "assigned_voice_name": c.assigned_voice_name,
                "assigned_voice_id": c.assigned_voice_id,
                "voice_filter_id": c.voice_filter_id,
                "dialogue_count": c.dialogue_count,
                "word_count": c.word_count,
                "chapters_span": c.chapters_span,
                "is_general": c.is_general,
                "is_system": c.is_system,
                "aliases": c.aliases,
            }
            for c in project.characters
        ]

        chapters_data = [
            {
                "id": ch.id,
                "chapter_number": ch.chapter_number,
                "batch_number": ch.batch_number,
                "title": ch.title,
                "order_index": ch.order_index,
                "word_count": ch.word_count,
                "estimated_duration_seconds": ch.estimated_duration_seconds,
                "status": ch.status,
                "audio_url": ch.audio_url,
                "alignment_json": ch.alignment_json,
                "audio_job_status": ch.audio_job_status,
                "audio_job_error": ch.audio_job_error,
                "audio_account_used": ch.audio_account_used,
                "audio_job_id": ch.audio_job_id,
                "segments": [
                    {
                        "id": s.id,
                        "order_index": s.order_index,
                        "text": s.text,
                        "delivery_type": s.delivery_type,
                        "continuation_type": s.continuation_type,
                        "parent_turn_id": s.parent_turn_id,
                        "dialogue_chain_id": s.dialogue_chain_id,
                        "is_dialogue": s.is_dialogue,
                        "is_internal_thought": s.is_internal_thought,
                        "raw_speaker_tag": s.raw_speaker_tag,
                        "speaker": s.speaker,
                        "character_id": s.character_id,
                        "speaker_gender": s.speaker_gender,
                        "emotion": s.emotion,
                        "audio_status": s.audio_status,
                        "audio_url": s.audio_url,
                        "duration_ms": s.duration_ms,
                        "voice_filter_id": s.voice_filter_id,
                        "atmosphere_id": s.atmosphere_id,
                        "atmosphere_name": s.atmosphere_name,
                        "atmosphere_volume": s.atmosphere_volume,
                        "sfx_cues": s.sfx_cues,
                    }
                    for s in sorted(ch.segments, key=lambda seg: seg.order_index)
                ],
            }
            for ch in sorted(project.chapters, key=lambda c: c.order_index)
        ]

        rules_data = {
            "pronunciations": [
                {
                    "phrase": r.phrase,
                    "replacement": r.replacement,
                    "match_case": r.match_case,
                    "scope": r.scope,
                    "occurrences_count": r.occurrences_count,
                    "excluded_segment_ids": r.excluded_segment_ids,
                    "is_active": r.is_active,
                }
                for r in project.pronunciation_rules
            ],
            "sfx_items": [
                {
                    "id": s.id,
                    "name": s.name,
                    "category": s.category,
                    "is_global": s.is_global,
                    "audio_storage_key": s.audio_storage_key,
                    "duration_seconds": s.duration_seconds,
                    "default_volume": s.default_volume,
                    "triggers": s.triggers or [],
                    "archive_audio_path": sfx_audio_bytes_map[s.id][0] if s.id in sfx_audio_bytes_map else None,
                }
                for s in all_export_sfx
            ],
            "voices": [
                {
                    "id": v.id,
                    "name": v.name,
                    "gender": v.gender,
                    "is_global": v.is_global,
                    "audio_storage_key": v.audio_storage_key,
                    "avatar_storage_key": v.avatar_storage_key,
                    "reference_text": v.reference_text,
                    "duration_seconds": v.duration_seconds,
                    "archive_audio_path": voice_audio_bytes_map[v.id][0] if v.id in voice_audio_bytes_map else None,
                    "archive_avatar_path": voice_avatar_bytes_map[v.id][0] if v.id in voice_avatar_bytes_map else None,
                }
                for v in all_export_voices
            ],
        }

        history_data = {
            "parse_jobs": [
                {
                    "job_type": getattr(pj, "job_type", "parse"),
                    "status": pj.status,
                    "total_chapters": pj.total_chapters,
                    "processed_chapters": getattr(pj, "processed_chapters", pj.total_chapters),
                    "total_segments": getattr(pj, "total_segments", 0),
                    "processed_segments": getattr(pj, "processed_segments", 0),
                    "progress_percent": pj.progress_percent,
                    "current_step": getattr(pj, "current_step", None),
                    "error_message": pj.error_message,
                    "created_at": pj.created_at.isoformat() if pj.created_at else None,
                    "completed_at": pj.completed_at.isoformat() if pj.completed_at else None,
                }
                for pj in parse_jobs
            ],
            "tagging_jobs": [
                {
                    "status": tj.status,
                    "total_chapters": tj.total_chapters,
                    "processed_chapters": tj.processed_chapters,
                    "total_segments": tj.total_segments,
                    "processed_segments": tj.processed_segments,
                    "progress_percent": tj.progress_percent,
                    "error_message": tj.error_message,
                    "error_type": getattr(tj, "error_type", None),
                    "llm_report": tj.llm_report,
                    "target_scope": getattr(tj, "target_scope", None),
                    "created_at": tj.created_at.isoformat() if tj.created_at else None,
                    "completed_at": tj.completed_at.isoformat() if tj.completed_at else None,
                }
                for tj in tagging_jobs
            ],
        }

        await asyncio.sleep(0)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
            zf.writestr("characters.json", json.dumps(characters_data, indent=2, ensure_ascii=False))
            zf.writestr("chapters.json", json.dumps(chapters_data, indent=2, ensure_ascii=False))
            zf.writestr("rules.json", json.dumps(rules_data, indent=2, ensure_ascii=False))
            zf.writestr("history.json", json.dumps(history_data, indent=2, ensure_ascii=False))

            # Media attachments (thumbnail & manuscript)
            if project.thumbnail_attachment:
                try:
                    thumb_bytes = await AttachmentService.get_attachment_bytes(
                        project.thumbnail_attachment
                    )
                    ext = Path(project.thumbnail_attachment.filename).suffix or ".jpg"
                    zf.writestr(f"media/thumbnail{ext}", thumb_bytes)
                except Exception as exc:
                    logger.warning("Could not include thumbnail in archive: %s", exc)

            if project.manuscript_attachment:
                try:
                    manu_bytes = await AttachmentService.get_attachment_bytes(
                        project.manuscript_attachment
                    )
                    ext = Path(project.manuscript_attachment.filename).suffix or ".epub"
                    zf.writestr(f"media/manuscript{ext}", manu_bytes)
                except Exception as exc:
                    logger.warning("Could not include manuscript in archive: %s", exc)

            # Voice audio & avatar files
            for v_id, (v_path, v_data) in voice_audio_bytes_map.items():
                try:
                    zf.writestr(v_path, v_data)
                except Exception as exc:
                    logger.warning("Could not write voice audio %s to archive: %s", v_path, exc)

            for v_id, (av_path, av_data) in voice_avatar_bytes_map.items():
                try:
                    zf.writestr(av_path, av_data)
                except Exception as exc:
                    logger.warning("Could not write voice avatar %s to archive: %s", av_path, exc)

            # SFX audio files
            for s_id, (s_path, s_data) in sfx_audio_bytes_map.items():
                try:
                    zf.writestr(s_path, s_data)
                except Exception as exc:
                    logger.warning("Could not write SFX audio %s to archive: %s", s_path, exc)

        buf.seek(0)
        slug = sanitize_archive_slug(project.title)
        filename = f"{slug}_archive.zip"
        logger.info(
            "Exported project '%s' (%s) archive: %d chapters, %d segments, %d voices, %d SFX (%d bytes)",
            project.title,
            project.id,
            total_chapters,
            total_segments,
            len(all_export_voices),
            len(all_export_sfx),
            len(buf.getvalue()),
        )
        return buf, filename

    @staticmethod
    def preview_project_archive(zip_bytes: bytes) -> ProjectArchivePreviewResponse:
        """Inspect manifest and contents of a project archive ZIP without importing."""
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
                if "manifest.json" not in zf.namelist():
                    raise ValidationError("Invalid Novelova archive: 'manifest.json' is missing")

                manifest_raw = zf.read("manifest.json").decode("utf-8")
                manifest = json.loads(manifest_raw)

                rules = {}
                if "rules.json" in zf.namelist():
                    try:
                        rules = json.loads(zf.read("rules.json").decode("utf-8"))
                    except Exception:
                        pass
        except zipfile.BadZipFile as bz:
            raise ValidationError(f"Invalid or corrupted ZIP archive: {bz}") from bz
        except json.JSONDecodeError as jd:
            raise ValidationError(f"Invalid manifest JSON in archive: {jd}") from jd

        proj = manifest.get("project", {})
        stats = manifest.get("stats", {})
        media = manifest.get("media", {})

        total_voices = stats.get("total_voices")
        if total_voices is None:
            total_voices = len(rules.get("voices", []))

        total_sfx = stats.get("total_sfx")
        if total_sfx is None:
            total_sfx = len(rules.get("sfx_items", []))

        total_foley_cues = stats.get("total_foley_cues", 0)

        return ProjectArchivePreviewResponse(
            title=proj.get("title", "Untitled Project"),
            author=proj.get("author"),
            genre=proj.get("genre"),
            language=proj.get("language"),
            status=proj.get("status", "in_production"),
            total_chapters=stats.get("total_chapters", 0),
            tagged_chapters_count=stats.get("tagged_chapters_count", 0),
            untagged_chapters_count=stats.get("untagged_chapters_count", 0),
            total_segments=stats.get("total_segments", 0),
            total_words=stats.get("total_words", 0),
            total_characters=stats.get("total_characters", 0),
            has_cover=bool(media.get("has_thumbnail")),
            has_manuscript=bool(media.get("has_manuscript")),
            exported_at=manifest.get("exported_at"),
            schema_version=manifest.get("schema_version", "1.0"),
            total_voices=total_voices,
            total_sfx=total_sfx,
            total_foley_cues=total_foley_cues,
        )

    @staticmethod
    async def import_project_archive(
        zip_bytes: bytes,
        user_id: str,
        db: AsyncSession,
        override_title: str | None = None,
    ) -> ProjectModel:
        """
        Import a complete project ZIP archive under user_id with safe relational remapping.
        All chapters, segments, speaker attributions, character profiles, rules, and history
        are restored with 100% fidelity without primary key collisions.
        """
        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes), "r")
        except zipfile.BadZipFile as bz:
            raise ValidationError(f"Invalid or corrupted ZIP archive: {bz}") from bz

        namelist = set(zf.namelist())
        if "manifest.json" not in namelist:
            raise ValidationError("Invalid Novelova archive: 'manifest.json' is missing")

        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        characters_data: list[dict[str, Any]] = (
            json.loads(zf.read("characters.json").decode("utf-8"))
            if "characters.json" in namelist
            else []
        )
        chapters_data: list[dict[str, Any]] = (
            json.loads(zf.read("chapters.json").decode("utf-8"))
            if "chapters.json" in namelist
            else []
        )
        rules_data: dict[str, Any] = (
            json.loads(zf.read("rules.json").decode("utf-8"))
            if "rules.json" in namelist
            else {}
        )
        history_data: dict[str, Any] = (
            json.loads(zf.read("history.json").decode("utf-8"))
            if "history.json" in namelist
            else {}
        )

        proj_info = manifest.get("project", {})
        title = (override_title or proj_info.get("title") or "Imported Novel").strip()

        # Handle media attachments
        thumb_attachment_id: str | None = None
        manu_attachment_id: str | None = None

        thumb_entry = next((name for name in namelist if name.startswith("media/thumbnail")), None)
        if thumb_entry:
            thumb_bytes = zf.read(thumb_entry)
            thumb_ext = Path(thumb_entry).suffix.lower() or ".jpg"
            mime_map = {
                ".png": "image/png",
                ".webp": "image/webp",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
            }
            mime = mime_map.get(thumb_ext, "image/jpeg")
            thumb_att, _ = await AttachmentService.upload_bytes(
                content=thumb_bytes,
                filename=f"{sanitize_archive_slug(title)}_cover{thumb_ext}",
                content_type=mime,
                db=db,
            )
            await AttachmentService.claim_attachment(thumb_att.id, db)
            thumb_attachment_id = thumb_att.id

        manu_entry = next((name for name in namelist if name.startswith("media/manuscript")), None)
        if manu_entry:
            manu_bytes = zf.read(manu_entry)
            manu_ext = Path(manu_entry).suffix.lower() or ".epub"
            mime_map = {
                ".epub": "application/epub+zip",
                ".txt": "text/plain",
                ".pdf": "application/pdf",
                ".md": "text/markdown",
            }
            mime = mime_map.get(manu_ext, "application/octet-stream")
            manu_att, _ = await AttachmentService.upload_bytes(
                content=manu_bytes,
                filename=f"{sanitize_archive_slug(title)}{manu_ext}",
                content_type=mime,
                db=db,
            )
            await AttachmentService.claim_attachment(manu_att.id, db)
            manu_attachment_id = manu_att.id

        # 1. Voice remapping and safe import (deduplicate if already exists)
        voice_id_map: dict[str, str] = {}
        voice_name_map: dict[str, tuple[str, str]] = {}  # lowercase_name -> (voice_id, voice_name)

        for v in rules_data.get("voices", []):
            old_v_id = str(v.get("id")) if v.get("id") else None
            v_name = str(v.get("name", "")).strip()
            v_gender = str(v.get("gender", "neutral")).strip().lower()

            existing_voice: VoiceModel | None = None
            if old_v_id:
                existing_voice = (
                    await db.execute(select(VoiceModel).where(VoiceModel.id == old_v_id))
                ).scalar_one_or_none()

            if not existing_voice and v_name:
                match_stmt = (
                    select(VoiceModel)
                    .where(
                        func.lower(VoiceModel.name) == v_name.lower(),
                        func.lower(VoiceModel.gender) == v_gender,
                        or_(
                            VoiceModel.user_id == user_id,
                            VoiceModel.is_global.is_(True),
                        ),
                    )
                )
                existing_voice = (await db.execute(match_stmt)).scalars().first()

            if existing_voice:
                if old_v_id:
                    voice_id_map[old_v_id] = existing_voice.id
                if v_name:
                    voice_name_map[v_name.lower()] = (existing_voice.id, existing_voice.name)
                logger.debug(
                    "Reusing existing voice '%s' (%s) for imported voice '%s'",
                    existing_voice.name,
                    existing_voice.id,
                    v_name,
                )
            else:
                # Import voice as new entity
                new_voice_id = str(uuid.uuid4())
                arch_audio = v.get("archive_audio_path")
                arch_avatar = v.get("archive_avatar_path")

                new_audio_key = str(v.get("audio_storage_key") or "")
                if arch_audio and arch_audio in namelist:
                    v_bytes = zf.read(arch_audio)
                    v_ext = Path(arch_audio).suffix or ".wav"
                    new_audio_key = f"voices/{new_voice_id}{v_ext}"
                    v_mime = "audio/wav" if v_ext.lower() == ".wav" else "audio/mpeg"
                    VoiceService._upload_file_bytes(v_bytes, new_audio_key, v_mime)

                new_avatar_key = v.get("avatar_storage_key")
                if arch_avatar and arch_avatar in namelist:
                    av_bytes = zf.read(arch_avatar)
                    av_ext = Path(arch_avatar).suffix or ".jpg"
                    new_avatar_key = f"voices/{new_voice_id}_avatar{av_ext}"
                    av_mime = "image/png" if av_ext.lower() == ".png" else "image/jpeg"
                    VoiceService._upload_file_bytes(av_bytes, new_avatar_key, av_mime)

                voice_model = VoiceModel(
                    id=new_voice_id,
                    user_id=user_id,
                    project_id=None if v.get("is_global") else new_project_id,
                    name=v_name or f"Voice {new_voice_id[:6]}",
                    gender=v_gender or "neutral",
                    is_global=bool(v.get("is_global", False)),
                    audio_storage_key=new_audio_key,
                    avatar_storage_key=new_avatar_key,
                    reference_text=v.get("reference_text"),
                    duration_seconds=v.get("duration_seconds"),
                )
                db.add(voice_model)
                if old_v_id:
                    voice_id_map[old_v_id] = new_voice_id
                if v_name:
                    voice_name_map[v_name.lower()] = (new_voice_id, voice_model.name)

        # 2. SFX remapping and safe import (deduplicate if already exists)
        sfx_id_map: dict[str, str] = {}
        sfx_name_map: dict[str, tuple[str, str]] = {}  # lowercase_name -> (sfx_id, sfx_name)

        for s in rules_data.get("sfx_items", []):
            old_s_id = str(s.get("id")) if s.get("id") else None
            s_name = str(s.get("name", "")).strip()
            s_cat = str(s.get("category", "foley")).strip().lower()

            existing_sfx: SFXModel | None = None
            if old_s_id:
                existing_sfx = (
                    await db.execute(select(SFXModel).where(SFXModel.id == old_s_id))
                ).scalar_one_or_none()

            if not existing_sfx and s_name:
                match_sfx_stmt = (
                    select(SFXModel)
                    .where(
                        func.lower(SFXModel.name) == s_name.lower(),
                        func.lower(SFXModel.category) == s_cat,
                        or_(
                            SFXModel.user_id == user_id,
                            SFXModel.is_global.is_(True),
                        ),
                    )
                )
                existing_sfx = (await db.execute(match_sfx_stmt)).scalars().first()

            if existing_sfx:
                if old_s_id:
                    sfx_id_map[old_s_id] = existing_sfx.id
                if s_name:
                    sfx_name_map[s_name.lower()] = (existing_sfx.id, existing_sfx.name)
                logger.debug(
                    "Reusing existing SFX '%s' (%s) for imported SFX '%s'",
                    existing_sfx.name,
                    existing_sfx.id,
                    s_name,
                )
            else:
                # Import SFX as new entity
                new_sfx_id = str(uuid.uuid4())
                arch_sfx = s.get("archive_audio_path")
                new_sfx_key = str(s.get("audio_storage_key") or s.get("storage_key") or "")
                if arch_sfx and arch_sfx in namelist:
                    s_bytes = zf.read(arch_sfx)
                    s_ext = Path(arch_sfx).suffix or ".mp3"
                    new_sfx_key = f"sfx/{new_sfx_id}{s_ext}"
                    s_mime = "audio/wav" if s_ext.lower() == ".wav" else "audio/mpeg"
                    SFXService._upload_file_bytes(s_bytes, new_sfx_key, s_mime)

                vol = s.get("default_volume") if s.get("default_volume") is not None else s.get("volume", 1.0)
                sfx_model = SFXModel(
                    id=new_sfx_id,
                    user_id=user_id,
                    project_id=None if s.get("is_global") else new_project_id,
                    name=s_name or f"SFX {new_sfx_id[:6]}",
                    category=s_cat or "foley",
                    is_global=bool(s.get("is_global", False)),
                    audio_storage_key=new_sfx_key,
                    duration_seconds=s.get("duration_seconds"),
                    default_volume=float(vol),
                    triggers=s.get("triggers") or [],
                )
                db.add(sfx_model)
                if old_s_id:
                    sfx_id_map[old_s_id] = new_sfx_id
                if s_name:
                    sfx_name_map[s_name.lower()] = (new_sfx_id, sfx_model.name)

        await db.flush()

        # Update project settings with remapped voice IDs
        settings_dict = dict(proj_info.get("settings") or {})
        for default_key in ("default_male_voice_id", "default_female_voice_id", "narrator_voice_id"):
            val = settings_dict.get(default_key)
            if val and str(val) in voice_id_map:
                settings_dict[default_key] = voice_id_map[str(val)]

        # Create new Project
        new_project_id = str(uuid.uuid4())
        new_project = ProjectModel(
            id=new_project_id,
            user_id=user_id,
            title=title,
            author=proj_info.get("author"),
            owner=proj_info.get("owner"),
            source=proj_info.get("source"),
            status=proj_info.get("status", "in_production"),
            language=proj_info.get("language"),
            genre=proj_info.get("genre"),
            publication_date=proj_info.get("publication_date"),
            created_date=proj_info.get("created_date"),
            isbn=proj_info.get("isbn"),
            settings=settings_dict,
            thumbnail_attachment_id=thumb_attachment_id,
            manuscript_attachment_id=manu_attachment_id,
        )
        db.add(new_project)
        await db.flush()

        # Remap Characters
        char_id_map: dict[str, str] = {}
        for c in characters_data:
            old_id = c.get("id")
            new_char_id = str(uuid.uuid4())
            if old_id:
                char_id_map[str(old_id)] = new_char_id

            assigned_voice_id = c.get("assigned_voice_id")
            assigned_voice_name = c.get("assigned_voice_name")
            if assigned_voice_id and str(assigned_voice_id) in voice_id_map:
                assigned_voice_id = voice_id_map[str(assigned_voice_id)]
            elif assigned_voice_name and assigned_voice_name.lower() in voice_name_map:
                assigned_voice_id, assigned_voice_name = voice_name_map[assigned_voice_name.lower()]

            char_model = CharacterModel(
                id=new_char_id,
                project_id=new_project_id,
                name=c["name"],
                slug=c.get("slug") or sanitize_archive_slug(c["name"]).lower(),
                gender=c.get("gender", "male"),
                role_description=c.get("role_description"),
                assigned_voice_name=assigned_voice_name,
                assigned_voice_id=assigned_voice_id,
                voice_filter_id=c.get("voice_filter_id"),
                dialogue_count=int(c.get("dialogue_count", 0)),
                word_count=int(c.get("word_count", 0)),
                chapters_span=c.get("chapters_span"),
                is_general=bool(c.get("is_general", False)),
                is_system=bool(c.get("is_system", False)),
                aliases=c.get("aliases") or [],
            )
            db.add(char_model)

        await db.flush()

        # Remap Chapters & Segments
        chap_id_map: dict[str, str] = {}
        seg_id_map: dict[str, str] = {}
        seg_counter = 0
        for ch in chapters_data:
            old_chap_id = ch.get("id")
            new_chap_id = str(uuid.uuid4())
            if old_chap_id:
                chap_id_map[str(old_chap_id)] = new_chap_id

            chapter_model = ChapterModel(
                id=new_chap_id,
                project_id=new_project_id,
                chapter_number=int(ch.get("chapter_number", 1)),
                batch_number=int(ch.get("batch_number", 1)),
                title=str(ch.get("title", f"Chapter {ch.get('chapter_number', 1)}")),
                order_index=int(ch.get("order_index", 1)),
                word_count=int(ch.get("word_count", 0)),
                estimated_duration_seconds=int(ch.get("estimated_duration_seconds", 0)),
                status=str(ch.get("status", "parsed")),
                audio_url=ch.get("audio_url"),
                alignment_json=ch.get("alignment_json"),
                audio_job_status="none" if str(ch.get("audio_job_status", "none")) == "generating" else str(ch.get("audio_job_status", "none")),
                audio_job_error=None if str(ch.get("audio_job_status", "none")) == "generating" else ch.get("audio_job_error"),
                audio_account_used=ch.get("audio_account_used"),
                audio_job_id=None if str(ch.get("audio_job_status", "none")) == "generating" else ch.get("audio_job_id"),
            )
            db.add(chapter_model)

            segments = ch.get("segments", [])
            for seg in segments:
                new_seg_id = str(uuid.uuid4())
                old_seg_id = seg.get("id")
                if old_seg_id:
                    seg_id_map[str(old_seg_id)] = new_seg_id

                old_char_id = seg.get("character_id")
                new_char_id = char_id_map.get(str(old_char_id)) if old_char_id else None

                # Atmosphere remapping
                atm_id = seg.get("atmosphere_id")
                atm_name = seg.get("atmosphere_name")
                if atm_id and str(atm_id) in sfx_id_map:
                    atm_id = sfx_id_map[str(atm_id)]
                elif atm_name and atm_name.lower() in sfx_name_map:
                    atm_id, atm_name = sfx_name_map[atm_name.lower()]

                # SFX cues remapping (maintaining action="replace" and foley replacements)
                raw_sfx_cues = seg.get("sfx_cues")
                remapped_sfx_cues = None
                if raw_sfx_cues and isinstance(raw_sfx_cues, list):
                    remapped_sfx_cues = []
                    for cue in raw_sfx_cues:
                        cue_copy = dict(cue)
                        cue_sfx_id = cue.get("sfx_id")
                        cue_name = cue.get("sfx_name")
                        if cue_sfx_id and str(cue_sfx_id) in sfx_id_map:
                            cue_copy["sfx_id"] = sfx_id_map[str(cue_sfx_id)]
                            cue_copy["audio_url"] = f"{settings.API_V1_STR}/sfx/{cue_copy['sfx_id']}/stream"
                        elif cue_name and cue_name.lower() in sfx_name_map:
                            m_id, m_name = sfx_name_map[cue_name.lower()]
                            cue_copy["sfx_id"] = m_id
                            cue_copy["sfx_name"] = m_name
                            cue_copy["audio_url"] = f"{settings.API_V1_STR}/sfx/{m_id}/stream"
                        remapped_sfx_cues.append(cue_copy)

                seg_model = ScriptSegmentModel(
                    id=new_seg_id,
                    chapter_id=new_chap_id,
                    order_index=int(seg.get("order_index", 1)),
                    text=str(seg.get("text", "")),
                    delivery_type=str(seg.get("delivery_type", "narration")),
                    continuation_type=str(seg.get("continuation_type", "none")),
                    parent_turn_id=seg.get("parent_turn_id"),
                    dialogue_chain_id=seg.get("dialogue_chain_id"),
                    is_dialogue=bool(seg.get("is_dialogue", False)),
                    is_internal_thought=bool(seg.get("is_internal_thought", False)),
                    raw_speaker_tag=seg.get("raw_speaker_tag"),
                    speaker=seg.get("speaker"),
                    character_id=new_char_id,
                    speaker_gender=seg.get("speaker_gender"),
                    emotion=seg.get("emotion"),
                    audio_status=str(seg.get("audio_status", "pending")),
                    audio_url=seg.get("audio_url"),
                    duration_ms=seg.get("duration_ms"),
                    voice_filter_id=seg.get("voice_filter_id"),
                    atmosphere_id=atm_id,
                    atmosphere_name=atm_name,
                    atmosphere_volume=seg.get("atmosphere_volume"),
                    sfx_cues=remapped_sfx_cues or [],
                )
                db.add(seg_model)
                seg_counter += 1
                if seg_counter % 3000 == 0:
                    await db.flush()

        await db.flush()

        # Pronunciation Rules
        for r in rules_data.get("pronunciations", []):
            excluded_ids = [
                seg_id_map[str(sid)]
                for sid in (r.get("excluded_segment_ids") or [])
                if str(sid) in seg_id_map
            ]
            rule_model = PronunciationRuleModel(
                id=str(uuid.uuid4()),
                project_id=new_project_id,
                phrase=str(r["phrase"]),
                replacement=str(r["replacement"]),
                match_case=bool(r.get("match_case", False)),
                scope=str(r.get("scope", "entire_manuscript")),
                occurrences_count=int(r.get("occurrences_count", 0)),
                excluded_segment_ids=excluded_ids,
                is_active=bool(r.get("is_active", True)),
            )
            db.add(rule_model)

        # History Jobs
        for pj in history_data.get("parse_jobs", []):
            parse_job_model = ParseJobModel(
                id=str(uuid.uuid4()),
                project_id=new_project_id,
                job_type=str(pj.get("job_type", "parse")),
                status=str(pj.get("status", "completed")),
                total_chapters=int(pj.get("total_chapters", len(chapters_data))),
                processed_chapters=int(pj.get("processed_chapters", len(chapters_data))),
                total_segments=int(pj.get("total_segments", 0)),
                processed_segments=int(pj.get("processed_segments", 0)),
                progress_percent=float(pj.get("progress_percent", 100.0)),
                current_step=pj.get("current_step"),
                error_message=pj.get("error_message"),
            )
            db.add(parse_job_model)

        for tj in history_data.get("tagging_jobs", []):
            tag_job_model = TaggingJobModel(
                id=str(uuid.uuid4()),
                project_id=new_project_id,
                status=str(tj.get("status", "completed")),
                total_chapters=int(tj.get("total_chapters", len(chapters_data))),
                processed_chapters=int(tj.get("processed_chapters", len(chapters_data))),
                total_segments=int(tj.get("total_segments", 0)),
                processed_segments=int(tj.get("processed_segments", 0)),
                progress_percent=float(tj.get("progress_percent", 100.0)),
                error_type=tj.get("error_type"),
                error_message=tj.get("error_message"),
                llm_report=tj.get("llm_report"),
                target_scope=tj.get("target_scope"),
            )
            db.add(tag_job_model)

        await db.commit()
        await db.refresh(new_project)

        logger.info(
            "Successfully imported project '%s' (new_id: %s) for user %s: %d chapters, %d characters",
            new_project.title,
            new_project.id,
            user_id,
            len(chapters_data),
            len(characters_data),
        )
        return new_project
