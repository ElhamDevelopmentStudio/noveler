from datetime import datetime

from pydantic import BaseModel, Field


class KaggleAccountResponse(BaseModel):
    id: str
    username: str
    key_masked: str
    priority: int
    is_active: bool
    status: str
    last_used_at: datetime | None = None
    exhausted_at: datetime | None = None
    estimated_reset_at: datetime | None = None
    total_hours_used: float = 0.0
    created_at: datetime
    updated_at: datetime


class KaggleAccountCreate(BaseModel):
    username: str = Field(min_length=1, description="Kaggle username")
    key: str = Field(min_length=1, description="32-character Kaggle API key")
    priority: int = Field(default=1, ge=1, le=100, description="Priority rank (1 = Primary)")
    is_active: bool = Field(default=True, description="Whether this account is eligible for kernel dispatch")
    verify_first: bool = Field(default=True, description="Whether to probe Kaggle API before saving")


class KaggleAccountUpdate(BaseModel):
    username: str | None = None
    key: str | None = None
    priority: int | None = None
    is_active: bool | None = None
    status: str | None = None
    total_hours_used: float | None = None
    verify_first: bool = True


class KaggleAccountTestResponse(BaseModel):
    success: bool
    username: str
    message: str
    is_exhausted: bool = False
    hours_used: float = 0.0
    hours_allowed: float = 30.0
    hours_remaining: float = 30.0
    quota_refresh_time: str | None = None


class KagglePoolSummaryResponse(BaseModel):
    total_accounts: int
    active_accounts: int
    available_accounts: int
    in_use_accounts: int
    exhausted_accounts: int
    total_gpu_hours_available: float


class KaggleDirectTestRequest(BaseModel):
    username: str = Field(min_length=1)
    key: str = Field(min_length=1)
