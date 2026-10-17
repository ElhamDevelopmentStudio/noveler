from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.scheduler")

scheduler = AsyncIOScheduler(timezone=UTC)


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
    """Background scheduled job: polls R2 receipts for in-flight generating chapters and auto-delivers to Telegram."""
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
                .where(ChapterModel.audio_job_status == "generating")
                .options(selectinload(ChapterModel.segments), selectinload(ChapterModel.project))
            )
            in_flight = list((await db.execute(stmt)).scalars().all())
            if not in_flight:
                return

            logger.info("[Scheduler] Checking R2 receipts for %d in-flight chapter(s)...", len(in_flight))
            for chapter in in_flight:
                try:
                    updated = await ChapterService._sync_in_flight_audio(
                        chapter=chapter,
                        project_id=chapter.project_id,
                        db=db,
                    )
                    if updated and chapter.audio_job_status == "complete":
                        logger.info("[Scheduler] Chapter '%s' completed via R2 receipt sync!", chapter.title)
                        # Check user Telegram delivery
                        if chapter.project and chapter.project.owner:
                            user = chapter.project.owner
                            if user.telegram_enabled and user.telegram_bot_token and user.telegram_chat_id:
                                try:
                                    from app.services.telegram import TelegramService
                                    await TelegramService.deliver_chapter_audio(
                                        user=user,
                                        project=chapter.project,
                                        chapter=chapter,
                                    )
                                    logger.info("[Scheduler] Auto-delivered chapter '%s' to Telegram!", chapter.title)
                                except Exception as tel_err:
                                    logger.warning("[Scheduler] Telegram delivery failed for chapter '%s': %s", chapter.title, tel_err)
                except Exception as ch_err:
                    logger.warning("[Scheduler] Error syncing in-flight chapter %s: %s", chapter.id, ch_err)
    except Exception as exc:
        logger.warning("[Scheduler] In-flight Kaggle jobs sync error: %s", exc)


def setup_scheduled_jobs():
    """Register initial scheduled jobs."""
    # Run heartbeat every 60 seconds
    if not scheduler.get_job("system_heartbeat"):
        scheduler.add_job(
            sample_heartbeat_job,
            trigger=IntervalTrigger(seconds=60),
            id="system_heartbeat",
            name="System Health & Keepalive Check",
            replace_existing=True,
        )

    # Run 45-second Kaggle R2 receipt & progress sync
    if not scheduler.get_job("kaggle_receipt_sync"):
        scheduler.add_job(
            sync_in_flight_kaggle_jobs,
            trigger=IntervalTrigger(seconds=45),
            id="kaggle_receipt_sync",
            name="Kaggle R2 Receipt & Progress Sync",
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
