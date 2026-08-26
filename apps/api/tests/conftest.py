"""
pytest configuration and shared fixtures.

Uses pytest-asyncio with asyncio_mode="auto" — no need to mark individual
async tests with @pytest.mark.asyncio.

Fixtures:
  event_loop       — single event loop for the whole session (avoids teardown issues)
  db_engine        — async engine connected to the test database
  db_session       — transactional async session (rolls back after each test)
  async_client     — HTTPX AsyncClient with the FastAPI app
  seed_org         — pre-seeded Organization
  seed_admin       — pre-seeded admin User
  admin_token      — JWT for the seed admin
  auth_headers     — {"Authorization": "Bearer <admin_token>"}
"""

from __future__ import annotations

import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models import Base, Organization, User

# ── Test DB URL ───────────────────────────────────────────────────────────────
# Use a separate test DB; create with: createdb cvplatform_test
TEST_DATABASE_URL = settings.DATABASE_URL.replace(
    "/cvplatform", "/cvplatform_test"
)


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for the whole test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Each test gets a fresh transactional session that's rolled back after the test.
    This means tests don't interfere with each other.
    """
    session_factory = async_sessionmaker(
        bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    async with session_factory() as session:
        await session.begin_nested()
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def seed_org(db_session: AsyncSession) -> Organization:
    org = Organization(
        id=str(uuid.uuid4()),
        name="Test Org",
        plan_tier="internal",
        branding_config={},
    )
    db_session.add(org)
    await db_session.flush()
    return org


@pytest_asyncio.fixture
async def seed_admin(db_session: AsyncSession, seed_org: Organization) -> User:
    user = User(
        id=str(uuid.uuid4()),
        org_id=seed_org.id,
        email="testadmin@example.com",
        hashed_password=hash_password("testpass123"),
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
def admin_token(seed_admin: User, seed_org: Organization) -> str:
    return create_access_token(
        subject=seed_admin.id,
        org_id=seed_org.id,
        role=seed_admin.role,
    )


@pytest.fixture
def auth_headers(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession, seed_org: Organization) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTPX client with the FastAPI app. Overrides the DB dependency to use
    the test transactional session so tests don't hit a real DB.
    """
    from app.api.v1.deps import get_scoped_session, get_raw_session

    async def override_scoped():
        await db_session.execute(
            text("SET LOCAL app.current_org_id = :org_id"),
            {"org_id": seed_org.id},
        )
        yield db_session

    async def override_raw():
        yield db_session

    app.dependency_overrides[get_scoped_session] = override_scoped
    app.dependency_overrides[get_raw_session] = override_raw

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()
