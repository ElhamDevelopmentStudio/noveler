import random
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.project import ProjectModel


def utc_now() -> datetime:
    return datetime.now(UTC)


def generate_job_code() -> str:
    num = random.randint(20000, 29999)
    return f"JOB B-{num}"


class ProductionJobModel(Base):
    __tablename__ = "production_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_code: Mapped[str] = mapped_column(
        String(50), nullable=False, default=generate_job_code
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[str] = mapped_column(String(50), nullable=False, default="stage_b")
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="running"
    )  # "running", "paused", "stopped", "complete"

    current_operation: Mapped[str] = mapped_column(
        String(255), nullable=False, default="Resolving dialogue attribution"
    )
    current_batch: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    total_batches: Mapped[int] = mapped_column(Integer, nullable=False, default=64)
    records_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=23814)
    total_records: Mapped[int] = mapped_column(Integer, nullable=False, default=84900)
    progress_percent: Mapped[float] = mapped_column(Float, nullable=False, default=28.0)
    most_recent_step: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Batch 17 committed · character references indexed",
    )

    last_heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel", back_populates="production_jobs", lazy="selectin"
    )
