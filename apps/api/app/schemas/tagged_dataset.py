from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TaggedProjectSummaryResponse(BaseModel):
    id: str
    title: str
    author: str | None = None
    cover_url: str | None = None
    total_chapters: int
    tagged_chapters_count: int
    tagged_segments_count: int
    dialogue_segments_count: int
    total_words: int
    updated_at: datetime | None = None


class ExportTaggedDatasetRequest(BaseModel):
    project_ids: list[str] = Field(
        default_factory=list,
        description="List of project IDs to export. If empty, exports all projects with tagged chapters.",
    )
    format: Literal["json", "txt"] = Field(
        default="json",
        description="Dataset format: 'json' for structured JSON & JSONL, or 'txt' for annotated plain text.",
    )
