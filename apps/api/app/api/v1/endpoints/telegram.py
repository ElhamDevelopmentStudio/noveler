from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.telegram import (
    TelegramSettingsResponse,
    TelegramSettingsUpdate,
    TelegramTestRequest,
    TelegramTestResponse,
)
from app.services.telegram import TelegramService, mask_telegram_token
from fastapi import APIRouter, Depends
from novelova_core.exceptions import AppError
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=ApiResponse[TelegramSettingsResponse])
async def get_telegram_settings(
    current_user: UserModel = Depends(get_current_user),
):
    """Retrieve current user's Telegram delivery settings (with masked token)."""
    return ApiResponse(
        data=TelegramSettingsResponse(
            enabled=current_user.telegram_enabled,
            bot_token_masked=mask_telegram_token(current_user.telegram_bot_token),
            chat_id=current_user.telegram_chat_id,
            has_token=bool(current_user.telegram_bot_token),
        ),
        message="Telegram settings retrieved",
    )


@router.put("", response_model=ApiResponse[TelegramSettingsResponse])
async def update_telegram_settings(
    payload: TelegramSettingsUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's Telegram delivery settings."""
    current_user.telegram_enabled = payload.enabled

    # Only update token if a new, unmasked token is provided
    if payload.bot_token is not None:
        token_val = payload.bot_token.strip()
        if "•" not in token_val:  # Don't overwrite if frontend sent back the masked placeholder
            current_user.telegram_bot_token = token_val if token_val else None

    if payload.chat_id is not None:
        current_user.telegram_chat_id = payload.chat_id.strip() if payload.chat_id.strip() else None

    await db.commit()
    await db.refresh(current_user)

    return ApiResponse(
        data=TelegramSettingsResponse(
            enabled=current_user.telegram_enabled,
            bot_token_masked=mask_telegram_token(current_user.telegram_bot_token),
            chat_id=current_user.telegram_chat_id,
            has_token=bool(current_user.telegram_bot_token),
        ),
        message="Telegram settings saved successfully",
    )


@router.post("/test", response_model=ApiResponse[TelegramTestResponse])
async def test_telegram_connection(
    payload: TelegramTestRequest,
    current_user: UserModel = Depends(get_current_user),
):
    """Verify Telegram credentials and send a live welcome test ping to the user's Telegram."""
    # Resolve token (payload override or saved user token)
    token_to_use = payload.bot_token
    if not token_to_use or "•" in token_to_use:
        token_to_use = current_user.telegram_bot_token

    # Resolve chat_id (payload override or saved user chat_id)
    chat_id_to_use = payload.chat_id or current_user.telegram_chat_id

    if not token_to_use:
        raise AppError("No Bot Token provided or saved in settings.", "MISSING_BOT_TOKEN")
    if not chat_id_to_use:
        raise AppError("No Chat ID provided or saved in settings.", "MISSING_CHAT_ID")

    result = await TelegramService.test_connection(
        bot_token=token_to_use,
        chat_id=chat_id_to_use,
    )

    return ApiResponse(
        data=TelegramTestResponse(**result),
        message="Telegram test ping sent successfully",
    )
