from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiTokenCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Descriptive label for the token")
    expires_in_days: int | None = Field(
        default=None, ge=1, le=3650, description="Optional days until expiration. None = permanent token"
    )
    rate_limit_rpm: int | None = Field(
        default=None, ge=1, le=10000, description="Optional requests per minute ceiling. None = unlimited"
    )


class ApiTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    token_prefix: str
    expires_at: datetime | None = None
    rate_limit_rpm: int | None = None
    is_active: bool
    last_used_at: datetime | None = None
    created_at: datetime


class ApiTokenCreatedResponse(ApiTokenResponse):
    token: str = Field(..., description="The complete raw secret token. Displayed only once upon creation.")


class ApiTokenListResponse(BaseModel):
    tokens: list[ApiTokenResponse]
    total: int
