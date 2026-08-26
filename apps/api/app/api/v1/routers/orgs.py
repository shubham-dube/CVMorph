"""GET /v1/orgs/{id}/usage — usage metrics (P2/P3 billing input)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.v1.deps import AdminUser, DBSession

router = APIRouter(prefix="/orgs")


@router.get("/{org_id}/usage")
async def get_org_usage(
    org_id: str,
    db: DBSession,
    user: AdminUser,
) -> dict:
    """Return usage metrics for an org. Admin role required."""
    if org_id != user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's usage data.",
        )
    # TODO (P2/P3): aggregate usage_events by event_type for this org
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Usage metrics not yet implemented (P2).",
    )
