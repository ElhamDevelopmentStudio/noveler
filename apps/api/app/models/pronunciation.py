import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.project import ProjectModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class PronunciationRuleModel(Base):
    __tablename__ = "pronunciation_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phrase: Mapped[str] = mapped_column(String(255), nullable=False)
    replacement: Mapped[str] = mapped_column(String(255), nullable=False)
    match_case: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    scope: Mapped[str] = mapped_column(String(50), nullable=False, default="entire_manuscript")
    occurrences_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    excluded_segment_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel", back_populates="pronunciation_rules", lazy="selectin"
    )
