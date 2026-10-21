from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SFXCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(default="foley", description="foley | atmosphere")
    is_global: bool = True
    project_id: str | None = None
    default_volume: float = Field(default=1.0, ge=0.0, le=1.0)


class SFXUpdateSchema(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = None
    is_global: bool | None = None
    default_volume: float | None = Field(default=None, ge=0.0, le=1.0)


class SFXResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    project_id: str | None = None
    name: str
    category: str
    is_global: bool
    audio_url: str
    audio_storage_key: str
    duration_seconds: float | None = None
    default_volume: float = 1.0
    created_at: datetime
    updated_at: datetime


class SFXListResponse(BaseModel):
    items: list[SFXResponseSchema]
    total: int
