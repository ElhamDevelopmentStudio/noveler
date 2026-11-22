from datetime import UTC, datetime
from typing import Any

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.services.llm_client import StructuredLLMClient
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.chapter_packaging")


class ChapterPackagingMetadataSchema(BaseModel):
    episode_title: str = Field(..., min_length=3, max_length=150, description="Compelling YouTube/podcast episode title")
    short_recap: str = Field(..., min_length=10, max_length=600, description="2-3 sentence spoiler-safe episode hook/recap")
    youtube_description: str = Field(..., min_length=20, description="Formatted YouTube/podcast description with intro & hashtags")
    content_warnings: list[str] = Field(default_factory=list, description="Concise content warnings if applicable, else empty list")
    mood_tags: list[str] = Field(default_factory=list, description="3-6 genre/mood tags for discovery")


PACKAGING_SYSTEM_PROMPT = """You are an audiobook & YouTube/podcast producer writing release packaging metadata for a novel chapter.
Given the project title, author, chapter number/title, featured characters, and chapter text, produce:
- episode_title: Punchy, curiosity-inducing episode title (include chapter number cleanly, no clickbait lies).
- short_recap: 2-3 sentence intriguing summary that hooks listeners without spoiling the final twist.
- youtube_description: Clean, ready-to-paste description with a hook paragraph, featured cast list, and 4-6 relevant hashtags.
- content_warnings: Only include real warnings if present (e.g., "fantasy combat", "mild peril"); otherwise empty list.
- mood_tags: 3-6 concise mood/genre tags.
"""


class ChapterPackagingService:
    @classmethod
    async def generate_packaging(
        cls,
        *,
        project_id: str,
        chapter_ids: list[str],
        style: str = "youtube_audiobook",
        db: AsyncSession,
    ) -> dict[str, Any]:
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")
        if not chapter_ids:
            raise ValidationError("At least one chapter_id is required for packaging generation.")

        ch_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id, ChapterModel.id.in_(chapter_ids))
            .order_by(ChapterModel.order_index.asc())
        )
        chapters = list((await db.execute(ch_stmt)).scalars().all())
        if not chapters:
            raise NotFoundError("No matching chapters found in project.")

        items_out: list[dict[str, Any]] = []
        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
            "reasoning_tokens": 0,
        }

        for ch in chapters:
            seg_stmt = (
                select(ScriptSegmentModel.speaker, ScriptSegmentModel.text)
                .where(ScriptSegmentModel.chapter_id == ch.id)
                .order_by(ScriptSegmentModel.order_index.asc())
            )
            rows = (await db.execute(seg_stmt)).all()
            featured_speakers = list(
                dict.fromkeys(
                    r.speaker
                    for r in rows
                    if r.speaker and r.speaker not in {"Narrator", "System / Interface", "General Male", "General Female"}
                )
            )[:12]
            chapter_text = "\n".join(r.text for r in rows if r.text)[:9000]

            pkg_obj, usage = await StructuredLLMClient.complete_json(
                system_prompt=PACKAGING_SYSTEM_PROMPT,
                user_payload={
                    "style": style,
                    "project_title": project.title,
                    "author": getattr(project, "author", None) or "",
                    "chapter_number": ch.chapter_number,
                    "original_chapter_title": ch.title,
                    "featured_characters": featured_speakers,
                    "chapter_text": chapter_text,
                },
                response_model=ChapterPackagingMetadataSchema,
                temperature=0.35,
            )
            for k in total_usage:
                total_usage[k] += usage.get(k, 0)

            meta_dict = pkg_obj.model_dump()
            meta_dict["style"] = style
            meta_dict["generated_at"] = datetime.now(UTC).isoformat()

            ch.packaging_metadata = meta_dict
            ch.updated_at = datetime.now(UTC)
            items_out.append(
                {
                    "chapter_id": ch.id,
                    "chapter_number": ch.chapter_number,
                    "title": ch.title,
                    "packaging_metadata": meta_dict,
                }
            )

        await db.commit()
        return {
            "project_id": project_id,
            "generated_count": len(items_out),
            "items": items_out,
            "usage": total_usage,
            "message": f"Generated packaging metadata for {len(items_out)} chapter(s).",
        }
