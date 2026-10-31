from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SFXCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(default="foley", description="foley | atmosphere")
    is_global: bool = True
    project_id: str | None = None
    default_volume: float = Field(default=1.0, ge=0.0, le=1.0)
    triggers: list[str] = Field(default_factory=list)


class SFXUpdateSchema(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = None
    is_global: bool | None = None
    default_volume: float | None = Field(default=None, ge=0.0, le=1.0)
    triggers: list[str] | None = None


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
    triggers: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SFXListResponse(BaseModel):
    items: list[SFXResponseSchema]
    total: int


class FoleyOccurrenceSchema(BaseModel):
    segment_id: str
    chapter_id: str
    chapter_number: int
    chapter_title: str
    order_index: int
    speaker: str | None = None
    delivery_type: str | None = None
    matched_text: str
    segment_text: str
    already_has_foley: bool = False
    current_action: str | None = None


class ScanFoleyOccurrencesSchema(BaseModel):
    triggers: list[str] = Field(default_factory=list)
    chapter_ids: list[str] | None = None


class ScanFoleyResponseSchema(BaseModel):
    sfx_id: str
    triggers: list[str]
    total_matches: int
    occurrences: list[FoleyOccurrenceSchema]


class ApplyFoleyTargetSchema(BaseModel):
    segment_id: str
    target_text: str


class ApplyFoleySchema(BaseModel):
    triggers: list[str] = Field(default_factory=list)
    action: str = Field(default="alongside", description="'replace' or 'alongside'")
    targets: list[ApplyFoleyTargetSchema] | None = None
    volume: float = Field(default=1.0, ge=0.0, le=1.0)


class ApplyFoleyResponseSchema(BaseModel):
    applied_count: int
    message: str
