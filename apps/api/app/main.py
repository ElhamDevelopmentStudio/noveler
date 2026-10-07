from contextlib import asynccontextmanager

from app.api.v1.router import api_router
from app.core.config import settings
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from novelova_core.exceptions import AppError
from novelova_core.logging import setup_logger
from novelova_core.models import utc_now

logger = setup_logger("novelova.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up %s (v%s)", settings.PROJECT_NAME, settings.VERSION)
    yield
    logger.info("Shutting down %s", settings.PROJECT_NAME)


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


# Exception handler for domain AppErrors
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    logger.warning("Domain error [%s]: %s", exc.code, exc.message)
    status_code = status.HTTP_400_BAD_REQUEST
    if exc.code == "NOT_FOUND":
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.code == "CONFLICT":
        status_code = status.HTTP_409_CONFLICT

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
    }
