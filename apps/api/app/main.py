from contextlib import asynccontextmanager

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.http import close_http_client
from app.db.session import init_db
from app.scheduler.manager import shutdown_scheduler, start_scheduler
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from novelova_core.exceptions import AppError
from novelova_core.logging import setup_logger
from novelova_core.models import utc_now
from starlette.middleware.gzip import GZipMiddleware

logger = setup_logger("novelova.api")


async def _recover_orphaned_jobs() -> None:
    """Mark in-process parse/tagging jobs left in pending/running after a server restart as failed."""
    try:
        from app.db.session import get_session_factory
        from app.models.parse_job import ParseJobModel
        from app.models.tagging_job import TaggingJobModel
        from sqlalchemy import update

        now = utc_now()
        msg = "Server restarted while job was in progress. Please retry."
        factory = get_session_factory()
        async with factory() as db:
            parse_res = await db.execute(
                update(ParseJobModel)
                .where(ParseJobModel.status.in_(("pending", "running")))
                .values(status="failed", error_message=msg, completed_at=now)
            )
            tag_res = await db.execute(
                update(TaggingJobModel)
                .where(TaggingJobModel.status.in_(("pending", "running")))
                .values(status="failed", error_message=msg, completed_at=now)
            )
            await db.commit()
            recovered = (parse_res.rowcount or 0) + (tag_res.rowcount or 0)
            if recovered > 0:
                logger.warning("Recovered %d orphaned in-process job(s) on startup", recovered)
    except Exception as exc:
        logger.warning("Orphaned job recovery sweep skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up %s (v%s)", settings.PROJECT_NAME, settings.VERSION)
    # Initialize database tables
    await init_db()
    # Recover any in-process jobs orphaned by a previous restart
    await _recover_orphaned_jobs()
    # Start background scheduler
    start_scheduler()
    yield
    logger.info("Shutting down %s", settings.PROJECT_NAME)
    shutdown_scheduler()
    await close_http_client()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS setup
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# GZip response compression for payloads >= 1KB (reduces WAN transfer sizes by 75-90%)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Exception handler for domain AppErrors
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    logger.warning("Domain error [%s]: %s", exc.code, exc.message)
    status_code = exc.status_code if exc.status_code is not None else status.HTTP_400_BAD_REQUEST
    if exc.status_code is None:
        if exc.code == "NOT_FOUND":
            status_code = status.HTTP_404_NOT_FOUND
        elif exc.code == "CONFLICT":
            status_code = status.HTTP_409_CONFLICT
        elif exc.code == "UNAUTHORIZED":
            status_code = status.HTTP_401_UNAUTHORIZED
        elif exc.code == "FORBIDDEN":
            status_code = status.HTTP_403_FORBIDDEN

    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            "timestamp": utc_now().isoformat(),
        },
    )


# Include API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": f"{settings.API_V1_STR}/docs",
        "health": f"{settings.API_V1_STR}/health",
        "scheduler": f"{settings.API_V1_STR}/scheduler/jobs",
    }
