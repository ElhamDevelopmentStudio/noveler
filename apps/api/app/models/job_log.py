import uuid
from datetime import UTC, datetime

from app.db.base import Base
from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


class JobLogModel(Base):
    __tablename__ = "scheduled_job_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())[:8]
    )
    job_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    job_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="success", nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
