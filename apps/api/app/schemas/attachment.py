from datetime import datetime

from novelova_core.models import BaseSchema


class AttachmentResponse(BaseSchema):
    id: str
    filename: str
    content_type: str
    size: int
    claimed_at: datetime | None = None
    url: str
    created_at: datetime
