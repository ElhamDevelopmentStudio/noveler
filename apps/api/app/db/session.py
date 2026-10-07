from collections.abc import AsyncGenerator

from app.core.config import settings
from app.db.base import Base
from novelova_core.logging import setup_logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = setup_logger("novelova.db")

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        target_url = settings.async_database_url
        logger.info("Initializing async database engine with target: %s", target_url.split("@")[-1])
        _engine = create_async_engine(
            target_url,
            echo=False,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
            class_=AsyncSession,
        )
    return _session_factory


async def init_db() -> None:
    """Initialize database tables with automatic fallback to SQLite if needed."""
    global _engine, _session_factory

    engine = get_engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully with primary engine")
    except Exception as exc:
        if settings.USE_SQLITE_FALLBACK and not str(engine.url).startswith("sqlite"):
            logger.warning(
                "PostgreSQL connection failed (%s). Falling back to SQLite for offline dev.",
                exc,
            )
            fallback_url = "sqlite+aiosqlite:///./novelova_dev.db"
            _engine = create_async_engine(fallback_url, echo=False)
            _session_factory = async_sessionmaker(
                bind=_engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
                class_=AsyncSession,
            )
            async with _engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("SQLite fallback database initialized successfully")
        else:
            logger.error("Failed to initialize database: %s", exc)
            raise

    # Seed initial items if database is empty
    from app.models.item import ItemModel
    from sqlalchemy import func, select

    factory = get_session_factory()
    async with factory() as session:
        count_res = await session.execute(select(func.count(ItemModel.id)))
        if count_res.scalar_one() == 0:
            session.add_all(
                [
                    ItemModel(
                        id="1",
                        title="Welcome to Novelova",
                        description="Polyglot monorepo with React 19, FastAPI, PostgreSQL.",
                        status="published",
                    ),
                    ItemModel(
                        id="2",
                        title="Async PostgreSQL & Background Jobs",
                        description="Enterprise database setup with SQLAlchemy 2.0 and APScheduler.",
                        status="published",
                    ),
                ]
            )
            await session.commit()
            logger.info("Database seeded with initial items")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
