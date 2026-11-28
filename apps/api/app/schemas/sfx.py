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
    action: str = Field(default="replace", description="'replace', 'alongside', or 'after'")
    targets: list[ApplyFoleyTargetSchema] | None = None
    volume: float = Field(default=1.0, ge=0.0, le=1.0)


class ApplyFoleyResponseSchema(BaseModel):
    applied_count: int
    message: str


class AutoSfxCueRequestSchema(BaseModel):
    chapter_ids: list[str] = Field(..., min_length=1, description="Chapter IDs to analyze for SFX & atmosphere cues")
    dry_run: bool = Field(default=True, description="Preview cues without mutating segments when True")
    include_foley: bool = Field(default=True)
    include_atmosphere: bool = Field(default=True)
    propose_missing_assets: bool = Field(
        default=True,
        description="Allow LLM to propose new TangoFlux SFX/atmosphere assets when not found in library",
    )


class AutoSfxCueResponseSchema(BaseModel):
    project_id: str
    dry_run: bool
    chapters_processed: int
    applied_foley_count: int
    applied_atmosphere_segments: int
    proposed_assets: list[dict] = Field(default_factory=list)
    matched_assets: list[dict] = Field(default_factory=list)
    plans: list[dict] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict)
    message: str


class SfxCueJobResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    user_id: str
    status: str
    chapter_ids: list[str] = Field(default_factory=list)
    include_foley: bool = True
    include_atmosphere: bool = True
    propose_missing_assets: bool = True
    total_chapters: int = 0
    processed_chapters: int = 0
    total_chunks: int = 0
    processed_chunks: int = 0
    progress_percentage: int = 0
    current_step: str | None = None
    error_message: str | None = None
    result_plan: dict | None = None
    created_at: datetime
    updated_at: datetime


class SfxCueJobListResponse(BaseModel):
    jobs: list[SfxCueJobResponseSchema]
    total: int
