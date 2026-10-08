from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PronunciationSearchRequest(BaseModel):
    phrase: str = Field(..., min_length=1, description="Word or phrase to find")
    replacement: str = Field(..., min_length=1, description="Replacement / pronunciation")
    match_case: bool = Field(default=False)
    scope: str = Field(default="entire_manuscript")


class PronunciationOccurrence(BaseModel):
    chapter_number: int
    chapter_title: str
    segment_id: str
    current_text: str
    after_replacement: str
    included: bool = True


class PronunciationSearchResponse(BaseModel):
    phrase: str
    replacement: str
    total_occurrences: int
    occurrences: list[PronunciationOccurrence]


class PronunciationRuleCreate(BaseModel):
    phrase: str = Field(..., min_length=1)
    replacement: str = Field(..., min_length=1)
    match_case: bool = False
    scope: str = "entire_manuscript"
    occurrences_count: int = 0


class PronunciationRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    phrase: str
    replacement: str
    match_case: bool
    scope: str
    occurrences_count: int
    created_at: datetime
