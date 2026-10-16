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
        """Upload and send a native audio file (.m4a/.mp3) to Telegram with ID3 tags and cover art."""
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

        files = {
            "audio": (filename, audio_bytes, "audio/mp4" if filename.endswith(".m4a") else "audio/mpeg"),
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
