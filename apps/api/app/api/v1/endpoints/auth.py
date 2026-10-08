from app.api.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
from app.db.session import get_db
from app.models.user import UserModel, utc_now
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    UserUpdate,
)
from app.services.attachment import AttachmentService
from fastapi import APIRouter, Depends
from novelova_core.exceptions import AuthenticationError, ConflictError, NotFoundError
from novelova_core.models import ApiResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def user_to_response(user: UserModel) -> UserResponse:
    avatar_url: str | None = None
    if user.avatar_attachment:
        avatar_url = AttachmentService.get_presigned_url(user.avatar_attachment)

    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        handle=user.handle,
        role=user.role,
        social=user.social,
        avatar_attachment_id=user.avatar_attachment_id,
        avatar_url=avatar_url,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/login", response_model=ApiResponse[TokenResponse])
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email and password, returning JWT access token and user profile."""
    query = select(UserModel).where(UserModel.email == payload.email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise AuthenticationError("Invalid email or password")

    token = create_access_token(subject=user.id)
    return ApiResponse(
        data=TokenResponse(
            access_token=token,
            token_type="bearer",
            user=user_to_response(user),
        ),
        message="Login successful",
    )


@router.get("/me", response_model=ApiResponse[UserResponse])
async def get_me(current_user: UserModel = Depends(get_current_user)):
    """Retrieve the currently authenticated user's profile."""
    return ApiResponse(
        data=user_to_response(current_user),
        message="Current user profile retrieved",
    )


@router.put("/me", response_model=ApiResponse[UserResponse])
async def update_me(
    payload: UserUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile fields (name, email, handle, social, or password) for current user."""
    # Check if new email conflicts with another user
    if payload.email and payload.email != current_user.email:
        conflict_query = select(UserModel).where(
            UserModel.email == payload.email,
            UserModel.id != current_user.id,
        )
        existing = (await db.execute(conflict_query)).scalar_one_or_none()
        if existing:
            raise ConflictError("Email already in use by another user")
        current_user.email = payload.email

    # Check if new handle conflicts with another user
    if payload.handle and payload.handle != current_user.handle:
        conflict_query = select(UserModel).where(
            UserModel.handle == payload.handle,
            UserModel.id != current_user.id,
        )
        existing = (await db.execute(conflict_query)).scalar_one_or_none()
        if existing:
            raise ConflictError("Handle already in use by another user")
        current_user.handle = payload.handle

    if payload.name is not None:
        current_user.name = payload.name

    if payload.social is not None:
        current_user.social = payload.social

    if payload.password:
        if not payload.current_password:
            raise AuthenticationError("Current password is required to change password")
        if not verify_password(payload.current_password, current_user.password_hash):
            raise AuthenticationError("Incorrect current password")
        current_user.password_hash = hash_password(payload.password)

    if payload.avatar_attachment_id is not None:
        if payload.avatar_attachment_id == "":
            current_user.avatar_attachment_id = None
            current_user.avatar_attachment = None
        else:
            attachment = await AttachmentService.claim_attachment(payload.avatar_attachment_id, db)
            current_user.avatar_attachment_id = attachment.id
            current_user.avatar_attachment = attachment

    current_user.updated_at = utc_now()
    await db.flush()

    return ApiResponse(
        data=user_to_response(current_user),
        message="Profile updated successfully",
    )


@router.post("/forgot-password", response_model=ApiResponse[ForgotPasswordResponse])
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate password reset token for the specified user email."""
    query = select(UserModel).where(UserModel.email == payload.email)
    user = (await db.execute(query)).scalar_one_or_none()

    if not user:
        return ApiResponse(
            data=ForgotPasswordResponse(
                message="If that email is registered, password reset instructions have been generated.",
            ),
            message="Password reset initiated",
        )

    reset_token = create_password_reset_token(user.email)
    return ApiResponse(
        data=ForgotPasswordResponse(
            message="Password reset instructions have been generated.",
            reset_token=reset_token,
        ),
        message="Password reset initiated",
    )


@router.post("/reset-password", response_model=ApiResponse[dict])
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset password using a valid reset token."""
    email = verify_password_reset_token(payload.token)
    if not email:
        raise AuthenticationError("Invalid or expired password reset token")

    query = select(UserModel).where(UserModel.email == email)
    user = (await db.execute(query)).scalar_one_or_none()

    if not user:
        raise NotFoundError("User for reset token was not found")

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = utc_now()
    await db.flush()

    return ApiResponse(
        data={"reset": True},
        message="Password has been reset successfully. You can now log in.",
    )
