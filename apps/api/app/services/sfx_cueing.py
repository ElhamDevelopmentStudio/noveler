from datetime import UTC, datetime
from typing import Any, Literal

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.project import ProjectModel
from app.models.sfx import SFXModel
from app.services.llm_client import StructuredLLMClient
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.sfx_cueing")


class LLMFoleyCueItem(BaseModel):
    segment_id: str
    sfx_id: str
    target_text: str = Field(default="", description="Short phrase in segment triggering the foley")
    action: Literal["alongside", "replace"] = "alongside"
    volume: float = Field(default=0.85, ge=0.0, le=1.0)
    reason: str = ""


class LLMAtmosphereSpanItem(BaseModel):
    start_segment_id: str
    end_segment_id: str
    sfx_id: str
    volume: float = Field(default=0.2, ge=0.0, le=1.0)
    reason: str = ""


class LLMChapterSfxPlan(BaseModel):
    foley_cues: list[LLMFoleyCueItem] = Field(default_factory=list)
    atmosphere_spans: list[LLMAtmosphereSpanItem] = Field(default_factory=list)


SFX_CUEING_SYSTEM_PROMPT = """You are an audiobook sound designer assigning foley sound effects and background atmospheres.
Given:
1. "sfx_catalog": The ONLY valid sound effects and atmospheres available (each has "id", "name", "category": "foley" | "atmosphere", "triggers", "default_volume").
2. "segments": Ordered segments of a chapter ("segment_id", "order_index", "delivery_type", "text").

STRICT RULES:
1. ONLY use "sfx_id" values that exist verbatim in "sfx_catalog". NEVER invent an sfx_id!
2. For "foley_cues", ONLY use items with category == "foley". Place them sparingly on segments with clear physical/acoustic actions (e.g., door slams, footsteps, sword clangs, thunder). Do not over-clutter.
3. For "atmosphere_spans", ONLY use items with category == "atmosphere". Specify contiguous "start_segment_id" to "end_segment_id" spans where a continuous ambient bed fits (e.g., rain, tavern crowd, forest wind).
4. If no item in "sfx_catalog" fits the chapter, return empty lists.
"""


