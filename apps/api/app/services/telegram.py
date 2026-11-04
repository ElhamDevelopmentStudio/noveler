import httpx
from novelova_core.exceptions import AppError
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.telegram")


def mask_telegram_token(token: str | None) -> str | None:
    """Mask a Telegram bot token, preserving the bot ID prefix and the last 4 characters."""
    if not token:
        return None
    token = token.strip()
    if ":" in token:
        prefix, secret = token.split(":", 1)
        if len(secret) > 8:
            masked_secret = "•" * (len(secret) - 4) + secret[-4:]
            return f"{prefix}:{masked_secret}"
    if len(token) > 8:
        return token[:4] + "•" * (len(token) - 8) + token[-4:]
    return "••••••••"


def generate_preview_audio_wav(duration_sec: float = 3.0, sample_rate: int = 24000) -> bytes:
    """Generate a clean, pleasant multi-tone PCM WAV chime for preview and testing audio delivery."""
    import io
    import math
    import struct
    import wave

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        total_samples = int(sample_rate * duration_sec)
        frames = bytearray()
        for i in range(total_samples):
            t = i / sample_rate
            # 3-tone arpeggio (C5 -> E5 -> G5)
            freq = 523.25 if t < 1.0 else (659.25 if t < 2.0 else 783.99)
            envelope = math.exp(-2.2 * (t % 1.0))
            sample = int(32767.0 * 0.35 * envelope * math.sin(2.0 * math.pi * freq * t))
            frames.extend(struct.pack("<h", max(-32768, min(32767, sample))))
        wf.writeframes(frames)
    return buffer.getvalue()


