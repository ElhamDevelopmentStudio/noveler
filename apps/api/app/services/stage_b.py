import random
from datetime import UTC, datetime, timedelta

from app.models.production_job import ProductionJobModel
from app.models.project import ProjectModel
from app.schemas.production_job import StageBJobResponse
from novelova_core.exceptions import NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.stage_b")


class StageBService:
    @staticmethod
    def _to_utc(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)

    @staticmethod
    def format_elapsed(started_at: datetime) -> str:
        diff = datetime.now(UTC) - StageBService._to_utc(started_at)
        total_seconds = int(diff.total_seconds())
        if total_seconds < 0:
            total_seconds = 0
        hours = total_seconds // 3600
        mins = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        if hours > 0:
            return f"{hours}h {mins}m"
        return f"{mins}m {secs}s"

    @staticmethod
    def format_started(started_at: datetime) -> str:
        return started_at.strftime("%H:%M:%S")

    @staticmethod
    def format_heartbeat(last_heartbeat_at: datetime) -> str:
        diff = datetime.now(UTC) - StageBService._to_utc(last_heartbeat_at)
        secs = int(diff.total_seconds())
        if secs < 0:
            secs = 0
        time_str = last_heartbeat_at.strftime("%H:%M:%S")
        return f"{time_str} · {secs}s ago"

    @classmethod
    def job_to_response(cls, job: ProductionJobModel) -> StageBJobResponse:
        return StageBJobResponse(
            id=job.id,
            job_code=job.job_code,
            project_id=job.project_id,
            stage=job.stage,
            status=job.status,
            current_operation=job.current_operation,
            current_batch=job.current_batch,
            total_batches=job.total_batches,
            records_processed=job.records_processed,
            total_records=job.total_records,
            progress_percent=job.progress_percent,
            most_recent_step=job.most_recent_step,
            elapsed_display=cls.format_elapsed(job.started_at),
            started_display=cls.format_started(job.started_at),
            heartbeat_display=cls.format_heartbeat(job.last_heartbeat_at),
            started_at=job.started_at,
            last_heartbeat_at=job.last_heartbeat_at,
        )

    @classmethod
    async def get_or_create_stage_b_job(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> StageBJobResponse:
        """Fetch active Stage B job or initialize realistic JOB 126d4001."""
        stmt = (
            select(ProductionJobModel)
            .where(
                ProductionJobModel.project_id == project_id,
                ProductionJobModel.stage == "stage_b",
            )
            .order_by(ProductionJobModel.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            proj_stmt = select(ProjectModel).where(ProjectModel.id == project_id)
            proj = (await db.execute(proj_stmt)).scalar_one_or_none()
            if not proj:
                raise NotFoundError(f"Project with ID '{project_id}' not found")

            now = datetime.now(UTC)
            mock_started = now - timedelta(hours=0, minutes=44, seconds=39)
            mock_heartbeat = now - timedelta(seconds=0)

            job = ProductionJobModel(
                job_code="126d4001",
                project_id=project_id,
                stage="stage_b",
                status="running",
                current_operation="Attributing dialogue line...",
                current_batch=13,
                total_batches=72,
                records_processed=1529,
                total_records=8400,
                progress_percent=18.2,
                most_recent_step="Tagged segment #1528: Jin Sang-Min (dialogue)",
                started_at=mock_started,
                last_heartbeat_at=mock_heartbeat,
            )
            db.add(job)
            await db.commit()

        # Update heartbeat slightly
        job.last_heartbeat_at = datetime.now(UTC)
        await db.commit()

        return cls.job_to_response(job)

    @classmethod
    async def start_stage_b_job(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> StageBJobResponse:
        """Start or resume Stage B attribution job."""
        stmt = (
            select(ProductionJobModel)
            .where(
                ProductionJobModel.project_id == project_id,
                ProductionJobModel.stage == "stage_b",
            )
            .order_by(ProductionJobModel.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            return await cls.get_or_create_stage_b_job(project_id, db)

        job.status = "running"
        job.current_operation = "Attributing dialogue line..."
        job.last_heartbeat_at = datetime.now(UTC)
        await db.commit()
        return cls.job_to_response(job)

    @classmethod
    async def stop_stage_b_job(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> StageBJobResponse:
        """Gracefully stop a running Stage B job."""
        stmt = (
            select(ProductionJobModel)
            .where(
                ProductionJobModel.project_id == project_id,
                ProductionJobModel.stage == "stage_b",
            )
            .order_by(ProductionJobModel.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if not job:
            raise NotFoundError("No active Stage B job found to stop")

        job.status = "stopped"
        job.current_operation = "Job stopped by user"
        job.last_heartbeat_at = datetime.now(UTC)
        await db.commit()

        return cls.job_to_response(job)

    @classmethod
    async def step_stage_b_job(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> StageBJobResponse:
        """Advance Stage B job by 1 batch."""
        stmt = (
            select(ProductionJobModel)
            .where(
                ProductionJobModel.project_id == project_id,
                ProductionJobModel.stage == "stage_b",
            )
            .order_by(ProductionJobModel.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if not job:
            return await cls.get_or_create_stage_b_job(project_id, db)

        if job.current_batch < job.total_batches and job.status == "running":
            job.current_batch += 1
            added_records = random.randint(110, 130)
            job.records_processed = min(
                job.total_records, job.records_processed + added_records
            )
            job.progress_percent = round((job.current_batch / job.total_batches) * 100, 1)
            speakers = ["Jin Sang-Min", "Elder Baek", "Kang Min-ho", "Seo-jin", "Narrator"]
            chosen = random.choice(speakers)
            job.most_recent_step = (
                f"Tagged segment #{job.records_processed}: {chosen} (dialogue)"
            )
            job.last_heartbeat_at = datetime.now(UTC)
            await db.commit()

        return cls.job_to_response(job)
