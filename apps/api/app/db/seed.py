"""Database seeding script."""

import asyncio
from app.db.session import init_db
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.seed")


async def main() -> None:
    logger.info("Starting database tables and user seeding...")
    await init_db()
    logger.info("Database seeding finished successfully.")


if __name__ == "__main__":
    asyncio.run(main())
