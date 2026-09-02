"""
FastAPI shared dependencies — injected via Depends() on every route.

Key design decisions:
  1. `get_current_user` validates the JWT and extracts org_id/role — no DB round-trip.
  2. `get_scoped_session` wraps the DB session with the RLS org_id variable so every
     query in that request is automatically tenant-scoped at the Postgres layer.
  3. `require_admin` is a composable dependency for admin-only routes.

Usage:
    from app.api.v1.deps import CurrentUser, ScopedDB, AdminUser

    @router.get("/something")
    async def handler(user: CurrentUser, db: ScopedDB): ...
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal

bearer_scheme = HTTPBearer(auto_error=True)


# ── Auth / current user ────────────────────────────────────────────────────────


class AuthenticatedUser:
    """Lightweight user context extracted from the JWT — no DB round-trip needed."""

    def __init__(self, user_id: str, org_id: str, role: str) -> None:
        self.user_id = user_id
        self.org_id = org_id
        self.role = role

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    """
    Validate Bearer JWT and return the authenticated user context.

    Raises HTTP 401 if token is missing/invalid/expired.
    """
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    org_id = payload.get("org")
    role = payload.get("role")

    if not user_id or not org_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token claims",
        )

    return AuthenticatedUser(user_id=user_id, org_id=org_id, role=role)


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


# ── Tenant-scoped DB session ───────────────────────────────────────────────────


async def get_scoped_session(
    user: CurrentUser,
) -> AsyncSession:
    """
    Yields a DB session with Postgres `app.current_org_id` set to the
    authenticated user's org_id. This activates the RLS policies defined
    in the initial Alembic migration.

    Defence-in-depth:
      - Application layer: every query includes `.where(Model.org_id == user.org_id)`
      - Database layer: RLS policy prevents cross-org reads even if app filter is missed
    """
    async with AsyncSessionLocal() as session:
        try:
            # false = transaction-scoped (not session-scoped) — safe with PgBouncer
            await session.execute(
                text("SELECT set_config('app.current_org_id', :org_id, false)"),
                {"org_id": user.org_id},
            )
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Raw session (no RLS) — only for auth endpoints where no org_id is known yet
async def get_raw_session():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


ScopedDB = Annotated[AsyncSession, Depends(get_scoped_session)]
DBSession = Annotated[AsyncSession, Depends(get_raw_session)]  # kept for backwards compat


# ── Role enforcement ──────────────────────────────────────────────────────────


def require_admin(user: CurrentUser) -> AuthenticatedUser:
    """Dependency that further restricts a route to admin role only."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for this action",
        )
    return user


AdminUser = Annotated[AuthenticatedUser, Depends(require_admin)]
