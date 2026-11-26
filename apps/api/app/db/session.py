from collections.abc import AsyncGenerator
from pathlib import Path

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from novelova_core.logging import setup_logger
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = setup_logger("novelova.db")

API_ROOT = Path(__file__).resolve().parent.parent.parent
SQLITE_DB_PATH = API_ROOT / "novelova_dev.db"

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _configure_sqlite_engine(engine: AsyncEngine) -> None:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        target_url = settings.async_database_url
        logger.info("Initializing async database engine with target: %s", target_url.split("@")[-1])
        connect_args = {}
        engine_kwargs = {
            "echo": False,
            "pool_pre_ping": True,
        }
        if "sqlite" in target_url:
            connect_args = {"check_same_thread": False, "timeout": 30}
        elif "postgresql" in target_url:
            connect_args = {
                "command_timeout": 120,
                "timeout": 60,
                "server_settings": {
                    "application_name": "novelova_api",
                },
            }
            if "pooler" in target_url or "6543" in target_url:
                connect_args["statement_cache_size"] = 0
            engine_kwargs["pool_recycle"] = 300
            engine_kwargs["pool_size"] = 15
            engine_kwargs["max_overflow"] = 10
            engine_kwargs["pool_timeout"] = 30

        _engine = create_async_engine(
            target_url,
            connect_args=connect_args,
            **engine_kwargs,
        )
        if "sqlite" in target_url:
            _configure_sqlite_engine(_engine)
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
            await engine.dispose()
            fallback_url = f"sqlite+aiosqlite:///{SQLITE_DB_PATH.as_posix()}"
            _engine = create_async_engine(
                fallback_url,
                echo=False,
                connect_args={"check_same_thread": False, "timeout": 30},
            )
            _configure_sqlite_engine(_engine)
            _session_factory = async_sessionmaker(
                bind=_engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
                class_=AsyncSession,
            )
            async with _engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("SQLite fallback database initialized successfully at %s", SQLITE_DB_PATH)
        else:
            logger.error("Failed to initialize database: %s", exc)
            raise

    # Ensure newly added optional columns exist on pre-existing dev databases
    for ddl in (
        "ALTER TABLE users ADD COLUMN preferences JSON",
        "ALTER TABLE script_segments ADD COLUMN emotion_profile JSON",
    ):
        try:
            async with get_engine().begin() as conn:
                await conn.execute(text(ddl))
        except Exception:
            # Column already exists
            pass

    # Seed initial user if not already present
    await seed_default_user()


async def seed_default_user() -> None:
    """Ensure configured seeded user exists in database and remove legacy seed accounts."""
    from app.core.security import hash_password
    from app.models.user import UserModel
    from sqlalchemy import delete, select

    factory = get_session_factory()
    async with factory() as session:
        try:
            # Remove legacy admin account if present
            await session.execute(delete(UserModel).where(UserModel.email == "admin@novelova.dev"))

            # Look for configured user
            result = await session.execute(
                select(UserModel).where(UserModel.email == settings.FIRST_USER_EMAIL)
            )
            existing_user = result.scalar_one_or_none()
            if not existing_user:
                admin_user = UserModel(
                    name=settings.FIRST_USER_NAME,
                    email=settings.FIRST_USER_EMAIL,
                    password_hash=hash_password(settings.FIRST_USER_PASSWORD),
                    handle=settings.FIRST_USER_HANDLE,
                    role="admin",
                    social=settings.FIRST_USER_SOCIAL,
                )
                session.add(admin_user)
                logger.info(
                    "Seeded primary user: %s (%s, role: %s)",
                    admin_user.email,
                    admin_user.handle,
                    admin_user.role,
                )
            else:
                if existing_user.role != "admin":
                    existing_user.role = "admin"
                logger.info(
                    "Verified primary admin user exists: %s (%s, role: %s)",
                    existing_user.email,
                    existing_user.handle,
                    existing_user.role,
                )
            await session.commit()
        except Exception as exc:
            await session.rollback()
            logger.warning("Could not seed default user: %s", exc)


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
