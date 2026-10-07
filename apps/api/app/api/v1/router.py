from app.api.v1.endpoints import attachments, auth, health, projects, scheduler
from fastapi import APIRouter

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(scheduler.router, prefix="/scheduler", tags=["Scheduler"])

