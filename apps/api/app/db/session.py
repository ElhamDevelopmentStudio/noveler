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
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        target_url = settings.async_database_url
        logger.info("Initializing async database engine with target: %s", target_url.split("@")[-1])
        connect_args = {}
        if "sqlite" in target_url:
            connect_args = {"check_same_thread": False, "timeout": 30}
        _engine = create_async_engine(
            target_url,
            echo=False,
            pool_pre_ping=True,
            connect_args=connect_args,
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


_SQLITE_MIGRATION_STATEMENTS = [
    # users
    "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'admin'",
    "ALTER TABLE users ADD COLUMN social VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN avatar_attachment_id VARCHAR(36) DEFAULT NULL",
    # projects
    "ALTER TABLE projects ADD COLUMN settings JSON DEFAULT '{}'",
    # chapters
    "ALTER TABLE chapters ADD COLUMN batch_number INTEGER DEFAULT 1",
    # script_segments
    "ALTER TABLE script_segments ADD COLUMN character_id VARCHAR(36) DEFAULT NULL",
    "ALTER TABLE script_segments ADD COLUMN is_internal_thought BOOLEAN DEFAULT 0",
    "ALTER TABLE script_segments ADD COLUMN delivery_type VARCHAR(30) DEFAULT 'narration'",
    "ALTER TABLE script_segments ADD COLUMN continuation_type VARCHAR(30) DEFAULT 'none'",
    "ALTER TABLE script_segments ADD COLUMN parent_turn_id VARCHAR(36) DEFAULT NULL",
    "ALTER TABLE script_segments ADD COLUMN dialogue_chain_id VARCHAR(36) DEFAULT NULL",
    "ALTER TABLE script_segments ADD COLUMN raw_speaker_tag VARCHAR(100) DEFAULT NULL",
    # characters
    "ALTER TABLE characters ADD COLUMN aliases JSON DEFAULT '[]'",
    "ALTER TABLE characters ADD COLUMN is_general BOOLEAN DEFAULT 0",
    "ALTER TABLE characters ADD COLUMN is_system BOOLEAN DEFAULT 0",
    # pronunciation_rules
    "ALTER TABLE pronunciation_rules ADD COLUMN excluded_segment_ids JSON DEFAULT '[]'",
    "ALTER TABLE pronunciation_rules ADD COLUMN is_active BOOLEAN DEFAULT 1",
    # tagging_jobs
    "ALTER TABLE tagging_jobs ADD COLUMN llm_report JSON DEFAULT NULL",
]

_PG_MIGRATION_STATEMENTS = [
    # users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS social VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_attachment_id VARCHAR(36) DEFAULT NULL",
    # projects
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSON DEFAULT '{}'",
    # chapters
    "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS batch_number INTEGER DEFAULT 1",
    # script_segments
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS character_id VARCHAR(36) DEFAULT NULL",
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS is_internal_thought BOOLEAN DEFAULT FALSE",
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(30) DEFAULT 'narration'",
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS continuation_type VARCHAR(30) DEFAULT 'none'",
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS parent_turn_id VARCHAR(36) DEFAULT NULL",
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS dialogue_chain_id VARCHAR(36) DEFAULT NULL",
    "ALTER TABLE script_segments ADD COLUMN IF NOT EXISTS raw_speaker_tag VARCHAR(100) DEFAULT NULL",
    # characters
    "ALTER TABLE characters ADD COLUMN IF NOT EXISTS aliases JSON DEFAULT '[]'",
    "ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_general BOOLEAN DEFAULT FALSE",
    "ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE",
    # pronunciation_rules
    "ALTER TABLE pronunciation_rules ADD COLUMN IF NOT EXISTS excluded_segment_ids JSON DEFAULT '[]'",
    "ALTER TABLE pronunciation_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
    # tagging_jobs
    "ALTER TABLE tagging_jobs ADD COLUMN IF NOT EXISTS llm_report JSON DEFAULT NULL",
]


async def _run_schema_migrations(engine: AsyncEngine) -> None:
    """Ensure all newly added columns exist on existing database tables (SQLite or PostgreSQL)."""
    is_sqlite = "sqlite" in str(engine.url)
    stmts = _SQLITE_MIGRATION_STATEMENTS if is_sqlite else _PG_MIGRATION_STATEMENTS
    for stmt in stmts:
        try:
            async with engine.connect() as conn:
                await conn.execute(text(stmt))
                await conn.commit()
        except Exception:
            pass


async def init_db() -> None:
    """Initialize database tables with automatic fallback to SQLite if needed."""
    global _engine, _session_factory

    engine = get_engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            await conn.run_sync(Base.metadata.create_all)
        await _run_schema_migrations(engine)
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
            await _run_schema_migrations(_engine)
            logger.info("SQLite fallback database initialized successfully at %s", SQLITE_DB_PATH)
        else:
            logger.error("Failed to initialize database: %s", exc)
            raise

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
                existing_user.name = settings.FIRST_USER_NAME
                existing_user.password_hash = hash_password(settings.FIRST_USER_PASSWORD)
                existing_user.handle = settings.FIRST_USER_HANDLE
                existing_user.social = settings.FIRST_USER_SOCIAL
                existing_user.role = "admin"
                logger.info(
                    "Synchronized primary user: %s (%s, role: %s)",
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
