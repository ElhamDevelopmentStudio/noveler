import re
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.project import ProjectModel
from app.models.sfx import SFXModel
from app.services.llm_client import StructuredLLMClient
from app.services.sfx import SFXService
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.sfx_cueing")


class LLMProposedSfxAsset(BaseModel):
    asset_key: str = Field(..., description="Short snake_case key e.g. 'wood_door_slam' or 'heavy_rain_bed'")
    name: str = Field(..., description="Human-readable asset name e.g. 'Heavy Wooden Door Slam'")
    category: Literal["foley", "atmosphere"] = "foley"
    prompt: str = Field(
        ...,
        description="Rich, concrete TangoFlux text-to-audio prompt (no speech, clear acoustic texture)",
    )
    duration_seconds: float = Field(default=2.5, ge=1.0, le=30.0)
    triggers: list[str] = Field(default_factory=list, description="Trigger words/onomatopoeia")
    default_volume: float = Field(default=0.85, ge=0.0, le=1.0)


class LLMFoleyCueItem(BaseModel):
    segment_id: str
    sfx_id: str | None = Field(default=None, description="Existing library sfx_id if matched")
    asset_key: str | None = Field(default=None, description="Proposed asset_key if not in library")
    target_text: str = Field(
        default="",
        description="Exact verbatim word or short phrase in the segment text to replace or anchor the foley",
    )
    action: Literal["replace", "alongside", "after"] = "replace"
    volume: float = Field(default=0.85, ge=0.0, le=1.0)
    reason: str = ""


class LLMAtmosphereSpanItem(BaseModel):
    start_segment_id: str
    end_segment_id: str
    sfx_id: str | None = Field(default=None, description="Existing library sfx_id if matched")
    asset_key: str | None = Field(default=None, description="Proposed asset_key if not in library")
    volume: float = Field(default=0.2, ge=0.0, le=1.0)
    reason: str = ""


class LLMChapterSfxPlan(BaseModel):
    proposed_assets: list[LLMProposedSfxAsset] = Field(default_factory=list)
    foley_cues: list[LLMFoleyCueItem] = Field(default_factory=list)
    atmosphere_spans: list[LLMAtmosphereSpanItem] = Field(default_factory=list)


SFX_CUEING_SYSTEM_PROMPT = """You are an expert audiobook sound designer assigning foley sound effects and background atmospheres for a novel.
Given:
1. "sfx_catalog": Existing sound effects and atmospheres already in the user's library (each has "id", "name", "category": "foley" | "atmosphere", "triggers", "default_volume").
2. "propose_missing_assets": Boolean indicating whether you may propose NEW TangoFlux audio assets when no suitable sound exists in "sfx_catalog".
3. "segments": Ordered segments of a chapter ("segment_id", "order_index", "delivery_type", "text").

STRICT RULES:
1. Prefer matching an existing "sfx_id" verbatim from "sfx_catalog" whenever a sound already fits.
2. If "propose_missing_assets" is true and an important acoustic moment has NO match in "sfx_catalog", add a reusable entry to "proposed_assets" with a clean snake_case "asset_key", concise "name", and vivid TangoFlux "prompt" (describe physical acoustics, environment, no speech/music, 1.5-4s for foley, 15-25s for atmosphere). Reference it via "asset_key" in "foley_cues" or "atmosphere_spans".
3. If "propose_missing_assets" is false, ONLY use "sfx_id" values verbatim from "sfx_catalog" and leave "proposed_assets" empty.
4. DEFAULT FOLEY ACTION IS "replace": Use action="replace" by default for foley cues (especially onomatopoeia, sound words, or explicit sound cues like "CRACK!", "BAM", "*ding*", "Thud", "Bang", etc.), setting "target_text" to the exact verbatim word/phrase in the segment text that should be replaced inline by the sound effect. Only use "alongside" or "after" if removing target_text would break a crucial narrative sentence.
5. Be selective and cinematic — place foley sparingly on clear physical/acoustic moments; do not clutter every line.
6. For "atmosphere_spans", specify contiguous "start_segment_id" to "end_segment_id" spans where a continuous ambient bed fits (e.g., rain, tavern crowd, wind, dungeon hum).
7. Reuse the same "asset_key" across multiple moments in the chapter if the same sound repeats.
"""


