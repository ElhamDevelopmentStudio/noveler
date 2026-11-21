from datetime import UTC, datetime

import jwt
from app.core.config import settings
from app.core.security import ALGORITHM, hash_api_token
from app.db.session import get_db
from app.models.api_token import ApiTokenModel
from app.models.user import UserModel
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from novelova_core.exceptions import AuthenticationError, ForbiddenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    """Validate bearer access token or long-lived API key and return active UserModel."""
    # 1. Check for long-lived API token via X-API-Key header or Bearer prefix nv_live_
    raw_api_key = request.headers.get("x-api-key") or (token if token and token.startswith("nv_live_") else None)
    if raw_api_key:
        api_key_hash = hash_api_token(raw_api_key)
        stmt = (
            select(ApiTokenModel)
            .options(selectinload(ApiTokenModel.user))
            .where(
                ApiTokenModel.token_hash == api_key_hash,
                ApiTokenModel.is_active.is_(True),
            )
        )
        token_obj = (await db.execute(stmt)).scalar_one_or_none()
        if not token_obj or not token_obj.user:
            raise AuthenticationError("Invalid or inactive API token")

        now = datetime.now(UTC)
        if token_obj.expires_at and token_obj.expires_at < now:
            raise AuthenticationError("API token has expired")

        # Update last_used_at timestamp asynchronously
        token_obj.last_used_at = now
        await db.commit()
        return token_obj.user

    # 2. Check for standard JWT bearer access token
    if not token:
        raise AuthenticationError("Not authenticated")

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if not user_id or token_type != "access":
            raise AuthenticationError("Invalid token payload")
    except jwt.PyJWTError:
        raise AuthenticationError("Invalid or expired token")

    query = select(UserModel).where(UserModel.id == user_id)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError("User not found")

    return user


def require_roles(*roles: str):
    """Dependency factory checking that the current authenticated user holds one of the required roles."""

    async def role_checker(
        current_user: UserModel = Depends(get_current_user),
    ) -> UserModel:
        if current_user.role not in roles:
            raise ForbiddenError(
                f"Operation requires one of the following roles: {', '.join(roles)}"
            )
        return current_user

    return role_checker


async def require_admin(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Convenience dependency restricting route access to admin users."""
    if current_user.role != "admin":
        raise ForbiddenError("Admin access required")
    return current_user
