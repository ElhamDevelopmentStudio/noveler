from pydantic import BaseModel, Field


class TelegramSettingsResponse(BaseModel):
    enabled: bool = False
    bot_token_masked: str | None = None
    chat_id: str | None = None
    has_token: bool = False


class TelegramSettingsUpdate(BaseModel):
    enabled: bool
    bot_token: str | None = Field(default=None, description="Plaintext bot token. If omitted or masked, existing token is preserved.")
    chat_id: str | None = Field(default=None, description="Target Telegram chat ID or channel handle.")


class TelegramTestRequest(BaseModel):
    bot_token: str | None = Field(default=None, description="Optional token to test before saving. If omitted, uses saved token.")
    chat_id: str | None = Field(default=None, description="Optional chat ID to test before saving. If omitted, uses saved chat ID.")


class TelegramTestResponse(BaseModel):
    success: bool
    message: str
    bot_username: str | None = None
    bot_name: str | None = None


class TelegramSendChapterRequest(BaseModel):
    force_preview: bool = Field(default=False, description="Send synthetic audio preview if full master audio is not yet rendered.")


class TelegramSendChapterResponse(BaseModel):
    success: bool
    message: str
    chapter_id: str
    chapter_number: int
    chat_id: str
    title: str
    filename: str
    is_preview: bool = False
