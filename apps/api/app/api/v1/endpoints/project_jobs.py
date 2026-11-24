import asyncio
import json
from typing import Any

from app.api.deps import get_current_user
from app.db.session import get_db, get_session_factory
from app.models.parse_job import ParseJobModel
from app.models.tagging_job import TaggingJobModel
from app.models.user import UserModel
from app.models.voice_design_job import VoiceDesignJobModel
from app.services.chapter import ChapterService
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from novelova_core.models import ApiResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _serialize_parse_job(job: ParseJobModel | None) -> dict[str, Any] | None:
    if not job:
        return None
    return {
        "id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "progress_percent": job.progress_percent,
        "processed_chapters": job.processed_chapters,
        "total_chapters": job.total_chapters,
        "processed_segments": job.processed_segments,
        "total_segments": job.total_segments,
        "current_step": job.current_step,
        "error_message": job.error_message,
    }


def _serialize_tagging_job(job: TaggingJobModel | None) -> dict[str, Any] | None:
    if not job:
        return None
    return {
        "id": job.id,
        "status": job.status,
        "progress_percent": job.progress_percent,
        "processed_chapters": job.processed_chapters,
        "total_chapters": job.total_chapters,
        "processed_segments": job.processed_segments,
        "total_segments": job.total_segments,
        "current_chapter_title": job.current_chapter_title,
        "current_step": job.current_step,
        "eta_seconds": job.eta_seconds,
        "error_message": job.error_message,
    }


async def _collect_project_jobs_snapshot(
    project_id: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Gather all active/latest project background job statuses in one pass."""
    parse_stmt = (
        select(ParseJobModel)
        .where(ParseJobModel.project_id == project_id, ParseJobModel.job_type == "parse")
        .order_by(ParseJobModel.created_at.desc())
        .limit(1)
    )
    format_stmt = (
        select(ParseJobModel)
        .where(ParseJobModel.project_id == project_id, ParseJobModel.job_type == "format")
        .order_by(ParseJobModel.created_at.desc())
        .limit(1)
    )
    tag_stmt = (
        select(TaggingJobModel)
        .where(TaggingJobModel.project_id == project_id)
        .order_by(TaggingJobModel.created_at.desc())
        .limit(1)
    )
    vd_stmt = (
        select(VoiceDesignJobModel)
        .where(VoiceDesignJobModel.project_id == project_id)
        .order_by(VoiceDesignJobModel.created_at.desc())
        .limit(5)
    )

    parse_job = (await db.execute(parse_stmt)).scalar_one_or_none()
    format_job = (await db.execute(format_stmt)).scalar_one_or_none()
    tagging_job = (await db.execute(tag_stmt)).scalar_one_or_none()
    vd_jobs = list((await db.execute(vd_stmt)).scalars().all())
    batch_audio = await ChapterService.get_batch_audio_status(project_id, db)

    vd_payload = [
        {
            "id": j.id,
            "status": j.status,
            "completed_characters": j.completed_characters,
            "total_characters": j.total_characters,
            "current_step": j.current_step,
            "error_message": j.error_message,
        }
        for j in vd_jobs
    ]

    has_active = bool(
        (parse_job and parse_job.status in ("pending", "running"))
        or (format_job and format_job.status in ("pending", "running"))
        or (tagging_job and tagging_job.status in ("pending", "running"))
        or batch_audio.is_active
        or any(j.status in ("pending", "running") for j in vd_jobs)
    )

    return {
        "project_id": project_id,
        "has_active": has_active,
        "parse_job": _serialize_parse_job(parse_job),
        "format_job": _serialize_parse_job(format_job),
        "tagging_job": _serialize_tagging_job(tagging_job),
        "batch_audio": batch_audio.model_dump(),
        "voice_design_jobs": vd_payload,
    }


@router.get("/projects/{project_id}/jobs/active", response_model=ApiResponse[dict[str, Any]])
async def get_project_active_jobs(
    project_id: str,
    _current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Consolidated single-endpoint status snapshot for all project background jobs."""
    snapshot = await _collect_project_jobs_snapshot(project_id, db)
    return ApiResponse(
        data=snapshot,
        message="Active project jobs retrieved",
    )


@router.get("/projects/{project_id}/jobs/events")
async def stream_project_job_events(
    project_id: str,
    request: Request,
    _current_user: UserModel = Depends(get_current_user),
):
    """SSE stream pushing consolidated project job updates without holding DB connections open."""
    factory = get_session_factory()

    async def event_generator():
        last_serialized: str | None = None
        max_ticks = 120  # Safety cap (~4 min per connection; client reconnects if still active)
        for _ in range(max_ticks):
            if await request.is_disconnected():
                break

            async with factory() as session:
                snapshot = await _collect_project_jobs_snapshot(project_id, session)

            serialized = json.dumps(snapshot, separators=(",", ":"), default=str)
            if serialized != last_serialized:
                last_serialized = serialized
                yield f"data: {serialized}\n\n"
            else:
                yield ": keepalive\n\n"

            if not snapshot["has_active"]:
                break

            await asyncio.sleep(2.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
