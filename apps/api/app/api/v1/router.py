from app.api.v1.endpoints import health, scheduler
from fastapi import APIRouter

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(scheduler.router, prefix="/scheduler", tags=["Scheduler"])
