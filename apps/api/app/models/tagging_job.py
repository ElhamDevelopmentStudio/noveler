import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.project import ProjectModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class TaggingJobModel(Base):
    __tablename__ = "tagging_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", index=True
    )  # "pending", "running", "completed", "failed", "cancelled"

    total_chapters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_chapters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_segments: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_segments: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    current_chapter_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_step: Mapped[str | None] = mapped_column(String(255), nullable=True)
    eta_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    llm_report: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

    project: Mapped["ProjectModel"] = relationship("ProjectModel", lazy="selectin")
