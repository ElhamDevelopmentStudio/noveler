"""Base Pydantic models and response envelopes."""

from datetime import UTC, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


def utc_now() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(UTC)


class BaseSchema(BaseModel):
    """Base schema with standard serialization configurations."""

    model_config = ConfigDict(
        populate_by_name=True,
        validate_assignment=True,
        arbitrary_types_allowed=True,
    )


class DateTimeMixin(BaseModel):
    """Mixin providing created_at and updated_at timestamps."""

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ApiResponse(BaseSchema, Generic[T]):
    """Standard API response envelope matching the TypeScript ApiResponse interface."""

    success: bool = True
    data: T
    message: str | None = None
    timestamp: datetime = Field(default_factory=utc_now)
