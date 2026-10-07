from datetime import datetime
from pydantic import BaseModel, ConfigDict


class StageBJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_code: str
    project_id: str
    stage: str
    status: str
    current_operation: str
    current_batch: int
    total_batches: int
    records_processed: int
    total_records: int
    progress_percent: float
    most_recent_step: str
    elapsed_display: str
    started_display: str
    heartbeat_display: str
    started_at: datetime
    last_heartbeat_at: datetime
