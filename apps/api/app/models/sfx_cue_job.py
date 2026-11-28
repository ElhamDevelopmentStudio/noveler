import uuid
from datetime import UTC, datetime
from typing import Any

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


class SfxCueJobModel(Base):
    __tablename__ = "sfx_cue_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )  # pending | running | completed | failed | cancelled
    chapter_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    include_foley: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_atmosphere: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    propose_missing_assets: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    total_chapters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_chapters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percentage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_step: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_plan: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
