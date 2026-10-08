import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.project import ProjectModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class ChapterModel(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chapter_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    batch_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1, index=True)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="parsed"
    )  # "parsed", "in_production", "complete"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel", back_populates="chapters", lazy="selectin"
    )
    segments: Mapped[list["ScriptSegmentModel"]] = relationship(
        "ScriptSegmentModel",
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="ScriptSegmentModel.order_index",
        lazy="selectin",
    )


class ScriptSegmentModel(Base):
    __tablename__ = "script_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    chapter_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_dialogue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    speaker: Mapped[str | None] = mapped_column(String(255), nullable=True)
    speaker_gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    emotion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    audio_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    chapter: Mapped["ChapterModel"] = relationship(
        "ChapterModel", back_populates="segments", lazy="selectin"
    )
