from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VoiceCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    gender: str = Field(default="neutral", description="male | female | neutral")
    is_global: bool = True
    project_id: str | None = None
    reference_text: str | None = None


class VoiceUpdateSchema(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    gender: str | None = None
    is_global: bool | None = None
    reference_text: str | None = None


class VoiceResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    project_id: str | None = None
    name: str
    gender: str
    is_global: bool
    audio_url: str
    audio_storage_key: str
    avatar_url: str | None = None
    avatar_storage_key: str | None = None
    reference_text: str | None = None
    duration_seconds: float | None = None
    created_at: datetime
    updated_at: datetime


class VoiceListResponse(BaseModel):
    voices: list[VoiceResponseSchema]
    total: int
