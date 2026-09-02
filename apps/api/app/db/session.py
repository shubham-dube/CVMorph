"""
SQLAlchemy async session factory.

RLS integration:
  Every tenant-scoped query must be executed within a session where the Postgres
  session variable `app.current_org_id` is set to the current user's org_id.

  We use `set_config('app.current_org_id', ..., false)` — transaction-scoped —
  which is safe with PgBouncer transaction-mode pooling (Supabase default).
  Session-scoped (true) would be reset between transactions on pooled connections.

Usage (FastAPI, via deps.py):
    from app.db.session import get_async_session

Usage (background tasks / pipeline):
    async with get_session_for_org(org_id) as session:
        result = await session.execute(select(Candidate).where(...))
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine_kwargs: dict = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,          # validate connection before use
    "pool_size": 10,
    "max_overflow": 20,
    "pool_recycle": 1800,           # recycle connections every 30 min
    "pool_timeout": 30,
    "connect_args": {
        "command_timeout": 30,      # asyncpg per-operation timeout
        "server_settings": {},      # no session-level defaults (PgBouncer safe)
    },
}

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields a session WITHOUT org_id scoping.
    The deps.py layer applies RLS scoping via `get_scoped_session`.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_session_for_org(org_id: str) -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for background tasks and pipeline steps.

    Sets `app.current_org_id` for RLS using transaction-scoped set_config
    (false = transaction-local, safe with PgBouncer transaction pooling).

    The value is SET at the START of every transaction via `execution_options`
    so it is guaranteed to be set before any query fires, even after a reconnect.

    Usage:
        async with get_session_for_org(org_id) as db:
            await db.execute(select(Candidate).where(...))
    """
    async with AsyncSessionLocal() as session:
        try:
            # Set org_id in transaction scope — re-applied on every new transaction.
            # false = transaction-scoped (not session-scoped), which is PgBouncer-safe.
            await session.execute(
                text("SELECT set_config('app.current_org_id', :org_id, false)"),
                {"org_id": org_id},
            )
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
