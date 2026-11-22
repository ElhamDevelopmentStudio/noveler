from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class VocalTraitsSchema(BaseModel):
    pitch: str = Field(default="medium", description="Vocal pitch (e.g., deep baritone, bright soprano, gravelly low)")
    timbre: str = Field(default="clear", description="Vocal texture/timbre (e.g., smooth, raspy, warm, crisp, resonant)")
    cadence: str = Field(default="measured", description="Speaking rhythm & pacing (e.g., brisk, unhurried, commanding, hesitant)")
    accent_or_style: str = Field(default="neutral", description="Accent, register, or speaking style (e.g., formal noble, streetwise, scholarly)")


class CharacterRelationshipSchema(BaseModel):
    character: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1)


class CharacterDossierSchema(BaseModel):
    age_group: str = Field(default="adult", description="Estimated age range (e.g., late teens, late 20s, elderly)")
    personality_traits: list[str] = Field(default_factory=list, description="3-6 concise personality traits")
    vocal_traits: VocalTraitsSchema = Field(default_factory=VocalTraitsSchema)
    relationships: list[CharacterRelationshipSchema] = Field(default_factory=list)
    summary: str = Field(default="", description="2-3 sentence character profile for voice casting")
    voice_design_prompt: str = Field(
        ...,
        min_length=15,
        description="Natural-language voice description prompt tailored for Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    )
    sample_lines: list[str] = Field(
        ...,
        min_length=1,
        max_length=4,
        description="2-3 clean, steady-timbre calibration sentences (~8-15s total) for optimal Chatterbox-Turbo cloning",
    )


class BuildDossiersRequestSchema(BaseModel):
    character_ids: list[str] | None = Field(
        default=None,
        description="Specific character IDs to profile (if omitted, profiles all eligible non-system characters)",
    )
    refresh: bool = Field(
        default=False,
        description="If True, regenerates dossiers even for characters that already have one",
    )
    max_excerpts_per_character: int = Field(default=15, ge=3, le=30)


class CharacterDossierResultItem(BaseModel):
    character_id: str
    character_name: str
    status: str  # generated | skipped | failed
    dossier: dict[str, Any] | None = None
    error: str | None = None


class BuildDossiersResponseSchema(BaseModel):
    project_id: str
    generated_count: int
    skipped_count: int
    failed_count: int
    usage: dict[str, int] = Field(default_factory=dict)
    items: list[CharacterDossierResultItem] = Field(default_factory=list)


class VoiceDesignCharacterInput(BaseModel):
    character_id: str = Field(..., min_length=1)
    voice_design_prompt: str | None = Field(
        default=None,
        description="Optional override for Qwen3-TTS-12Hz-1.7B-VoiceDesign instruct prompt (defaults to character dossier prompt)",
    )
    sample_lines: list[str] | None = Field(
        default=None,
        description="Optional override for sample lines spoken in the reference clip",
    )
    voice_name: str | None = Field(
        default=None,
        description="Optional custom voice name (defaults to character name)",
    )


class VoiceDesignRequestSchema(BaseModel):
    project_id: str = Field(..., min_length=1)
    character_ids: list[str] | None = Field(
        default=None,
        description="Convenience list of character IDs to design voices for (alternative to items)",
    )
    items: list[VoiceDesignCharacterInput] | None = Field(
        default=None,
        description="Detailed per-character voice design configurations",
    )
    auto_assign: bool = Field(
        default=True,
        description="Automatically assign each newly generated voice to its character (default: True)",
    )
    is_global: bool = Field(
        default=False,
        description="Whether generated voices should be globally available across all projects",
    )
    cache_to_dataset: bool = Field(
        default=True,
        description="Mount/cache Qwen3-TTS-12Hz-1.7B-VoiceDesign in Kaggle Dataset to avoid repeated downloads",
    )
    kaggle_account_id: str | None = Field(
        default=None,
        description="Optional specific Kaggle account ID to run the VoiceDesign GPU notebook on",
    )
    auto_build_missing_dossiers: bool = Field(
        default=True,
        description="Automatically synthesize missing character dossiers before launching Kaggle VoiceDesign",
    )


class VoiceDesignCharacterResult(BaseModel):
    character_id: str
    character_name: str
    status: str  # pending | completed | failed
    voice_id: str | None = None
    voice_name: str | None = None
    audio_url: str | None = None
    voice_design_prompt: str | None = None
    auto_assigned: bool = False
    error: str | None = None


class VoiceDesignJobResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    user_id: str
    kaggle_account_id: str | None = None
    status: str
    auto_assign: bool
    is_global: bool
    cache_to_dataset: bool
    total_characters: int
    completed_characters: int
    progress_percentage: int
    current_step: str | None = None
    error_message: str | None = None
    target_character_ids: list[str] = Field(default_factory=list)
    results: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class VoiceDesignJobListResponse(BaseModel):
    jobs: list[VoiceDesignJobResponseSchema]
    total: int
