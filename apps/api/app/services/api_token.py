from datetime import UTC, datetime, timedelta

from app.core.security import generate_api_token
from app.models.api_token import ApiTokenModel
from app.schemas.api_token import ApiTokenCreateRequest
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.api_token")


class ApiTokenService:
    @staticmethod
    async def list_tokens(user_id: str, db: AsyncSession) -> list[ApiTokenModel]:
        """List all active and inactive API tokens belonging to the user."""
        stmt = (
            select(ApiTokenModel)
            .where(ApiTokenModel.user_id == user_id)
            .order_by(ApiTokenModel.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create_token(
        user_id: str,
        dto: ApiTokenCreateRequest,
        db: AsyncSession,
    ) -> tuple[ApiTokenModel, str]:
        """
        Generate a cryptographically secure API token and persist its SHA-256 hash.
        Returns the created ApiTokenModel and the unhashed raw token string.
        """
        raw_token, prefix, token_hash = generate_api_token()

        expires_at: datetime | None = None
        if dto.expires_in_days:
            expires_at = datetime.now(UTC) + timedelta(days=dto.expires_in_days)

        token_obj = ApiTokenModel(
            user_id=user_id,
            name=dto.name.strip(),
            token_prefix=prefix,
            token_hash=token_hash,
            expires_at=expires_at,
            rate_limit_rpm=dto.rate_limit_rpm,
            is_active=True,
        )
        db.add(token_obj)
        await db.commit()
        await db.refresh(token_obj)

        logger.info("Created API token '%s' (prefix: %s) for user %s", dto.name, prefix, user_id)
        return token_obj, raw_token

    @staticmethod
    async def revoke_token(user_id: str, token_id: str, db: AsyncSession) -> None:
        """Revoke / delete an API token."""
        stmt = select(ApiTokenModel).where(
            ApiTokenModel.id == token_id, ApiTokenModel.user_id == user_id
        )
        token_obj = (await db.execute(stmt)).scalar_one_or_none()
        if not token_obj:
            raise NotFoundError(f"API token with ID '{token_id}' not found")

        await db.delete(token_obj)
        await db.commit()
        logger.info("Revoked API token %s for user %s", token_id, user_id)
