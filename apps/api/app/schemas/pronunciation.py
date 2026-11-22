from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PronunciationFindRequestSchema(BaseModel):
    word: str = Field(..., min_length=1, max_length=255)
    replacement: str = Field(default="", max_length=255)
    match_case: bool = Field(default=False)
    scope: str = Field(default="entire_manuscript", description="entire_manuscript or chapter_id")


class PronunciationOccurrenceSchema(BaseModel):
    chapter_id: str
    chapter_number: int
    chapter_title: str
    segment_id: str
    current_text: str
    preview_text: str
    is_included: bool = True


class PronunciationFindResponseSchema(BaseModel):
    word: str
    replacement: str
    occurrences: list[PronunciationOccurrenceSchema]
    total_found: int


class PronunciationRuleCreateSchema(BaseModel):
    phrase: str = Field(..., min_length=1, max_length=255)
    replacement: str = Field(..., min_length=1, max_length=255)
    match_case: bool = Field(default=False)
    scope: str = Field(default="entire_manuscript")
    excluded_segment_ids: list[str] = Field(default_factory=list)


class PronunciationRuleResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    phrase: str
    replacement: str
    match_case: bool
    scope: str
    occurrences_count: int
    excluded_segment_ids: list[str] = []
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PronunciationRuleListResponse(BaseModel):
    rules: list[PronunciationRuleResponseSchema]
    total: int


class PronunciationExtractRequestSchema(BaseModel):
    chapter_ids: list[str] | None = Field(default=None, description="Optional specific chapters to scan")
    sample_chapters: int = Field(default=8, ge=1, le=30)
    save_as_drafts: bool = Field(
        default=True,
        description="Save extracted suggestions as inactive draft rules (is_active=False) for user review",
    )


class PronunciationSuggestionItem(BaseModel):
    rule_id: str | None = None
    phrase: str
    replacement: str
    match_case: bool = True
    reason: str = ""
    occurrences_count: int = 0
    is_active: bool = False


class PronunciationExtractResponseSchema(BaseModel):
    project_id: str
    created_drafts_count: int
    suggestions: list[PronunciationSuggestionItem] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict)
    message: str


class PronunciationRuleToggleSchema(BaseModel):
    is_active: bool
