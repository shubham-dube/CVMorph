"""
FastAPI shared dependencies — injected via Depends() on every route.

Usage:
    from app.api.v1.deps import CurrentUser, DBSession, get_current_user

    @router.get("/something")
    async def handler(user: CurrentUser, db: DBSession): ...
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_async_session

bearer_scheme = HTTPBearer()

# ── DB session ─────────────────────────────────────────────────────────────────

DBSession = Annotated[AsyncSession, Depends(get_async_session)]

# ── Auth / current user ───────────────────────────────────────────────────────


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

    Raises HTTP 401 if token is missing/invalid.
    Raises HTTP 403 if token is valid but org is suspended (future — placeholder).
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


def require_admin(user: CurrentUser) -> AuthenticatedUser:
    """Dependency that further restricts a route to admin role only."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user


AdminUser = Annotated[AuthenticatedUser, Depends(require_admin)]
