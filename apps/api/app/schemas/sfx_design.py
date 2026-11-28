from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SfxDesignItemInput(BaseModel):
    asset_key: str | None = Field(
        default=None,
        description="Client/planner key used to link newly generated SFX to pending script cues",
    )
    name: str = Field(..., min_length=1, max_length=255)
    prompt: str = Field(..., min_length=3, max_length=1000, description="TangoFlux text-to-audio prompt")
    category: Literal["foley", "atmosphere"] = "foley"
    duration_seconds: float = Field(default=3.0, ge=1.0, le=30.0)
    default_volume: float = Field(default=0.85, ge=0.0, le=1.0)
    triggers: list[str] = Field(default_factory=list)
    is_global: bool | None = Field(default=None, description="Overrides job-level is_global if set")
    replace_sfx_id: str | None = Field(
        default=None,
        description="If provided, overwrites this existing SFXModel audio in-place (single-sound retake)",
    )


class PendingFoleyCueInput(BaseModel):
    segment_id: str
    sfx_id: str | None = None
    asset_key: str | None = None
    sfx_name: str = ""
    target_text: str = ""
    action: Literal["replace", "alongside", "after"] = "replace"
    volume: float = Field(default=0.85, ge=0.0, le=1.0)


class PendingAtmosphereSpanInput(BaseModel):
    start_segment_id: str
    end_segment_id: str
    segment_ids: list[str] = Field(default_factory=list)
    sfx_id: str | None = None
    asset_key: str | None = None
    sfx_name: str = ""
    volume: float = Field(default=0.2, ge=0.0, le=1.0)


class SfxDesignRequestSchema(BaseModel):
    project_id: str
    items: list[SfxDesignItemInput] = Field(..., min_length=1)
    pending_cues: list[PendingFoleyCueInput] = Field(default_factory=list)
    pending_atmosphere_spans: list[PendingAtmosphereSpanInput] = Field(default_factory=list)
    auto_apply_cues: bool = True
    is_global: bool = False
    cache_to_dataset: bool = True
    kaggle_account_id: str | None = None


class SfxDesignItemResultSchema(BaseModel):
    asset_key: str
    name: str
    category: str = "foley"
    prompt: str = ""
    duration_seconds: float | None = None
    status: str = "pending"  # pending | completed | failed
    sfx_id: str | None = None
    audio_url: str | None = None
    applied_cues_count: int = 0
    error: str | None = None


class SfxDesignJobResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    user_id: str
    kaggle_account_id: str | None = None
    status: str
    auto_apply_cues: bool
    is_global: bool
    cache_to_dataset: bool
    total_items: int
    completed_items: int
    progress_percentage: int
    current_step: str | None = None
    error_message: str | None = None
    results: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SfxDesignJobListResponse(BaseModel):
    jobs: list[SfxDesignJobResponseSchema]
    total: int


class ApplySfxPlanRequestSchema(BaseModel):
    foley_cues: list[PendingFoleyCueInput] = Field(default_factory=list)
    atmosphere_spans: list[PendingAtmosphereSpanInput] = Field(default_factory=list)


class ApplySfxPlanResponseSchema(BaseModel):
    applied_foley_count: int
    applied_atmosphere_segments: int
    message: str