class TelegramService:
    BASE_URL = "https://api.telegram.org"

    @classmethod
    async def get_me(cls, bot_token: str) -> dict:
        """Call Telegram getMe to verify bot token and fetch bot metadata."""
        clean_token = bot_token.strip()
        url = f"{cls.BASE_URL}/bot{clean_token}/getMe"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                data = response.json()
        except httpx.TimeoutException:
            raise AppError("Connection to Telegram timed out. Please check your network.", "TELEGRAM_TIMEOUT")
        except httpx.RequestError as exc:
            raise AppError(f"Network error contacting Telegram: {exc}", "TELEGRAM_NETWORK_ERROR")

        if not data.get("ok"):
            description = data.get("description", "Unauthorized or invalid bot token.")
            raise AppError(f"Telegram Bot Token error: {description}", "INVALID_TELEGRAM_TOKEN")

        return data.get("result", {})

    @classmethod
    async def send_message(
        cls,
        bot_token: str,
        chat_id: str,
        text: str,
        parse_mode: str = "HTML",
    ) -> dict:
        """Send an HTML-formatted message to a specific Telegram chat/channel."""
        clean_token = bot_token.strip()
        clean_chat_id = chat_id.strip()
        url = f"{cls.BASE_URL}/bot{clean_token}/sendMessage"

        payload = {
            "chat_id": clean_chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=payload)
                data = response.json()
        except httpx.TimeoutException:
            raise AppError("Sending message to Telegram timed out.", "TELEGRAM_TIMEOUT")
        except httpx.RequestError as exc:
            raise AppError(f"Network error contacting Telegram: {exc}", "TELEGRAM_NETWORK_ERROR")

        if not data.get("ok"):
            description = data.get("description", "Failed to send message.")
            if "chat not found" in description.lower():
                raise AppError(
                    "Telegram Chat ID not found. Have you clicked 'Start' in your bot's chat first?",
                    "TELEGRAM_CHAT_NOT_FOUND",
                )
            if "bot was blocked by the user" in description.lower():
                raise AppError(
                    "The bot was blocked by the user. Please unblock your bot on Telegram.",
                    "TELEGRAM_BOT_BLOCKED",
                )
            raise AppError(f"Telegram error: {description}", "TELEGRAM_SEND_FAILED")

        return data.get("result", {})

    @classmethod
    async def test_connection(cls, bot_token: str, chat_id: str) -> dict:
        """Verify bot credentials and send a live welcome test ping to the user's phone."""
        if not bot_token or not bot_token.strip():
            raise AppError("Telegram Bot Token is required.", "MISSING_BOT_TOKEN")
        if not chat_id or not chat_id.strip():
            raise AppError("Telegram Chat ID is required.", "MISSING_CHAT_ID")

        # 1. Verify Bot Token
        bot_info = await cls.get_me(bot_token)
        bot_username = bot_info.get("username", "UnknownBot")
        bot_name = bot_info.get("first_name", bot_username)

        # 2. Send live confirmation message
        test_message = (
            "🎧 <b>Noveler Audio Studio</b>\n\n"
            "🎉 <b>Connection Verified!</b>\n\n"
            f"• <b>Bot:</b> @{bot_username} ({bot_name})\n"
            f"• <b>Chat ID:</b> <code>{chat_id.strip()}</code>\n"
            "• <b>Status:</b> Ready for automated chapter drops\n\n"
            "Whenever a chapter completes Stage C audio synthesis, the finished "
            "master audio file will land directly in this chat!"
        )

        await cls.send_message(bot_token, chat_id, test_message)

        return {
            "success": True,
            "message": f"Successfully verified @{bot_username} and delivered a test message!",
            "bot_username": bot_username,
            "bot_name": bot_name,
        }

    @classmethod
    async def send_audio(
        cls,
        bot_token: str,
        chat_id: str,
        audio_bytes: bytes,
        filename: str,
        title: str,
        performer: str = "Noveler",
        duration: int | None = None,
        caption: str | None = None,
        thumbnail_bytes: bytes | None = None,
    ) -> dict:
        """Upload and send a native audio file (.m4a/.mp3/.wav) to Telegram with ID3 tags and cover art."""
        clean_token = bot_token.strip()
        url = f"{cls.BASE_URL}/bot{clean_token}/sendAudio"

        data = {
            "chat_id": chat_id.strip(),
            "title": title,
            "performer": performer,
        }
        if duration is not None:
            data["duration"] = str(duration)
        if caption:
            data["caption"] = caption
            data["parse_mode"] = "HTML"

        if filename.endswith(".m4a"):
            mime_type = "audio/mp4"
        elif filename.endswith(".wav"):
            mime_type = "audio/wav"
        else:
            mime_type = "audio/mpeg"

        files = {
            "audio": (filename, audio_bytes, mime_type),
        }
        if thumbnail_bytes:
            files["thumbnail"] = ("cover.jpg", thumbnail_bytes, "image/jpeg")

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, data=data, files=files)
                res_data = response.json()
        except httpx.TimeoutException:
            raise AppError("Audio upload to Telegram timed out.", "TELEGRAM_TIMEOUT")
        except httpx.RequestError as exc:
            raise AppError(f"Network error sending audio to Telegram: {exc}", "TELEGRAM_NETWORK_ERROR")

        if not res_data.get("ok"):
            description = res_data.get("description", "Failed to upload audio to Telegram.")
            raise AppError(f"Telegram audio delivery failed: {description}", "TELEGRAM_UPLOAD_FAILED")

        return res_data.get("result", {})

    @classmethod
    async def deliver_chapter_audio(
        cls,
        user,
        project,
        chapter,
        force_preview: bool = False,
    ) -> dict:
        """Deliver chapter master audio (or preview track) to the user's verified Telegram chat."""
        if not user.telegram_bot_token or not user.telegram_chat_id:
            raise AppError(
                "Telegram delivery is not configured. "
                "Please configure your Bot Token and Chat ID in Profile Settings > Telegram.",
                "TELEGRAM_NOT_CONFIGURED",
            )

        bot_token = user.telegram_bot_token.strip()
        chat_id = user.telegram_chat_id.strip()

        audio_bytes: bytes | None = None
        filename: str = f"chapter_{chapter.chapter_number:03d}.m4a"
        is_preview: bool = False

        if not force_preview:
            # 1. Prefer local pre-cached tagged MP3 if available (compact size, < 50MB, full ID3 tags)
            try:
                from app.services.attachment import AttachmentService
                from app.services.audio_packaging import build_chapter_mp3_filename

                cache_dir = AttachmentService.get_local_storage_dir() / "packaged" / project.id
                cached_filename = build_chapter_mp3_filename(project.title, chapter.chapter_number)
                cached_file = cache_dir / cached_filename
                if cached_file.exists() and cached_file.stat().st_size > 0:
                    audio_bytes = cached_file.read_bytes()
                    filename = cached_filename
                    logger.info("Using pre-cached tagged MP3 for Telegram delivery: %s (%d bytes)", cached_filename, len(audio_bytes))
            except Exception as cache_err:
                logger.warning("Could not check local packaged MP3 cache: %s", cache_err)

            # 2. If not cached, but master audio exists, package it directly into a lightweight tagged MP3
            if not audio_bytes and chapter.audio_url:
                try:
                    from app.db.session import get_session_factory
                    from app.services.audio_packaging import AudioPackagingService

                    factory = get_session_factory()
                    async with factory() as session:
                        audio_bytes, filename, _dur = await AudioPackagingService.package_single_chapter_mp3(
                            project_id=project.id,
                            chapter_id=chapter.id,
                            db=session,
                        )
                        logger.info("Packaged MP3 on-the-fly for Telegram delivery: %s (%d bytes)", filename, len(audio_bytes))
                except Exception as pkg_err:
                    logger.warning("Could not auto-package MP3 for Telegram: %s, falling back to raw URL", pkg_err)

        if not audio_bytes and chapter.audio_url and not force_preview:
            url_str = chapter.audio_url.strip()
            if url_str.startswith("http://") or url_str.startswith("https://"):
                try:
                    async with httpx.AsyncClient(timeout=45.0) as client:
                        resp = await client.get(url_str)
                        if resp.status_code == 200:
                            audio_bytes = resp.content
                except Exception as exc:
                    logger.warning("Failed to fetch chapter audio from %s: %s", url_str, exc)
            else:
                from pathlib import Path
                local_path = Path(url_str)
                if local_path.exists():
                    audio_bytes = local_path.read_bytes()
                elif Path(f"uploads/{url_str}").exists():
                    audio_bytes = Path(f"uploads/{url_str}").read_bytes()

            if url_str.endswith(".mp3"):
                filename = f"chapter_{chapter.chapter_number:03d}.mp3"
            elif url_str.endswith(".wav"):
                filename = f"chapter_{chapter.chapter_number:03d}.wav"

        if not audio_bytes:
            preview_text = f"Chapter {chapter.chapter_number}: {chapter.title}."
            if chapter.segments and len(chapter.segments) > 0:
                first_seg_text = chapter.segments[0].text[:140]
                preview_text += f" {first_seg_text}"
            try:
                from app.services.speech import generate_segment_take_wav
                audio_bytes, dur_ms = generate_segment_take_wav(
                    preview_text,
                    gender="female",
                    sample_rate=24000,
                )
                duration_sec = max(1, dur_ms // 1000)
            except Exception as exc:
                logger.warning("Could not generate spoken preview: %s", exc)
                audio_bytes = generate_preview_audio_wav(duration_sec=3.0)
                duration_sec = 3
            filename = f"ch_{chapter.chapter_number:03d}_preview.wav"
            is_preview = True
        else:
            duration_sec = chapter.estimated_duration_seconds or 180

        # Fetch book cover art thumbnail if available
        thumbnail_bytes: bytes | None = None
        if project.thumbnail_attachment:
            try:
                from app.services.attachment import AttachmentService
                thumbnail_bytes = await AttachmentService.get_attachment_bytes(project.thumbnail_attachment)
            except Exception as exc:
                logger.warning("Could not load thumbnail attachment for Telegram: %s", exc)

        mins = duration_sec // 60
        secs = duration_sec % 60
        duration_str = f"{mins}m {secs:02d}s"

        preview_badge = " <i>[Studio Preview]</i>" if is_preview else ""
        caption = (
            f"🎧 <b>{project.title}</b>\n"
            f"📖 <b>Chapter {chapter.chapter_number}: {chapter.title}</b>{preview_badge}\n\n"
            f"• <b>Duration:</b> {duration_str}\n"
            f"• <b>Segments:</b> {len(chapter.segments) if chapter.segments else 0} takes\n"
            "✨ <i>Synthesized via Noveler Audio Studio</i>"
        )

        title = f"Chapter {chapter.chapter_number}: {chapter.title}"
        performer = f"Noveler · {project.title}"

        await cls.send_audio(
            bot_token=bot_token,
            chat_id=chat_id,
            audio_bytes=audio_bytes,
            filename=filename,
            title=title,
            performer=performer,
            duration=duration_sec,
            caption=caption,
            thumbnail_bytes=thumbnail_bytes,
        )

        return {
            "success": True,
            "message": f"Successfully delivered Chapter {chapter.chapter_number} to your Telegram!",
            "chapter_id": chapter.id,
            "chapter_number": chapter.chapter_number,
            "chat_id": chat_id,
            "title": title,
            "filename": filename,
            "is_preview": is_preview,
        }

    @classmethod
    async def deliver_batch_chapters_to_telegram(
        cls,
        user,
        project_id: str,
        chapter_ids: list[str],
        force_preview: bool = False,
    ) -> None:
        """
        Background task to sequentially deliver multiple chapters to Telegram
        with a 1.5s rate-limit pacing delay between chapters to prevent Telegram 429 errors.
        """
        from app.db.session import get_session_factory
        from app.models.chapter import ChapterModel
        from app.models.project import ProjectModel
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        factory = get_session_factory()
        delivered = 0
        failed = 0
        project_title = "Audiobook"

        logger.info(
            "Starting batch Telegram delivery for user %s: %d chapters in project %s",
            getattr(user, "id", "unknown"),
            len(chapter_ids),
            project_id,
        )

        for idx, ch_id in enumerate(chapter_ids, 1):
            try:
                async with factory() as session:
                    stmt = (
                        select(ChapterModel)
                        .where(ChapterModel.id == ch_id, ChapterModel.project_id == project_id)
                        .options(
                            selectinload(ChapterModel.segments),
                            selectinload(ChapterModel.project).selectinload(ProjectModel.thumbnail_attachment),
                        )
                    )
                    chapter = (await session.execute(stmt)).scalar_one_or_none()
                    if not chapter or not chapter.project:
                        continue
                    project_title = chapter.project.title
                    await cls.deliver_chapter_audio(
                        user=user,
                        project=chapter.project,
                        chapter=chapter,
                        force_preview=force_preview,
                    )
                    delivered += 1
                    logger.info("Delivered chapter %d/%d (%s) to Telegram", idx, len(chapter_ids), chapter.title)
            except Exception as exc:
                logger.warning("Batch Telegram drop failed for chapter %s: %s", ch_id, exc)
                failed += 1

            # Rate-limiting pacing: wait 1.5s before next chapter upload to avoid HTTP 429
            if idx < len(chapter_ids):
                await asyncio.sleep(1.5)

        # Send batch completion summary notification
        if getattr(user, "telegram_bot_token", None) and getattr(user, "telegram_chat_id", None) and delivered > 1:
            try:
                summary_msg = (
                    f"🎉 <b>Batch Delivery Complete!</b>\n\n"
                    f"• <b>Project:</b> {project_title}\n"
                    f"• <b>Delivered:</b> {delivered} chapter(s)\n"
                    f"• <b>Failed:</b> {failed}\n\n"
                    f"Enjoy your audiobook listening on Telegram! 🎧"
                )
                await cls.send_message(user.telegram_bot_token.strip(), user.telegram_chat_id.strip(), summary_msg)
            except Exception as notify_err:
                logger.warning("Could not send Telegram batch summary message: %s", notify_err)
