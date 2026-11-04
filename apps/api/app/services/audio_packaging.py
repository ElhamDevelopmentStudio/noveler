import asyncio
import io
import os
import re
import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import httpx
from app.core.config import settings
from app.models.chapter import ChapterModel
from app.models.project import ProjectModel
from app.services.attachment import AttachmentService, get_s3_client
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.audio_packaging")


def sanitize_filename_component(name: str) -> str:
    """Sanitize title or name for filesystem paths, removing invalid chars while keeping it readable."""
    if not name:
        return "Untitled"
    # Replace illegal filesystem chars on Windows/macOS/Linux
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    # Collapse consecutive spaces
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean or "Untitled"


def build_chapter_mp3_filename(project_title: str, chapter_number: int) -> str:
    """Build standardized MP3 filename: '{Project Name} Chapter {X}.mp3'."""
    safe_title = sanitize_filename_component(project_title)
    return f"{safe_title} Chapter {chapter_number}.mp3"


class AudioPackagingService:
    @staticmethod
    def _find_ffmpeg_binary() -> str:
        """Locate ffmpeg binary in path or standard directories."""
        binary = shutil.which("ffmpeg")
        if binary:
            return binary
        # Check standard locations on macOS / Linux
        for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]:
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return candidate
        return "ffmpeg"

    @classmethod
    async def fetch_chapter_raw_audio(
        cls,
        chapter: ChapterModel,
        project_id: str,
    ) -> tuple[bytes, str]:
        """
        Fetch raw audio content bytes for a chapter from S3/R2, local uploads, or remote HTTP URL.
        Returns (audio_bytes, format_extension e.g. 'wav').
        """
        if not chapter.audio_url or not chapter.audio_url.strip():
            raise ValidationError(
                f"Chapter {chapter.chapter_number} ('{chapter.title}') has not been synthesized yet."
            )

        url_str = chapter.audio_url.strip()

        # 1. Direct HTTP/HTTPS download (e.g. presigned S3/R2 URL)
        if url_str.startswith("http://") or url_str.startswith("https://"):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.get(url_str)
                    if resp.status_code == 200 and len(resp.content) > 0:
                        fmt = "mp3" if ".mp3" in url_str.lower() else ("m4a" if ".m4a" in url_str.lower() else "wav")
                        return resp.content, fmt
                    logger.warning("Remote fetch returned status %d for chapter audio %s", resp.status_code, url_str)
            except Exception as exc:
                logger.warning("Failed to fetch chapter audio from %s: %s", url_str, exc)

        # 2. Check local uploads folder
        local_base = AttachmentService.get_local_storage_dir()
        candidate_paths = [
            Path(url_str),
            local_base / url_str,
            local_base / "attachments" / url_str,
            local_base / f"projects/{project_id}/audio/{Path(url_str).name}",
        ]
        for cp in candidate_paths:
            try:
                if cp.exists() and cp.stat().st_size > 0:
                    fmt = cp.suffix.lstrip(".").lower() or "wav"
                    return cp.read_bytes(), fmt
            except Exception:
                continue

        # 3. Check S3/R2 storage via boto3
        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            # Try key directly or standard key convention
            possible_keys = [
                url_str,
                f"projects/{project_id}/audio/{Path(url_str).name}",
                f"attachments/{url_str}",
            ]
            for key in possible_keys:
                try:
                    obj = s3.get_object(Bucket=settings.R2_BUCKET, Key=key)
                    data = obj["Body"].read()
                    if data and len(data) > 0:
                        fmt = "mp3" if key.lower().endswith(".mp3") else ("m4a" if key.lower().endswith(".m4a") else "wav")
                        return data, fmt
                except Exception:
                    continue

        raise NotFoundError(
            f"Audio file for Chapter {chapter.chapter_number} could not be retrieved from storage."
        )

    @classmethod
    async def fetch_project_cover_bytes(
        cls,
        project: ProjectModel,
    ) -> bytes | None:
        """Fetch project cover art thumbnail bytes if available."""
        if not project.thumbnail_attachment:
            return None
        try:
            return await AttachmentService.get_attachment_bytes(project.thumbnail_attachment)
        except Exception as exc:
            logger.warning("Failed to fetch project thumbnail cover bytes: %s", exc)
            return None

    @classmethod
    async def transcode_and_tag_mp3(
        cls,
        audio_bytes: bytes,
        source_format: str,
        project_title: str,
        chapter_title: str,
        chapter_number: int,
        total_chapters: int,
        author: str | None = None,
        genre: str | None = None,
        thumbnail_bytes: bytes | None = None,
    ) -> bytes:
        """
        Transcode raw audio (WAV, M4A, etc.) to 192kbps MP3 and inject ID3v2.3 tags with embedded cover art.
        """
        ffmpeg_bin = cls._find_ffmpeg_binary()

        with tempfile.TemporaryDirectory() as tmp_dir:
            input_file = Path(tmp_dir) / f"input.{source_format}"
            output_file = Path(tmp_dir) / "output.mp3"
            input_file.write_bytes(audio_bytes)

            # Transcode with FFmpeg to high quality 192kbps CBR stereo MP3 at 44.1kHz
            cmd = [
                ffmpeg_bin,
                "-y",
                "-i",
                str(input_file),
                "-vn",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-b:a",
                "192k",
                "-f",
                "mp3",
                str(output_file),
            ]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0 or not output_file.exists() or output_file.stat().st_size == 0:
                logger.error(
                    "FFmpeg transcode failed (code %d): %s",
                    proc.returncode,
                    stderr.decode(errors="replace"),
                )
                # If input is already an MP3, we might use it directly
                if source_format.lower() == "mp3":
                    output_file.write_bytes(audio_bytes)
                else:
                    raise ValidationError("Failed to transcode chapter audio into MP3 format.")

            # Inject comprehensive ID3v2.3 tags using mutagen
            cls._apply_id3_tags(
                mp3_path=output_file,
                project_title=project_title,
                chapter_title=chapter_title,
                chapter_number=chapter_number,
                total_chapters=total_chapters,
                author=author,
                genre=genre,
                thumbnail_bytes=thumbnail_bytes,
            )

            return output_file.read_bytes()

    @staticmethod
    def _apply_id3_tags(
        mp3_path: Path,
        project_title: str,
        chapter_title: str,
        chapter_number: int,
        total_chapters: int,
        author: str | None = None,
        genre: str | None = None,
        thumbnail_bytes: bytes | None = None,
    ) -> None:
        """Inject standardized ID3v2.3 metadata into MP3 file."""
        from mutagen.id3 import (
            APIC,
            COMM,
            ID3,
            TALB,
            TCON,
            TDRC,
            TIT2,
            TPE1,
            TRCK,
        )
        from mutagen.mp3 import MP3

        try:
            audio = MP3(str(mp3_path), ID3=ID3)
            try:
                audio.add_tags()
            except Exception:
                pass  # Tags already exist

            # Title: "Chapter X: {Title}" or "Chapter X"
            clean_ch_title = chapter_title.strip()
            if not clean_ch_title or clean_ch_title.lower() == f"chapter {chapter_number}":
                track_title = f"Chapter {chapter_number}"
            else:
                track_title = f"Chapter {chapter_number}: {clean_ch_title}"

            audio.tags.add(TIT2(encoding=3, text=track_title))
            audio.tags.add(TALB(encoding=3, text=project_title.strip()))
            audio.tags.add(TPE1(encoding=3, text=(author or "Novelova").strip()))
            audio.tags.add(TRCK(encoding=3, text=f"{chapter_number}/{total_chapters}"))
            audio.tags.add(TCON(encoding=3, text=(genre or "Audiobook").strip()))
            audio.tags.add(TDRC(encoding=3, text=str(datetime.now(UTC).year)))
            audio.tags.add(
                COMM(
                    encoding=3,
                    lang="eng",
                    desc="Production",
                    text="Synthesized via Noveler Audio Studio",
                )
            )

            # Embed Cover Art (APIC)
            if thumbnail_bytes and len(thumbnail_bytes) > 0:
                is_png = thumbnail_bytes[:8] == b"\x89PNG\r\n\x1a\n"
                mime = "image/png" if is_png else "image/jpeg"
                audio.tags.add(
                    APIC(
                        encoding=3,
                        mime=mime,
                        type=3,  # Cover (front)
                        desc="Cover",
                        data=thumbnail_bytes,
                    )
                )

            # Save in ID3v2.3 format for maximum cross-platform compatibility
            audio.save(v2_version=3)
        except Exception as exc:
            logger.warning("Failed to inject ID3 tags into %s: %s", mp3_path, exc)

    @classmethod
    async def package_single_chapter_mp3(
        cls,
        project_id: str,
        chapter_id: str,
        db: AsyncSession,
    ) -> tuple[bytes, str, int]:
        """
        Package a single chapter into a standalone tagged MP3.
        Returns (mp3_bytes, filename, estimated_duration_seconds).
        """
        # Fetch project with thumbnail
        p_stmt = (
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(selectinload(ProjectModel.thumbnail_attachment))
        )
        project = (await db.execute(p_stmt)).scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Fetch chapter
        c_stmt = select(ChapterModel).where(
            ChapterModel.id == chapter_id, ChapterModel.project_id == project_id
        )
        chapter = (await db.execute(c_stmt)).scalar_one_or_none()
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' not found in project")

        # Count total chapters in project
        total_stmt = select(ChapterModel.id).where(ChapterModel.project_id == project_id)
        total_chapters = len((await db.execute(total_stmt)).scalars().all()) or 1

        # Check local cache first
        filename = build_chapter_mp3_filename(project.title, chapter.chapter_number)
        cache_dir = AttachmentService.get_local_storage_dir() / "packaged" / project_id
        cache_file = cache_dir / filename

        # If cache exists and is newer than chapter updated_at
        if cache_file.exists() and cache_file.stat().st_size > 0:
            if chapter.updated_at and cache_file.stat().st_mtime >= chapter.updated_at.timestamp():
                return cache_file.read_bytes(), filename, chapter.estimated_duration_seconds or 180

        # Fetch audio and thumbnail
        audio_bytes, source_fmt = await cls.fetch_chapter_raw_audio(chapter, project_id)
        thumbnail_bytes = await cls.fetch_project_cover_bytes(project)

        # Transcode and tag
        mp3_bytes = await cls.transcode_and_tag_mp3(
            audio_bytes=audio_bytes,
            source_format=source_fmt,
            project_title=project.title,
            chapter_title=chapter.title,
            chapter_number=chapter.chapter_number,
            total_chapters=total_chapters,
            author=project.author,
            genre=project.genre,
            thumbnail_bytes=thumbnail_bytes,
        )

        # Cache locally
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_file.write_bytes(mp3_bytes)
        except Exception as cache_err:
            logger.warning("Could not cache packaged MP3: %s", cache_err)

        return mp3_bytes, filename, chapter.estimated_duration_seconds or 180

    @classmethod
    async def precache_chapter_mp3(cls, project_id: str, chapter_id: str) -> None:
        """Background task to pre-transcode and cache a chapter MP3 on local disk."""
        from app.db.session import get_session_factory

        try:
            factory = get_session_factory()
            async with factory() as session:
                logger.info("Pre-caching packaged MP3 for chapter %s in project %s...", chapter_id, project_id)
                _bytes, fname, _dur = await cls.package_single_chapter_mp3(
                    project_id=project_id,
                    chapter_id=chapter_id,
                    db=session,
                )
                logger.info("Successfully pre-cached %s (%d bytes)", fname, len(_bytes))
        except Exception as exc:
            logger.warning("Could not pre-cache packaged MP3 for chapter %s: %s", chapter_id, exc)

    @classmethod
    async def package_chapters_archive(
        cls,
        project_id: str,
        db: AsyncSession,
        mode: Literal["all_synthesized", "selected", "range"] = "all_synthesized",
        chapter_ids: list[str] | None = None,
        range_start: int | None = None,
        range_end: int | None = None,
    ) -> tuple[io.BytesIO, str, list[dict[str, Any]]]:
        """
        Package multiple chapters into a structured ZIP archive.
        The zip contains: '{Project Name}/{Project Name} Chapter X.mp3'.
        When extracted in ~/Downloads, files cleanly extract to ~/Downloads/{Project Name}/*.mp3.
        Returns (zip_bytes_io, archive_filename, packaged_items_summary).
        """
        # Fetch project
        p_stmt = (
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(selectinload(ProjectModel.thumbnail_attachment))
        )
        project = (await db.execute(p_stmt)).scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Fetch chapters
        c_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.chapter_number.asc())
        )
        all_chapters = (await db.execute(c_stmt)).scalars().all()
        if not all_chapters:
            raise ValidationError("Project does not contain any chapters.")

        # Filter chapters according to mode
        target_chapters: list[ChapterModel] = []
        if mode == "all_synthesized":
            target_chapters = [c for c in all_chapters if bool(c.audio_url)]
        elif mode == "selected":
            if not chapter_ids:
                raise ValidationError("Please select at least one chapter to package.")
            id_set = set(chapter_ids)
            target_chapters = [c for c in all_chapters if c.id in id_set and bool(c.audio_url)]
        elif mode == "range":
            start_num = range_start or 1
            end_num = range_end or len(all_chapters)
            if start_num > end_num:
                start_num, end_num = end_num, start_num
            target_chapters = [
                c
                for c in all_chapters
                if start_num <= c.chapter_number <= end_num and bool(c.audio_url)
            ]
        else:
            target_chapters = [c for c in all_chapters if bool(c.audio_url)]

        if not target_chapters:
            raise ValidationError(
                "No synthesized chapters found for the selected criteria. "
                "Please generate audio for the chapters first."
            )

        safe_project_title = sanitize_filename_component(project.title)
        archive_filename = f"{safe_project_title}.zip"
        total_chapters = len(all_chapters)
        thumbnail_bytes = await cls.fetch_project_cover_bytes(project)

        zip_buffer = io.BytesIO()
        packaged_summary: list[dict[str, Any]] = []

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for ch in target_chapters:
                filename = build_chapter_mp3_filename(project.title, ch.chapter_number)
                zip_internal_path = f"{safe_project_title}/{filename}"

                # Check local cache
                cache_dir = AttachmentService.get_local_storage_dir() / "packaged" / project_id
                cache_file = cache_dir / filename
                mp3_bytes: bytes | None = None

                if cache_file.exists() and cache_file.stat().st_size > 0:
                    if ch.updated_at and cache_file.stat().st_mtime >= ch.updated_at.timestamp():
                        mp3_bytes = cache_file.read_bytes()

                if not mp3_bytes:
                    audio_bytes, source_fmt = await cls.fetch_chapter_raw_audio(ch, project_id)
                    mp3_bytes = await cls.transcode_and_tag_mp3(
                        audio_bytes=audio_bytes,
                        source_format=source_fmt,
                        project_title=project.title,
                        chapter_title=ch.title,
                        chapter_number=ch.chapter_number,
                        total_chapters=total_chapters,
                        author=project.author,
                        genre=project.genre,
                        thumbnail_bytes=thumbnail_bytes,
                    )
                    try:
                        cache_dir.mkdir(parents=True, exist_ok=True)
                        cache_file.write_bytes(mp3_bytes)
                    except Exception:
                        pass

                zf.writestr(zip_internal_path, mp3_bytes)
                # Cooperatively yield to event loop so other concurrent requests are not blocked
                await asyncio.sleep(0)
                packaged_summary.append(
                    {
                        "chapter_id": ch.id,
                        "chapter_number": ch.chapter_number,
                        "title": ch.title,
                        "filename": filename,
                        "size_bytes": len(mp3_bytes),
                        "duration_seconds": ch.estimated_duration_seconds or 0,
                    }
                )

        zip_buffer.seek(0)
        return zip_buffer, archive_filename, packaged_summary

    @classmethod
    async def get_package_preview(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> dict[str, Any]:
        """
        Generate lightweight packaging preview info for the frontend modal dialog.
        """
        p_stmt = (
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(selectinload(ProjectModel.thumbnail_attachment))
        )
        project = (await db.execute(p_stmt)).scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        c_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.chapter_number.asc())
        )
        chapters = (await db.execute(c_stmt)).scalars().all()

        safe_project_title = sanitize_filename_component(project.title)
        synthesized_count = sum(1 for c in chapters if bool(c.audio_url))

        # Sample preview filename
        first_num = chapters[0].chapter_number if chapters else 1
        example_filename = build_chapter_mp3_filename(project.title, first_num)

        chapters_info = [
            {
                "id": c.id,
                "chapter_number": c.chapter_number,
                "title": c.title,
                "is_synthesized": bool(c.audio_url),
                "duration_seconds": c.estimated_duration_seconds or 0,
                "word_count": c.word_count or 0,
                "filename": build_chapter_mp3_filename(project.title, c.chapter_number),
            }
            for c in chapters
        ]

        return {
            "project_id": project.id,
            "project_title": project.title,
            "safe_project_title": safe_project_title,
            "author": project.author or "Author unassigned",
            "genre": project.genre or "Audiobook",
            "has_cover_art": bool(project.thumbnail_attachment),
            "cover_art_url": (
                AttachmentService.get_presigned_url(project.thumbnail_attachment)
                if project.thumbnail_attachment
                else None
            ),
            "total_chapters_count": len(chapters),
            "synthesized_chapters_count": synthesized_count,
            "archive_filename": f"{safe_project_title}.zip",
            "target_download_path": f"~/Downloads/{safe_project_title}/",
            "example_filename": example_filename,
            "format": "MP3 (192 kbps CBR, ID3v2.3)",
            "chapters": chapters_info,
        }
