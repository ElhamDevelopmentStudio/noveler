from typing import Literal

from pydantic import BaseModel, Field


class PackageChaptersRequest(BaseModel):
    mode: Literal["all_synthesized", "selected", "range"] = Field(
        default="all_synthesized",
        description="Packaging mode: all_synthesized, selected, or range",
    )
    chapter_ids: list[str] | None = Field(
        default=None,
        description="Explicit list of chapter IDs when mode is 'selected'",
    )
    range_start: int | None = Field(
        default=None,
        description="Starting chapter number when mode is 'range'",
    )
    range_end: int | None = Field(
        default=None,
        description="Ending chapter number when mode is 'range'",
    )


class PackageChapterItem(BaseModel):
    id: str
    chapter_number: int
    title: str
    is_synthesized: bool
    duration_seconds: int = 0
    word_count: int = 0
    filename: str


class PackagePreviewResponse(BaseModel):
    project_id: str
    project_title: str
    safe_project_title: str
    author: str
    genre: str
    has_cover_art: bool
    cover_art_url: str | None = None
    total_chapters_count: int
    synthesized_chapters_count: int
    archive_filename: str
    target_download_path: str
    example_filename: str
    format: str = "MP3 (192 kbps CBR, ID3v2.3)"
    chapters: list[PackageChapterItem] = Field(default_factory=list)
