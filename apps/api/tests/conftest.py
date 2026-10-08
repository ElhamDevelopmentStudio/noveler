import asyncio
from pathlib import Path

import app.models  # noqa: F401
import pytest
from app.db import session as db_session
from app.db.base import Base
from app.db.session import _configure_sqlite_engine, seed_default_user
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DB_PATH = Path(__file__).parent / "novelova_test_suite.db"
TEST_DB_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}"


@pytest.fixture(scope="session", autouse=True)
def isolate_test_database():
    """Ensure test suite runs in an isolated SQLite database and never pollutes dev database."""
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink(missing_ok=True)

    engine = create_async_engine(
        TEST_DB_URL,
        echo=False,
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    _configure_sqlite_engine(engine)
    session_factory = async_sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    db_session._engine = engine
    db_session._session_factory = session_factory

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await seed_default_user()

    asyncio.run(_setup())

    yield

    asyncio.run(engine.dispose())
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink(missing_ok=True)
    # Clean up any leftover wal/shm files
    for extra in (f"{TEST_DB_PATH}-wal", f"{TEST_DB_PATH}-shm"):
        p = Path(extra)
        if p.exists():
            p.unlink(missing_ok=True)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
