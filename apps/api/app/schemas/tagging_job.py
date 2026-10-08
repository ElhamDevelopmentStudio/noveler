from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class TaggingJobResponse(BaseModel):
    id: str
    project_id: str
    status: str
    total_chapters: int
    processed_chapters: int
    total_segments: int
    processed_segments: int
    progress_percent: float
    current_chapter_title: str | None = None
    current_step: str | None = None
    eta_seconds: int | None = None
    error_type: str | None = None
    error_message: str | None = None
    llm_report: dict[str, Any] | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
