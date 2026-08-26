"""
Auth router — login (email/password) and current-user endpoints.

Epic 7.2 — real auth wired to the database.

Routes:
  POST /v1/auth/login  — email + password → JWT access token
  GET  /v1/auth/me     — return the authenticated user's profile

Google OAuth (Epic 7.1) is a frontend concern (NextAuth). The backend simply
validates the resulting token. This router handles the email/password path
(needed for seed admin user + future internal API access).

For Google OAuth via NextAuth, the Next.js server generates a session, then
calls POST /v1/auth/token-exchange with the Google id_token, which we verify
and exchange for our own JWT. That endpoint is a TODO here (Epic 7.1).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DBSession
from app.core.security import create_access_token, verify_password
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request / Response schemas ────────────────────────────────────────────────


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserResponse(BaseModel):
    id: str
    org_id: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
    description=(
        "Validates credentials and returns a signed JWT. "
        "The JWT carries `sub` (user_id), `org` (org_id), and `role` claims. "
        "Pass this token as `Authorization: Bearer <token>` on all subsequent requests."
    ),
)
async def login(body: LoginRequest, db: DBSession) -> TokenResponse:
    # Fetch user — must be from the same org (email is unique per org, not globally)
    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)  # noqa: E712
    )
    user: User | None = result.scalar_one_or_none()

    # Use constant-time comparison to avoid timing attacks even on missing users
    if not user or not user.hashed_password:
        # Still call verify so timing is consistent
        verify_password("dummy", "$2b$12$dummy_hash_to_prevent_timing_attack_xxxxxxxxxx")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.core.config import settings

    token = create_access_token(
        subject=user.id,
        org_id=user.org_id,
        role=user.role,
    )

    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
    description="Returns the authenticated user's profile. Requires a valid Bearer token.",
)
async def get_me(user: CurrentUser, db: DBSession) -> UserResponse:
    result = await db.execute(select(User).where(User.id == user.user_id))
    db_user: User | None = result.scalar_one_or_none()

    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return UserResponse.model_validate(db_user)
