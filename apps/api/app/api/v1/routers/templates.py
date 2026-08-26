"""
GET  /v1/templates      — list org's templates
POST /v1/templates      — create/upload a template (P1: full template builder)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.v1.deps import AdminUser, CurrentUser, DBSession

router = APIRouter(prefix="/templates")


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool
    config_json: dict


@router.get("", response_model=list[TemplateResponse])
async def list_templates(db: DBSession, user: CurrentUser) -> list[TemplateResponse]:
    """List all active templates for the authenticated org."""
    # TODO (Epic 5 / Epic 1.2): query templates WHERE org_id = user.org_id AND is_active = true
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 1/5).",
    )


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    db: DBSession,
    user: AdminUser,  # admin only
) -> TemplateResponse:
    """Upload a new .docx template + config JSON. Admin role required."""
    # TODO (P1 Epic — template builder): accept multipart upload, store .docx, create row
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Template builder not yet implemented (P1).",
    )
