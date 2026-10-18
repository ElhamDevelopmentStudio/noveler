from app.api.v1.endpoints import (
    attachments,
    auth,
    characters,
    health,
    kaggle,
    projects,
    pronunciation,
    scheduler,
    sfx,
    tagging,
    telegram,
    voices,
)
from fastapi import APIRouter

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(telegram.router, prefix="/profile/telegram", tags=["Telegram"])
api_router.include_router(kaggle.router, prefix="/profile/kaggle", tags=["Kaggle"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(characters.router, tags=["Characters"])
api_router.include_router(voices.router, prefix="/voices", tags=["Voices"])
api_router.include_router(sfx.router, prefix="/sfx", tags=["SFX"])
api_router.include_router(pronunciation.router, tags=["Pronunciation"])
api_router.include_router(tagging.router, tags=["Tagging"])
api_router.include_router(scheduler.router, prefix="/scheduler", tags=["Scheduler"])



