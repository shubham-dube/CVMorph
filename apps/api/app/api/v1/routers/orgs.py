"""
Orgs API — organisation-level endpoints.

GET /v1/orgs/me              — get the authenticated user's org details
GET /v1/orgs/me/usage        — usage metrics for the org (CVs processed, generated, etc.)
PATCH /v1/orgs/me/branding   — update branding config (admin only)

Note: In a full multi-tenant SaaS, this would be /v1/orgs/{id}/...
For MVP (single org), /me is cleaner — the org is always derived from the JWT.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.v1.deps import AdminUser, CurrentUser, ScopedDB
from app.models import Organization, UsageEvent

router = APIRouter(prefix="/orgs")


# ── Schemas ───────────────────────────────────────────────────────────────────


class OrgResponse(BaseModel):
    id: str
    name: str
    plan_tier: str
    branding_config: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummaryResponse(BaseModel):
    org_id: str
    period: str  # "all_time" | "this_month"
    total_cvs_uploaded: int
    total_cvs_generated: int
    total_api_calls: int


class BrandingUpdateRequest(BaseModel):
    naming_pattern: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    font: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=OrgResponse,
    summary="Get current organisation",
    description="Returns the organisation that the authenticated user belongs to.",
)
async def get_my_org(user: CurrentUser, db: ScopedDB) -> OrgResponse:
    result = await db.execute(
        select(Organization).where(Organization.id == user.org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    return OrgResponse.model_validate(org)


class OrgUpdateRequest(BaseModel):
    name: str | None = None
    naming_pattern: str | None = None


@router.patch(
    "/me",
    response_model=OrgResponse,
    summary="Update current organisation / workspace details",
    description="Update organization name or global configurations.",
)
async def update_my_org(
    body: OrgUpdateRequest,
    user: AdminUser,
    db: ScopedDB,
) -> OrgResponse:
    result = await db.execute(
        select(Organization).where(Organization.id == user.org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    if body.name is not None and body.name.strip():
        org.name = body.name.strip()

    if body.naming_pattern is not None:
        cfg = dict(org.branding_config or {})
        cfg["naming_pattern"] = body.naming_pattern
        org.branding_config = cfg

    await db.commit()
    return OrgResponse.model_validate(org)


@router.get(
    "/me/usage",
    response_model=UsageSummaryResponse,
    summary="Get usage metrics",
    description=(
        "Returns usage metrics for the authenticated org. "
        "Use `period=this_month` to filter to the current calendar month, "
        "or omit for all-time totals.\n\n"
        "These metrics are the input for future billing (P3) and the internal "
        "analytics dashboard (P1)."
    ),
)
async def get_usage(
    user: CurrentUser,
    db: ScopedDB,
    period: str = "all_time",  # "all_time" | "this_month"
) -> UsageSummaryResponse:
    base_query = select(UsageEvent).where(UsageEvent.org_id == user.org_id)

    if period == "this_month":
        now = datetime.now(tz=timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        base_query = base_query.where(UsageEvent.created_at >= month_start)

    async def _count(event_type: str) -> int:
        result = await db.execute(
            select(func.coalesce(func.sum(UsageEvent.quantity), 0))
            .where(
                UsageEvent.org_id == user.org_id,
                UsageEvent.event_type == event_type,
            )
        )
        return result.scalar_one() or 0

    uploads = await _count("cv_uploaded")
    generated = await _count("cv_generated")
    api_calls = await _count("api_call")

    return UsageSummaryResponse(
        org_id=user.org_id,
        period=period,
        total_cvs_uploaded=uploads,
        total_cvs_generated=generated,
        total_api_calls=api_calls,
    )


@router.patch(
    "/me/branding",
    response_model=OrgResponse,
    summary="Update branding config (admin only)",
    description=(
        "Update the organisation's branding configuration. "
        "This drives the white-labeling feature (P3). "
        "Partial updates are supported — only provided fields are changed."
    ),
)
async def update_branding(
    body: BrandingUpdateRequest,
    user: AdminUser,
    db: ScopedDB,
) -> OrgResponse:
    result = await db.execute(
        select(Organization).where(Organization.id == user.org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    # Merge partial update into existing branding config
    current = dict(org.branding_config or {})
    update = body.model_dump(exclude_none=True)
    current.update(update)
    org.branding_config = current

    await db.commit()
    return OrgResponse.model_validate(org)
