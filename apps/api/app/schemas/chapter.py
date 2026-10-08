from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParseOptionsSchema(BaseModel):
    remove_whitespace: bool = Field(default=True, description="Remove extra whitespace")
    normalize_paragraphs: bool = Field(default=True, description="Normalize paragraph breaks")
    separate_sentence_wise: bool = Field(default=True, description="Separate the novel sentence-wise")
    detect_chapter_headings: bool = Field(default=True, description="Detect chapter headings")
    preserve_italics: bool = Field(default=True, description="Preserve italics and emphasis")
    fix_punctuation_spacing: bool = Field(default=False, description="Fix common punctuation spacing")


class ScriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    order_index: int
    text: str
    is_dialogue: bool
    speaker: str | None = None
    speaker_gender: str | None = None
    emotion: str | None = None
    audio_status: str = "pending"


class ChapterSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    chapter_number: int
    title: str
    order_index: int
    word_count: int
    estimated_duration_seconds: int
    status: str
    created_at: datetime
    updated_at: datetime


class ChapterDetailResponse(ChapterSummaryResponse):
    segments: list[ScriptSegmentResponse] = []


class ParseResponse(BaseModel):
    project_id: str
    status: str
    total_chapters: int
    total_words: int
    chapters: list[ChapterSummaryResponse]
