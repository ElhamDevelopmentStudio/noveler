import time
from datetime import UTC, datetime

from app.core.config import settings
from fastapi import APIRouter

router = APIRouter()
START_TIME = time.time()


@router.get("/health")
def health_check():
    """Return health check and runtime status information."""
    uptime = round(time.time() - START_TIME, 2)
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "uptimeSeconds": uptime,
        "timestamp": datetime.now(UTC).isoformat(),
    }
