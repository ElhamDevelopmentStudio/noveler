import uuid
from datetime import UTC, datetime
from typing import Any

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


class SfxDesignJobModel(Base):
    __tablename__ = "sfx_design_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kaggle_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )  # pending | running | completed | failed | cancelled
    auto_apply_cues: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cache_to_dataset: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percentage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_step: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_configs: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    pending_cues: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    pending_atmosphere_spans: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
