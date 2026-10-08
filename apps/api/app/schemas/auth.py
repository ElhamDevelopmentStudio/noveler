from datetime import datetime

from novelova_core.models import BaseSchema
from pydantic import Field


class UserResponse(BaseSchema):
    id: str
    name: str
    email: str
    handle: str
    role: str = "admin"
    social: str | None = None
    avatar_attachment_id: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseSchema):
    name: str | None = None
    email: str | None = None
    handle: str | None = None
    social: str | None = None
    current_password: str | None = None
    password: str | None = Field(default=None, min_length=6)
    avatar_attachment_id: str | None = None


class LoginRequest(BaseSchema):
    email: str
    password: str


class TokenResponse(BaseSchema):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ForgotPasswordRequest(BaseSchema):
    email: str


class ForgotPasswordResponse(BaseSchema):
    message: str
    reset_token: str | None = None


class ResetPasswordRequest(BaseSchema):
    token: str
    new_password: str = Field(min_length=6)
