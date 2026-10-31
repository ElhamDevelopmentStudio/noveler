from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ParseJobResponse(BaseModel):
    id: str
    project_id: str
    job_type: str = "parse"
    status: str
    total_chapters: int = 0
    processed_chapters: int = 0
    total_segments: int = 0
    processed_segments: int = 0
    progress_percent: float = 0.0
    current_step: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
