from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.scheduler")

scheduler = AsyncIOScheduler(timezone=UTC)


async def sample_heartbeat_job():
    """Background scheduled job executing periodically."""
    logger.info("⚡️ [Scheduler] Heartbeat job executed at %s", datetime.now(UTC).isoformat())


async def sample_cleanup_job():
    """Sample scheduled job to clean up temporary resources."""
    logger.info(
        "🧹 [Scheduler] Periodic maintenance/cleanup executed at %s",
        datetime.now(UTC).isoformat(),
    )


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
