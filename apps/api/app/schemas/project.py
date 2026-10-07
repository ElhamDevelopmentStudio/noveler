from datetime import datetime

from novelova_core.models import PaginationMeta
from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    author: str | None = Field(default=None, max_length=255)
    owner: str | None = Field(default=None, max_length=255)
    source: str | None = Field(default=None, max_length=50)
    status: str = Field(default="in_production", max_length=50)
    language: str | None = Field(default=None, max_length=100)
    genre: str | None = Field(default=None, max_length=100)
    publication_date: str | None = Field(default=None, max_length=100)
    created_date: str | None = Field(default=None, max_length=100)
    isbn: str | None = Field(default=None, max_length=50)
    thumbnail_attachment_id: str | None = None
    manuscript_attachment_id: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    author: str | None = Field(default=None, max_length=255)
    owner: str | None = Field(default=None, max_length=255)
    source: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    language: str | None = Field(default=None, max_length=100)
    genre: str | None = Field(default=None, max_length=100)
    publication_date: str | None = Field(default=None, max_length=100)
    created_date: str | None = Field(default=None, max_length=100)
    isbn: str | None = Field(default=None, max_length=50)
    thumbnail_attachment_id: str | None = None
    manuscript_attachment_id: str | None = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    author: str | None = None
    owner: str | None = None
    source: str | None = None
    status: str
    status_label: str
    language: str | None = None
    genre: str | None = None
    publication_date: str | None = None
    created_date: str | None = None
    isbn: str | None = None
    thumbnail_attachment_id: str | None = None
    thumbnail_url: str | None = None
    manuscript_attachment_id: str | None = None
    manuscript_filename: str | None = None
    manuscript_size: int | None = None
    manuscript_url: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectCounts(BaseModel):
    all: int = 0
    in_production: int = 0
    needs_review: int = 0
    complete: int = 0
    ready_to_parse: int = 0


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    counts: ProjectCounts
    meta: PaginationMeta
