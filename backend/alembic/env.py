import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.database import Base
from app.models import *  # noqa: F401, F403 — import all models to register them

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    import os
    db_url = os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
    # Convert asyncpg to psycopg2 for alembic sync operations
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    connectable = async_engine_from_config(
        {"sqlalchemy.url": db_url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


run_migrations_online()
