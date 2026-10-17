from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParseOptionsSchema(BaseModel):
    remove_whitespace: bool = Field(default=True, description="Remove extra whitespace")
    normalize_paragraphs: bool = Field(default=True, description="Normalize paragraph breaks")
    separate_sentence_wise: bool = Field(
        default=True, description="Separate the novel sentence-wise"
    )
    detect_chapter_headings: bool = Field(default=True, description="Detect chapter headings")
    preserve_italics: bool = Field(default=True, description="Preserve italics and emphasis")
    fix_punctuation_spacing: bool = Field(
        default=False, description="Fix common punctuation spacing"
    )
    speak_unambiguous_numbers: bool = Field(
        default=True, description="Convert numbers to spoken words for audio via inflect"
    )
    preserve_existing_tags: bool = Field(
        default=True, description="Preserve already tagged dialogue speakers and characters across re-parse"
    )


class FormatScriptSchema(BaseModel):
    remove_whitespace: bool = Field(default=True, description="Clean extra whitespace")
    normalize_paragraphs: bool = Field(default=True, description="Normalize line and paragraph breaks")
    fix_punctuation_spacing: bool = Field(default=True, description="Fix spacing around punctuation and em-dashes")
    speak_unambiguous_numbers: bool = Field(default=True, description="Convert numbers to spoken words via inflect")
    normalize_dialogue_quotes: bool = Field(default=True, description="Normalize non-standard quotes")
    chapter_id: str | None = Field(default=None, description="Optional specific chapter ID to format (formats all if None)")


class FormatScriptResponse(BaseModel):
    project_id: str
    formatted_segments_count: int
    affected_chapters_count: int
    message: str


class ScriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    order_index: int
    text: str
    delivery_type: str = "narration"
    continuation_type: str = "none"
    parent_turn_id: str | None = None
    dialogue_chain_id: str | None = None
    raw_speaker_tag: str | None = None
    is_dialogue: bool
    is_internal_thought: bool = False
    speaker: str | None = None
    speaker_gender: str | None = None
    emotion: str | None = None
    audio_status: str = "pending"
    audio_url: str | None = None
    duration_ms: int | None = None
    character_id: str | None = None


class ScriptSegmentUpdateSchema(BaseModel):
    text: str | None = None
    speaker: str | None = None
    speaker_gender: str | None = None
    delivery_type: str | None = None  # dialogue, internal_thought, system_prompt, narration
    emotion: str | None = None
    is_dialogue: bool | None = None
    is_internal_thought: bool | None = None
    character_id: str | None = None
    raw_speaker_tag: str | None = None


class ScriptSegmentSplitSchema(BaseModel):
    split_index: int = Field(..., ge=1, description="Character index in text where segment is split into two")


class ScriptSegmentMergeSchema(BaseModel):
    direction: str = Field(default="next", description="'next' to merge with succeeding segment, or 'previous' to merge with preceding")


class ChapterSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    chapter_number: int
    batch_number: int = 1
    title: str
    order_index: int
    word_count: int
    estimated_duration_seconds: int
    status: str
    audio_url: str | None = None
    alignment_json: str | None = None
    audio_job_status: str | None = "none"
    audio_job_error: str | None = None
    audio_account_used: str | None = None
    audio_job_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ChapterDetailResponse(ChapterSummaryResponse):
    segments: list[ScriptSegmentResponse] = []


class SegmentAlignmentSchema(BaseModel):
    segment_id: str
    order_index: int
    start_ms: int
    end_ms: int
    duration_ms: int
    storage_key: str | None = None
    audio_url: str | None = None


class ChapterAudioStreamResponse(BaseModel):
    chapter_id: str
    chapter_title: str
    audio_url: str | None = None
    total_duration_seconds: int
    is_synthesized: bool
    audio_job_status: str | None = "none"
    audio_job_error: str | None = None
    audio_account_used: str | None = None
    audio_job_id: str | None = None
    alignments: list[SegmentAlignmentSchema]


class ChapterGenerateAudioSchema(BaseModel):
    kaggle_account_id: str | None = Field(default=None, description="Specific Kaggle account ID to dispatch to")
    allow_dev_offline: bool = Field(default=False, description="Allow offline developer synthesis fallback if GPU quota is exhausted")


class ChapterGenerateAudioResponse(BaseModel):
    chapter_id: str
    status: str
    kaggle_account_used: str | None = None
    audio_url: str | None = None
    estimated_duration_seconds: int = 0
    message: str


class BatchAudioLaneSchema(BaseModel):
    lane_index: int
    account_username: str
    account_id: str
    job_id: str
    total_chapters: int
    completed_chapters: int = 0
    current_chapter_id: str | None = None
    current_chapter_title: str | None = None
    current_chapter_number: int | None = None
    status: str = "queued"
    chapter_ids: list[str] = []


class BatchAudioStatusResponse(BaseModel):
    is_active: bool
    total_chapters: int
    completed_chapters: int
    progress_percent: float = 0.0
    lanes: list[BatchAudioLaneSchema] = []


class GenerateBatchAudioSchema(BaseModel):
    chapter_ids: list[str] | None = Field(
        default=None,
        description="Optional list of specific chapter IDs to synthesize; defaults to all un-synthesized chapters",
    )
    allow_dev_offline: bool = Field(
        default=False,
        description="Allow offline developer synthesis fallback if GPU quota is exhausted",
    )
    preferred_tts_model: str | None = Field(
        default=None,
        description="Stage C TTS model override (kokoro-82m, chatterbox-turbo, system-native)",
    )


class GenerateBatchAudioResponse(BaseModel):
    project_id: str
    total_chapters: int
    lanes: list[BatchAudioLaneSchema] = []
    message: str


class CancelBatchAudioResponse(BaseModel):
    success: bool = True
    cancelled_jobs_count: int = 0
    cancelled_chapters_count: int = 0
    message: str


class ParseResponse(BaseModel):
    project_id: str
    status: str
    total_chapters: int
    total_batches: int = 1
    total_words: int
    chapters: list[ChapterSummaryResponse]


class ChapterCreateSchema(BaseModel):
    title: str | None = Field(default=None, description="Optional custom chapter title")


class ChapterUpdateSchema(BaseModel):
    title: str | None = Field(default=None, description="New title for the chapter")


class ChapterReorderSchema(BaseModel):
    chapter_ids: list[str] = Field(..., min_length=1, description="List of chapter IDs in desired order")


class ChapterTextSaveSchema(BaseModel):
    text: str = Field(..., description="Raw text content to populate chapter with")


class SegmentRegenerateAudioSchema(BaseModel):
    speed: float | None = Field(default=1.0, ge=0.5, le=2.0, description="Speech rate multiplier")
    stability: float | None = Field(default=0.5, ge=0.0, le=1.0, description="Voice pitch stability")
    similarity: float | None = Field(default=0.75, ge=0.0, le=1.0, description="Clarity & similarity boost")
    character_voice_id: str | None = Field(default=None, description="Target character voice identifier")


class SegmentRegenerateAudioResponse(BaseModel):
    segment: ScriptSegmentResponse
    chapter_id: str
    take_number: int = 1
    duration_ms: int
    audio_url: str
    message: str

