import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.chapter import ScriptSegmentModel
    from app.models.project import ProjectModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class CharacterModel(Base):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(50), nullable=False, default="male")  # "male", "female", "narrator"
    role_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dialogue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chapters_span: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_voice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_voice_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_general: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    project: Mapped["ProjectModel"] = relationship(
        "ProjectModel", back_populates="characters", lazy="selectin"
    )
    segments: Mapped[list["ScriptSegmentModel"]] = relationship(
        "ScriptSegmentModel",
        back_populates="character",
        lazy="selectin",
    )
