"""
Security utilities — JWT creation/validation, password hashing.

Epic 7 will flesh this out with Google OAuth integration.
This module is the ONLY place that touches secrets / token logic.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
import bcrypt

from app.core.config import settings

# ── Password helpers ──────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ───────────────────────────────────────────────────────────────


def create_access_token(
    subject: str,
    org_id: str,
    role: str,
    extra: dict[str, Any] | None = None,
) -> str:
    """
    Issue a signed JWT.

    Claims:
      sub   — user id (UUID string)
      org   — org_id (UUID string) — used by FastAPI deps + Postgres RLS
      role  — "admin" | "recruiter"
      exp   — expiry timestamp
    """
    now = datetime.now(tz=timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": subject,
        "org": org_id,
        "role": role,
        "iat": now,
        "exp": expire,
        **(extra or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Validate and decode a JWT.

    Raises:
        JWTError: if the token is invalid or expired.
    """
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise
