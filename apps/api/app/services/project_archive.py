import io
import json
import re
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

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
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.archive")


def sanitize_archive_slug(name: str) -> str:
    """Turn a project title into a clean filename-safe slug."""
    clean = re.sub(r"[^\w\s\-]", "", name).strip()
    return re.sub(r"[\s\-]+", "_", clean) or "project"


class ProjectArchiveService:
    @staticmethod
    async def export_project(
        project_id: str,
        db: AsyncSession,
    ) -> tuple[io.BytesIO, str]:
        """
        Package a project into a self-contained ZIP archive containing:
        - manifest.json (project metadata & stats)
        - characters.json (character roster & voice casting)
        - chapters.json (all chapters and their script segments)
        - rules.json (pronunciations and SFX rules)
        - history.json (parse jobs & tagging runs)
        - media/ (cover art & manuscript files)
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
                    "name": s.name,
                    "category": s.category,
                    "sfx_type": s.sfx_type,
                    "storage_key": s.storage_key,
                    "duration_seconds": s.duration_seconds,
                    "volume": s.volume,
                    "metadata_json": s.metadata_json,
                }
                for s in project.sfx_items
            ],
            "voices": [
                {
                    "name": v.name,
                    "gender": v.gender,
                    "is_global": v.is_global,
                    "audio_storage_key": v.audio_storage_key,
                    "avatar_storage_key": v.avatar_storage_key,
                    "reference_text": v.reference_text,
                    "duration_seconds": v.duration_seconds,
                }
                for v in project.voices
            ],
        }

        history_data = {
            "parse_jobs": [
                {
                    "status": pj.status,
                    "total_chapters": pj.total_chapters,
                    "progress_percent": pj.progress_percent,
                    "error_message": pj.error_message,
                    "options": pj.options,
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
                    "error_type": tj.error_type,
                    "llm_report": tj.llm_report,
                    "target_scope": tj.target_scope,
                    "created_at": tj.created_at.isoformat() if tj.created_at else None,
                    "completed_at": tj.completed_at.isoformat() if tj.completed_at else None,
                }
                for tj in tagging_jobs
            ],
        }

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
            zf.writestr("characters.json", json.dumps(characters_data, indent=2, ensure_ascii=False))
            zf.writestr("chapters.json", json.dumps(chapters_data, indent=2, ensure_ascii=False))
            zf.writestr("rules.json", json.dumps(rules_data, indent=2, ensure_ascii=False))
            zf.writestr("history.json", json.dumps(history_data, indent=2, ensure_ascii=False))

            # Media attachments
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

        buf.seek(0)
        slug = sanitize_archive_slug(project.title)
        filename = f"{slug}_archive.zip"
        logger.info(
            "Exported project '%s' (%s) archive: %d chapters, %d segments (%d bytes)",
            project.title,
            project.id,
            total_chapters,
            total_segments,
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
        except zipfile.BadZipFile as bz:
            raise ValidationError(f"Invalid or corrupted ZIP archive: {bz}") from bz
        except json.JSONDecodeError as jd:
            raise ValidationError(f"Invalid manifest JSON in archive: {jd}") from jd

        proj = manifest.get("project", {})
        stats = manifest.get("stats", {})
        media = manifest.get("media", {})

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
            thumb_ext = Path(thumb_entry).suffix or ".jpg"
            mime = "image/png" if thumb_ext.lower() == ".png" else "image/jpeg"
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
            manu_ext = Path(manu_entry).suffix or ".epub"
            manu_att, _ = await AttachmentService.upload_bytes(
                content=manu_bytes,
                filename=f"{sanitize_archive_slug(title)}{manu_ext}",
                content_type="application/epub+zip",
                db=db,
            )
            await AttachmentService.claim_attachment(manu_att.id, db)
            manu_attachment_id = manu_att.id

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
            settings=proj_info.get("settings") or {},
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

            char_model = CharacterModel(
                id=new_char_id,
                project_id=new_project_id,
                name=c["name"],
                slug=c.get("slug") or sanitize_archive_slug(c["name"]).lower(),
                gender=c.get("gender", "male"),
                role_description=c.get("role_description"),
                assigned_voice_name=c.get("assigned_voice_name"),
                assigned_voice_id=c.get("assigned_voice_id"),
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
                audio_job_status=str(ch.get("audio_job_status", "none")),
                audio_job_error=ch.get("audio_job_error"),
                audio_account_used=ch.get("audio_account_used"),
                audio_job_id=ch.get("audio_job_id"),
            )
            db.add(chapter_model)

            segments = ch.get("segments", [])
            for seg in segments:
                new_seg_id = str(uuid.uuid4())
                old_char_id = seg.get("character_id")
                new_char_id = char_id_map.get(str(old_char_id)) if old_char_id else None

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
                    atmosphere_id=seg.get("atmosphere_id"),
                    atmosphere_name=seg.get("atmosphere_name"),
                    atmosphere_volume=seg.get("atmosphere_volume"),
                    sfx_cues=seg.get("sfx_cues"),
                )
                db.add(seg_model)

        await db.flush()

        # Pronunciation Rules
        for r in rules_data.get("pronunciations", []):
            rule_model = PronunciationRuleModel(
                id=str(uuid.uuid4()),
                project_id=new_project_id,
                phrase=str(r["phrase"]),
                replacement=str(r["replacement"]),
                match_case=bool(r.get("match_case", False)),
                scope=str(r.get("scope", "entire_manuscript")),
                occurrences_count=int(r.get("occurrences_count", 0)),
                excluded_segment_ids=r.get("excluded_segment_ids") or [],
                is_active=bool(r.get("is_active", True)),
            )
            db.add(rule_model)

        # SFX Items
        for s in rules_data.get("sfx_items", []):
            sfx_model = SFXModel(
                id=str(uuid.uuid4()),
                project_id=new_project_id,
                name=str(s["name"]),
                category=str(s.get("category", "foley")),
                sfx_type=str(s.get("sfx_type", "short")),
                storage_key=s.get("storage_key"),
                duration_seconds=s.get("duration_seconds"),
                volume=float(s.get("volume", 0.5)),
                metadata_json=s.get("metadata_json"),
            )
            db.add(sfx_model)

        # Project Voices
        for v in rules_data.get("voices", []):
            voice_model = VoiceModel(
                id=str(uuid.uuid4()),
                user_id=user_id,
                project_id=new_project_id,
                name=str(v["name"]),
                gender=str(v.get("gender", "neutral")),
                is_global=bool(v.get("is_global", True)),
                audio_storage_key=str(v["audio_storage_key"]),
                avatar_storage_key=v.get("avatar_storage_key"),
                reference_text=v.get("reference_text"),
                duration_seconds=v.get("duration_seconds"),
            )
            db.add(voice_model)

        # History Jobs
        for pj in history_data.get("parse_jobs", []):
            parse_job_model = ParseJobModel(
                id=str(uuid.uuid4()),
                project_id=new_project_id,
                job_type=str(pj.get("job_type", "parse")),
                status=str(pj.get("status", "completed")),
                total_chapters=int(pj.get("total_chapters", len(chapters_data))),
                progress_percent=float(pj.get("progress_percent", 100.0)),
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
                error_message=tj.get("error_message"),
                llm_report=tj.get("llm_report"),
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
