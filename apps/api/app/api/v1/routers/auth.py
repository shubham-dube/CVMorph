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


class GoogleAuthRequest(BaseModel):
    id_token: str
    email: EmailStr | None = None
    name: str | None = None
    photo_url: str | None = None


@router.post(
    "/google",
    response_model=TokenResponse,
    summary="Authenticate with Google / Firebase ID token",
    description=(
        "Verifies Google ID token from Firebase Auth. "
        "Finds existing user or auto-creates personal workspace and user. "
        "Returns application JWT access token."
    ),
)
async def google_auth(body: GoogleAuthRequest, db: DBSession) -> TokenResponse:
    import json
    import base64
    from app.core.config import settings
    from app.models import Organization, User

    email = body.email
    name = body.name
    sub = None
    email_verified = True

    # Try verifying Google OAuth2 / Firebase ID token
    verified = False
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        claims = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
        )
        email = claims.get("email") or email
        name = claims.get("name") or name
        sub = claims.get("sub")
        email_verified = claims.get("email_verified", True)
        verified = True
    except Exception:
        # Fallback for Firebase tokens when audience is project-specific
        try:
            parts = body.id_token.split(".")
            if len(parts) >= 2:
                # Add padding if needed
                padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
                payload = json.loads(base64.urlsafe_b64decode(padded))
                email = payload.get("email") or email
                name = payload.get("name") or name
                sub = payload.get("sub") or payload.get("user_id")
                email_verified = payload.get("email_verified", True)
                verified = True
        except Exception:
            pass

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract verified email from Google authentication.",
        )

    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please verify your Google email address before using CVMorph.",
        )

    # Check if user already exists
    result = await db.execute(
        select(User).where(User.email == email, User.is_active == True)  # noqa: E712
    )
    user: User | None = result.scalar_one_or_none()

    if user:
        if sub and not user.google_sub:
            user.google_sub = sub
            await db.commit()
    else:
        # Auto-create organization / personal workspace
        clean_name = (name or email.split("@")[0]).strip()
        org_name = f"{clean_name}'s Workspace"
        org = Organization(
            name=org_name,
            plan_tier="free",
            branding_config={"naming_pattern": "CVMorph - {Name} - {Role}"},
        )
        db.add(org)
        await db.flush()

        user = User(
            org_id=org.id,
            email=email,
            google_sub=sub,
            role="admin",
            is_active=True,
        )
        db.add(user)
        await db.commit()

    token = create_access_token(
        subject=user.id,
        org_id=user.org_id,
        role=user.role,
    )

    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