def _normalize_asset_key(raw: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "_", (raw or "").strip().lower()).strip("_")
    return clean[:48] or "sfx_asset"


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
        propose_missing_assets: bool = True,
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
        if not sfx_items and not propose_missing_assets:
            return {
                "project_id": project_id,
                "dry_run": dry_run,
                "chapters_processed": 0,
                "applied_foley_count": 0,
                "applied_atmosphere_segments": 0,
                "proposed_assets": [],
                "matched_assets": [],
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
        proposed_assets_by_key: dict[str, dict[str, Any]] = {}
        matched_assets_by_id: dict[str, dict[str, Any]] = {}
        applied_foley = 0
        applied_atmo_segs = 0
        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
            "reasoning_tokens": 0,
        }

        chunk_size = 120
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
            chapter_foley: list[dict[str, Any]] = []
            chapter_atmo: list[dict[str, Any]] = []

            for offset in range(0, len(segs), chunk_size):
                chunk_segs = segs[offset : offset + chunk_size]
                seg_payload = [
                    {
                        "segment_id": s.id,
                        "order_index": s.order_index,
                        "delivery_type": s.delivery_type,
                        "text": s.text[:350],
                    }
                    for s in chunk_segs
                ]

                plan_obj, usage = await StructuredLLMClient.complete_json(
                    system_prompt=SFX_CUEING_SYSTEM_PROMPT,
                    user_payload={
                        "chapter_number": ch.chapter_number,
                        "chapter_title": ch.title,
                        "propose_missing_assets": propose_missing_assets,
                        "include_foley": include_foley,
                        "include_atmosphere": include_atmosphere,
                        "sfx_catalog": catalog_payload,
                        "already_proposed_keys": list(proposed_assets_by_key.keys()),
                        "segments": seg_payload,
                    },
                    response_model=LLMChapterSfxPlan,
                    temperature=0.1,
                )
                for k in total_usage:
                    total_usage[k] += usage.get(k, 0)

                # Register / deduplicate proposed assets
                chunk_proposed_keys: set[str] = set()
                if propose_missing_assets:
                    for pa in plan_obj.proposed_assets:
                        if pa.category == "foley" and not include_foley:
                            continue
                        if pa.category == "atmosphere" and not include_atmosphere:
                            continue
                        akey = _normalize_asset_key(pa.asset_key or pa.name)
                        chunk_proposed_keys.add(akey)
                        if akey not in proposed_assets_by_key:
                            default_dur = 20.0 if pa.category == "atmosphere" else 2.5
                            dur = float(pa.duration_seconds or default_dur)
                            dur = max(1.0, min(30.0, dur))
                            proposed_assets_by_key[akey] = {
                                "asset_key": akey,
                                "name": pa.name.strip() or akey.replace("_", " ").title(),
                                "category": pa.category,
                                "prompt": pa.prompt.strip(),
                                "duration_seconds": dur,
                                "triggers": [t.strip() for t in pa.triggers if t and t.strip()],
                                "default_volume": float(
                                    pa.default_volume
                                    if pa.default_volume is not None
                                    else (0.2 if pa.category == "atmosphere" else 0.85)
                                ),
                                "usage_count": 0,
                            }

                if include_foley:
                    for fc in plan_obj.foley_cues:
                        seg = seg_by_id.get(fc.segment_id)
                        if not seg:
                            continue

                        sfx = sfx_by_id.get(fc.sfx_id) if fc.sfx_id else None
                        akey = _normalize_asset_key(fc.asset_key) if fc.asset_key else None
                        proposed = (
                            proposed_assets_by_key.get(akey)
                            if (not sfx and propose_missing_assets and akey)
                            else None
                        )

                        if sfx and sfx.category != "foley":
                            continue
                        if proposed and proposed["category"] != "foley":
                            continue
                        if not sfx and not proposed:
                            continue

                        action = fc.action if fc.action in ("replace", "alongside", "after") else "replace"
                        cue_entry = {
                            "segment_id": seg.id,
                            "order_index": seg.order_index,
                            "speaker": seg.speaker,
                            "segment_text": seg.text,
                            "sfx_id": sfx.id if sfx else None,
                            "asset_key": proposed["asset_key"] if proposed else None,
                            "sfx_name": sfx.name if sfx else proposed["name"],
                            "is_new_asset": sfx is None,
                            "target_text": (fc.target_text or "").strip() or seg.text[:80],
                            "action": action,
                            "volume": float(fc.volume),
                            "reason": fc.reason,
                        }
                        chapter_foley.append(cue_entry)

                        if sfx:
                            if sfx.id not in matched_assets_by_id:
                                matched_assets_by_id[sfx.id] = {
                                    "sfx_id": sfx.id,
                                    "name": sfx.name,
                                    "category": sfx.category,
                                    "audio_url": SFXService.get_presigned_url(sfx.audio_storage_key) or "",
                                    "default_volume": sfx.default_volume,
                                    "usage_count": 0,
                                }
                            matched_assets_by_id[sfx.id]["usage_count"] += 1
                        elif proposed:
                            proposed["usage_count"] += 1

                        if not dry_run and sfx:
                            existing = [c for c in (seg.sfx_cues or []) if c.get("sfx_id") != sfx.id]
                            existing.append(
                                {
                                    "id": str(uuid.uuid4()),
                                    "sfx_id": sfx.id,
                                    "sfx_name": sfx.name,
                                    "audio_url": SFXService.get_presigned_url(sfx.audio_storage_key) or "",
                                    "target_text": cue_entry["target_text"],
                                    "action": action,
                                    "volume": float(fc.volume),
                                }
                            )
                            seg.sfx_cues = existing
                            seg.updated_at = datetime.now(UTC)
                            applied_foley += 1

                if include_atmosphere:
                    for span in plan_obj.atmosphere_spans:
                        sfx = sfx_by_id.get(span.sfx_id) if span.sfx_id else None
                        akey = _normalize_asset_key(span.asset_key) if span.asset_key else None
                        proposed = (
                            proposed_assets_by_key.get(akey)
                            if (not sfx and propose_missing_assets and akey)
                            else None
                        )
                        if sfx and sfx.category != "atmosphere":
                            continue
                        if proposed and proposed["category"] != "atmosphere":
                            continue
                        if not sfx and not proposed:
                            continue

                        i_start = seg_idx_by_id.get(span.start_segment_id)
                        i_end = seg_idx_by_id.get(span.end_segment_id)
                        if i_start is None or i_end is None or i_end < i_start:
                            continue
                        span_segs = segs[i_start : i_end + 1]
                        chapter_atmo.append(
                            {
                                "start_segment_id": span.start_segment_id,
                                "end_segment_id": span.end_segment_id,
                                "start_order_index": span_segs[0].order_index,
                                "end_order_index": span_segs[-1].order_index,
                                "segment_ids": [s.id for s in span_segs],
                                "segment_count": len(span_segs),
                                "sfx_id": sfx.id if sfx else None,
                                "asset_key": proposed["asset_key"] if proposed else None,
                                "sfx_name": sfx.name if sfx else proposed["name"],
                                "is_new_asset": sfx is None,
                                "volume": float(span.volume),
                                "reason": span.reason,
                            }
                        )
                        if sfx:
                            if sfx.id not in matched_assets_by_id:
                                matched_assets_by_id[sfx.id] = {
                                    "sfx_id": sfx.id,
                                    "name": sfx.name,
                                    "category": sfx.category,
                                    "audio_url": SFXService.get_presigned_url(sfx.audio_storage_key) or "",
                                    "default_volume": sfx.default_volume,
                                    "usage_count": 0,
                                }
                            matched_assets_by_id[sfx.id]["usage_count"] += 1
                        elif proposed:
                            proposed["usage_count"] += 1

                        if not dry_run and sfx:
                            for seg in span_segs:
                                seg.atmosphere_id = sfx.id
                                seg.atmosphere_name = sfx.name
                                seg.atmosphere_volume = float(span.volume)
                                seg.updated_at = datetime.now(UTC)
                                applied_atmo_segs += 1

            plans.append(
                {
                    "chapter_id": ch.id,
                    "chapter_number": ch.chapter_number,
                    "chapter_title": ch.title,
                    "foley_cues": chapter_foley,
                    "atmosphere_spans": chapter_atmo,
                }
            )

        if not dry_run:
            await db.commit()

        # Keep only proposed assets actually referenced by at least 1 cue or span
        used_proposed = [a for a in proposed_assets_by_key.values() if a["usage_count"] > 0]
        matched_list = list(matched_assets_by_id.values())

        return {
            "project_id": project_id,
            "dry_run": dry_run,
            "chapters_processed": len(plans),
            "applied_foley_count": applied_foley,
            "applied_atmosphere_segments": applied_atmo_segs,
            "proposed_assets": used_proposed,
            "matched_assets": matched_list,
            "plans": plans,
            "usage": total_usage,
            "message": (
                f"Scanned {len(plans)} chapter(s): {len(matched_list)} library match(es), "
                f"{len(used_proposed)} new AI sound(s) proposed"
                if dry_run
                else f"Applied {applied_foley} foley cue(s) and {applied_atmo_segs} atmosphere segment(s)"
            ),
        }
