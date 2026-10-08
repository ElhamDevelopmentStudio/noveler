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
