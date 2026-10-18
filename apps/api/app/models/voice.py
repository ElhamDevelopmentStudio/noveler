import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.project import ProjectModel
    from app.models.user import UserModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class VoiceModel(Base):
    __tablename__ = "voices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(50), nullable=False, default="neutral")  # "male", "female", "neutral"
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    audio_storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    avatar_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    user: Mapped["UserModel"] = relationship("UserModel", lazy="selectin")
    project: Mapped["ProjectModel | None"] = relationship(
        "ProjectModel", back_populates="voices", lazy="selectin"
    )