class AutoSfxCueingService:
    @classmethod
    async def auto_cue_chapters(
        cls,
        *,
        project_id: str,
        user_id: str,
        chapter_ids: list[str],
        dry_run: bool = True,
        include_foley: bool = True,
        include_atmosphere: bool = True,
        db: AsyncSession,
    ) -> dict[str, Any]:
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        if not chapter_ids:
            raise ValidationError("At least one chapter_id is required for Auto SFX Cueing.")

        # Load available SFX items (global + project-scoped)
        sfx_stmt = select(SFXModel).where(
            SFXModel.user_id == user_id,
            or_(SFXModel.is_global.is_(True), SFXModel.project_id == project_id),
        )
        sfx_items = list((await db.execute(sfx_stmt)).scalars().all())
        if not sfx_items:
            return {
                "project_id": project_id,
                "dry_run": dry_run,
                "chapters_processed": 0,
                "applied_foley_count": 0,
                "applied_atmosphere_segments": 0,
                "plans": [],
                "usage": {},
                "message": "No SFX or atmosphere assets found in your library.",
            }

        sfx_by_id = {s.id: s for s in sfx_items}
        catalog_payload = [
            {
                "id": s.id,
                "name": s.name,
                "category": s.category,
                "triggers": s.triggers or [],
                "default_volume": s.default_volume,
            }
            for s in sfx_items
            if (include_foley and s.category == "foley")
            or (include_atmosphere and s.category == "atmosphere")
        ]

        ch_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id, ChapterModel.id.in_(chapter_ids))
            .order_by(ChapterModel.order_index.asc())
        )
        chapters = list((await db.execute(ch_stmt)).scalars().all())
        if not chapters:
            raise NotFoundError("No matching chapters found in project.")

        plans: list[dict[str, Any]] = []
        applied_foley = 0
        applied_atmo_segs = 0
        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
            "reasoning_tokens": 0,
        }

        for ch in chapters:
            seg_stmt = (
                select(ScriptSegmentModel)
                .where(ScriptSegmentModel.chapter_id == ch.id)
                .order_by(ScriptSegmentModel.order_index.asc())
            )
            segs = list((await db.execute(seg_stmt)).scalars().all())
            if not segs:
                continue

            seg_by_id = {s.id: s for s in segs}
            seg_idx_by_id = {s.id: idx for idx, s in enumerate(segs)}

            # Keep payload bounded (first 160 segments per call)
            seg_payload = [
                {
                    "segment_id": s.id,
                    "order_index": s.order_index,
                    "delivery_type": s.delivery_type,
                    "text": s.text[:350],
                }
                for s in segs[:160]
            ]

            plan_obj, usage = await StructuredLLMClient.complete_json(
                system_prompt=SFX_CUEING_SYSTEM_PROMPT,
                user_payload={
                    "chapter_number": ch.chapter_number,
                    "chapter_title": ch.title,
                    "sfx_catalog": catalog_payload,
                    "segments": seg_payload,
                },
                response_model=LLMChapterSfxPlan,
                temperature=0.1,
            )
            for k in total_usage:
                total_usage[k] += usage.get(k, 0)

            valid_foley: list[dict[str, Any]] = []
            if include_foley:
                for fc in plan_obj.foley_cues:
                    sfx = sfx_by_id.get(fc.sfx_id)
                    seg = seg_by_id.get(fc.segment_id)
                    if not sfx or sfx.category != "foley" or not seg:
                        continue
                    cue_entry = {
                        "segment_id": seg.id,
                        "sfx_id": sfx.id,
                        "sfx_name": sfx.name,
                        "target_text": fc.target_text or seg.text[:80],
                        "action": fc.action,
                        "volume": fc.volume,
                        "reason": fc.reason,
                    }
                    valid_foley.append(cue_entry)
                    if not dry_run:
                        existing = list(seg.sfx_cues or [])
                        if not any(c.get("sfx_id") == sfx.id for c in existing):
                            existing.append(
                                {
                                    "sfx_id": sfx.id,
                                    "name": sfx.name,
                                    "target_text": cue_entry["target_text"],
                                    "action": fc.action,
                                    "volume": fc.volume,
                                }
                            )
                            seg.sfx_cues = existing
                            seg.updated_at = datetime.now(UTC)
                            applied_foley += 1

            valid_atmo: list[dict[str, Any]] = []
            if include_atmosphere:
                for span in plan_obj.atmosphere_spans:
                    sfx = sfx_by_id.get(span.sfx_id)
                    if not sfx or sfx.category != "atmosphere":
                        continue
                    i_start = seg_idx_by_id.get(span.start_segment_id)
                    i_end = seg_idx_by_id.get(span.end_segment_id)
                    if i_start is None or i_end is None or i_end < i_start:
                        continue
                    span_segs = segs[i_start : i_end + 1]
                    valid_atmo.append(
                        {
                            "start_segment_id": span.start_segment_id,
                            "end_segment_id": span.end_segment_id,
                            "segment_count": len(span_segs),
                            "sfx_id": sfx.id,
                            "sfx_name": sfx.name,
                            "volume": span.volume,
                            "reason": span.reason,
                        }
                    )
                    if not dry_run:
                        for seg in span_segs:
                            seg.atmosphere_id = sfx.id
                            seg.atmosphere_name = sfx.name
                            seg.atmosphere_volume = span.volume
                            seg.updated_at = datetime.now(UTC)
                            applied_atmo_segs += 1

            plans.append(
                {
                    "chapter_id": ch.id,
                    "chapter_number": ch.chapter_number,
                    "chapter_title": ch.title,
                    "foley_cues": valid_foley,
                    "atmosphere_spans": valid_atmo,
                }
            )

        if not dry_run:
            await db.commit()

        return {
            "project_id": project_id,
            "dry_run": dry_run,
            "chapters_processed": len(plans),
            "applied_foley_count": applied_foley,
            "applied_atmosphere_segments": applied_atmo_segs,
            "plans": plans,
            "usage": total_usage,
            "message": (
                f"Previewed SFX cues across {len(plans)} chapter(s)"
                if dry_run
                else f"Applied {applied_foley} foley cue(s) and {applied_atmo_segs} atmosphere segment(s)"
            ),
        }
