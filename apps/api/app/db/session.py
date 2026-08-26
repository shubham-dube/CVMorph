"""
SQLAlchemy async session factory.

RLS integration:
  Every tenant-scoped query must be executed within a session where the Postgres
  session variable `app.current_org_id` is set to the current user's org_id.

  Use `get_async_session_for_org(org_id)` in Celery tasks and background jobs.
  In FastAPI routes, `deps.py` wraps `get_async_session` and sets the variable
  from the JWT claim automatically — never trust the request body for org_id.

Usage (FastAPI, via deps.py):
    from app.db.session import get_async_session

Usage (Celery tasks):
    async with get_session_for_org(org_id) as session:
        result = await session.execute(select(Candidate).where(...))
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    # Ensures connections are returned to pool promptly
    pool_recycle=3600,
)

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
    Context manager for Celery tasks and background jobs.
    Sets `app.current_org_id` for RLS, then commits or rolls back.

    Usage:
        async with get_session_for_org(org_id) as db:
            await db.execute(...)
    """
    async with AsyncSessionLocal() as session:
        try:
            # SET LOCAL is transaction-scoped — safe for pooled connections
            await session.execute(
                text("SET LOCAL app.current_org_id = :org_id"), {"org_id": org_id}
            )
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
