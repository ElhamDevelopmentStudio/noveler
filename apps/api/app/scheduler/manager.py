import asyncio
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.scheduler")

scheduler = AsyncIOScheduler(timezone=UTC)
_kaggle_sync_lock = asyncio.Lock()


async def sample_heartbeat_job():
    """Background scheduled job executing periodically."""
    logger.info("[Scheduler] Heartbeat job executed at %s", datetime.now(UTC).isoformat())


async def sample_cleanup_job():
    """Sample scheduled job to clean up temporary resources."""
    logger.info(
        "[Scheduler] Periodic maintenance/cleanup executed at %s",
        datetime.now(UTC).isoformat(),
    )


async def sync_in_flight_kaggle_jobs():
    """Background scheduled job: polls R2 receipts for in-flight generating chapters.

    Runs under a single-flight lock with bounded batch size so non-active chapters
    in a multi-chapter Kaggle batch transition cleanly to complete/failed in the DB
    without blocking the event loop.
    """
    if _kaggle_sync_lock.locked():
        return

    async with _kaggle_sync_lock:
        try:
            from app.db.session import get_session_factory
            from app.models.chapter import ChapterModel
            from app.services.chapter import ChapterService
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            factory = get_session_factory()
            async with factory() as db:
                stmt = (
                    select(ChapterModel)
                    .where(ChapterModel.audio_job_status.in_(("generating", "queued")))
                    .options(selectinload(ChapterModel.segments))
                    .limit(10)
                )
                chapters = list((await db.execute(stmt)).scalars().all())
                if not chapters:
                    return

                for chapter in chapters:
                    try:
                        await ChapterService._sync_in_flight_audio(
                            chapter, chapter.project_id, db
                        )
                    except Exception as chapter_err:
                        logger.warning(
                            "[Scheduler] Failed syncing in-flight audio for chapter %s: %s",
                            chapter.id,
                            chapter_err,
                        )
        except Exception as err:
            logger.warning("[Scheduler] sync_in_flight_kaggle_jobs failed: %s", err)


def setup_scheduled_jobs():
    """Register initial scheduled jobs."""
    # Poll R2 receipts for in-flight Kaggle audio chapters every 15 seconds (single-flight)
    if not scheduler.get_job("kaggle_receipt_sync"):
        scheduler.add_job(
            sync_in_flight_kaggle_jobs,
            trigger=IntervalTrigger(seconds=15),
            id="kaggle_receipt_sync",
            name="In-Flight Kaggle Audio Receipt Sync",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

    # Run heartbeat every 60 seconds
    if not scheduler.get_job("system_heartbeat"):
        scheduler.add_job(
            sample_heartbeat_job,
            trigger=IntervalTrigger(seconds=60),
            id="system_heartbeat",
            name="System Health & Keepalive Check",
            replace_existing=True,
        )

    # Run maintenance every 10 minutes
    if not scheduler.get_job("periodic_maintenance"):
        scheduler.add_job(
            sample_cleanup_job,
            trigger=IntervalTrigger(minutes=10),
            id="periodic_maintenance",
            name="Periodic Cache & Maintenance Sweep",
            replace_existing=True,
        )


def start_scheduler():
    """Start the APScheduler background thread."""
    if not scheduler.running:
        setup_scheduled_jobs()
        scheduler.start()
        logger.info("APScheduler background scheduler started successfully")


def shutdown_scheduler():
    """Gracefully shutdown the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler background scheduler shut down")


def get_jobs_list() -> list[dict]:
    """Retrieve list of scheduled jobs with status and next run times."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append(
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
                "is_active": not job.pause if hasattr(job, "pause") else True,
            }
        )
    return jobs
