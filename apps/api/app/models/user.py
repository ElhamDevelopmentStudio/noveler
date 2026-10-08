import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.attachment import AttachmentModel
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC)


class UserRole(StrEnum):
    ADMIN = "admin"
    USER = "user"


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    handle: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), default=UserRole.ADMIN.value, nullable=False
    )
    social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_attachment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("attachments.id", ondelete="SET NULL"), nullable=True
    )
    avatar_attachment: Mapped["AttachmentModel | None"] = relationship(
        "AttachmentModel", lazy="selectin"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
