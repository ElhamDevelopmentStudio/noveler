from app.api.v1.endpoints import health, items
from fastapi import APIRouter

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(items.router, prefix="/items", tags=["Items"])
