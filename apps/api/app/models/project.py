import uuid
from datetime import UTC, datetime
from enum import StrEnum

from typing import Any

from app.db.base import Base
from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC)


DEFAULT_PROJECT_SETTINGS: dict[str, Any] = {
    "paralinguistic_tags_enabled": True,
    "active_paralinguistic_tags": {
        "laugh": True,
        "sigh": True,
        "gasp": True,
        "groan": True,
        "chuckle": True,
        "cough": True,
        "sniff": True,
        "shush": True,
        "clear_throat": True,
    },
}


class ProjectStatus(StrEnum):
    IN_PRODUCTION = "in_production"
    REVIEW = "review"
    READY_TO_PARSE = "ready_to_parse"
    COMPLETE = "complete"


STATUS_LABELS: dict[str, str] = {
    ProjectStatus.IN_PRODUCTION.value: "In production",
    ProjectStatus.REVIEW.value: "Review",
    ProjectStatus.READY_TO_PARSE.value: "Ready to parse",
    ProjectStatus.COMPLETE.value: "Complete",
}


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    author: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default=ProjectStatus.IN_PRODUCTION.value, nullable=False, index=True
    )
    language: Mapped[str | None] = mapped_column(String(100), nullable=True)
    genre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    publication_date: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_date: Mapped[str | None] = mapped_column(String(100), nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(50), nullable=True)

    thumbnail_attachment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("attachments.id", ondelete="SET NULL"), nullable=True
    )
    thumbnail_attachment: Mapped["AttachmentModel | None"] = relationship(  # noqa: F821
        "AttachmentModel", foreign_keys=[thumbnail_attachment_id], lazy="selectin"
    )

    manuscript_attachment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("attachments.id", ondelete="SET NULL"), nullable=True
    )
    manuscript_attachment: Mapped["AttachmentModel | None"] = relationship(  # noqa: F821
        "AttachmentModel", foreign_keys=[manuscript_attachment_id], lazy="selectin"
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user: Mapped["UserModel"] = relationship(  # noqa: F821
        "UserModel", foreign_keys=[user_id], lazy="selectin"
    )

    settings: Mapped[dict] = mapped_column(
        JSON, default=lambda: DEFAULT_PROJECT_SETTINGS.copy(), nullable=False
    )

    chapters: Mapped[list["ChapterModel"]] = relationship(  # noqa: F821
        "ChapterModel",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ChapterModel.order_index",
        lazy="selectin",
    )
    characters: Mapped[list["CharacterModel"]] = relationship(  # noqa: F821
        "CharacterModel",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="CharacterModel.name",
        lazy="selectin",
    )
    pronunciation_rules: Mapped[list["PronunciationRuleModel"]] = relationship(  # noqa: F821
        "PronunciationRuleModel",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="PronunciationRuleModel.created_at",
        lazy="selectin",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
