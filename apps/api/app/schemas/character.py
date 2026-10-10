from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CharacterCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    gender: str = Field(default="male", description="male | female | narrator")
    role_description: str | None = None
    assigned_voice_id: str | None = None
    assigned_voice_name: str | None = None
    is_general: bool = False


class CharacterUpdateSchema(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    gender: str | None = None
    role_description: str | None = None
    assigned_voice_id: str | None = None
    assigned_voice_name: str | None = None


class CharacterResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    slug: str
    gender: str
    role_description: str | None = None
    dialogue_count: int = 0
    word_count: int = 0
    chapters_span: str | None = None
    assigned_voice_id: str | None = None
    assigned_voice_name: str | None = None
    is_general: bool = False
    is_system: bool = False
    aliases: list[str] = []
    created_at: datetime
    updated_at: datetime


class CharacterListResponse(BaseModel):
    characters: list[CharacterResponseSchema]
    total: int
    unassigned_count: int = 0


class CharacterMergeSchema(BaseModel):
    source_character_id: str = Field(..., description="ID of character to merge and remove")
    target_character_id: str = Field(..., description="ID of canonical character to keep")


class CharacterMergeAffectedChapter(BaseModel):
    id: str
    chapter_number: int
    title: str
    segment_count: int


class CharacterMergeSampleSegment(BaseModel):
    id: str
    chapter_id: str
    chapter_number: int
    chapter_title: str
    text: str
    delivery_type: str


class CharacterMergePreviewResponse(BaseModel):
    source_character: CharacterResponseSchema
    target_character: CharacterResponseSchema | None = None
    affected_segments_count: int
    affected_words_count: int
    affected_chapters: list[CharacterMergeAffectedChapter]
    sample_segments: list[CharacterMergeSampleSegment]
    warnings: list[str] = []


class CharacterAliasSuggestionSchema(BaseModel):
    source_character_id: str
    source_name: str
    target_character_id: str
    target_name: str
    reason: str
    confidence: float


