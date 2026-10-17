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
        if not user.telegram_enabled or not user.telegram_bot_token or not user.telegram_chat_id:
            raise AppError(
                "Telegram delivery is not configured or is currently disabled. "
                "Please configure your Bot Token and Chat ID in Profile Settings > Telegram.",
                "TELEGRAM_NOT_CONFIGURED",
            )

        bot_token = user.telegram_bot_token.strip()
        chat_id = user.telegram_chat_id.strip()

        audio_bytes: bytes | None = None
        filename: str = f"chapter_{chapter.chapter_number:03d}.m4a"
        is_preview: bool = False

        if chapter.audio_url and not force_preview:
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
            audio_bytes = generate_preview_audio_wav(duration_sec=3.0)
            filename = f"ch_{chapter.chapter_number:03d}_preview.wav"
            is_preview = True

        # Fetch book cover art thumbnail if available
        thumbnail_bytes: bytes | None = None
        if project.thumbnail_attachment:
            try:
                from app.services.attachment import AttachmentService
                thumbnail_bytes = await AttachmentService.get_attachment_bytes(project.thumbnail_attachment)
            except Exception as exc:
                logger.warning("Could not load thumbnail attachment for Telegram: %s", exc)

        duration_sec = chapter.estimated_duration_seconds or 180
        if is_preview:
            duration_sec = 3

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
