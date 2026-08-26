"""
Templates API

GET    /v1/templates        — list org's active templates
GET    /v1/templates/{id}   — get template details + config
POST   /v1/templates        — create/upload a new template (admin only)
PATCH  /v1/templates/{id}   — update template name/description/config (admin only)
DELETE /v1/templates/{id}   — soft-delete (set is_active = False) (admin only)

Design:
  - Templates are org-scoped. The seeded "Copious Default" template is pre-loaded.
  - The .docx file is stored in object storage; the DB row holds the storage key.
  - config_json drives template-builder UI constraints (P1) and render-time validation.
  - Multiple templates per org are supported in schema from day one (PRD §8, P1 feature).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.deps import AdminUser, CurrentUser, ScopedDB
from app.models import Template
from app.services.storage.object_store import get_object_store

router = APIRouter(prefix="/templates")

ALLOWED_TEMPLATE_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",  # some clients send this for .docx
}


# ── Schemas ───────────────────────────────────────────────────────────────────


class TemplateResponse(BaseModel):
    id: str
    org_id: str
    name: str
    description: str | None
    config_json: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateTemplateRequest(BaseModel):
    name: str
    description: str | None = None
    config_json: dict = {}


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    config_json: dict | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=list[TemplateResponse],
    summary="List templates",
    description="Returns all active templates for the authenticated org.",
)
async def list_templates(
    user: CurrentUser,
    db: ScopedDB,
) -> list[TemplateResponse]:
    result = await db.execute(
        select(Template)
        .where(Template.org_id == user.org_id, Template.is_active == True)  # noqa: E712
        .order_by(Template.created_at.asc())
    )
    templates = result.scalars().all()
    return [TemplateResponse.model_validate(t) for t in templates]


@router.get(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Get template",
)
async def get_template(
    template_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> TemplateResponse:
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.org_id == user.org_id,
            Template.is_active == True,  # noqa: E712
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateResponse.model_validate(template)


@router.post(
    "",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a template (admin only)",
    description=(
        "Upload a .docx template file with optional JSON config metadata. "
        "The .docx file is stored in object storage and the DB row is created. "
        "Admin role required."
    ),
)
async def create_template(
    user: AdminUser,  # admin only
    db: ScopedDB,
    file: UploadFile | None = None,
    name: str = "New Template",
    description: str | None = None,
    config_json: str = "{}",  # JSON string from multipart form
) -> TemplateResponse:
    import json as json_mod

    try:
        config = json_mod.loads(config_json)
    except json_mod.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="config_json must be valid JSON",
        )

    storage_url = None
    if file:
        if file.content_type not in ALLOWED_TEMPLATE_MIMES and not file.filename.endswith(".docx"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only .docx files are accepted as templates.",
            )

        file_bytes = await file.read()
        store = get_object_store()
        import uuid

        key = f"{user.org_id}/templates/{uuid.uuid4()}/{file.filename}"
        storage_url = await store.put(key, file_bytes, content_type=file.content_type or "application/octet-stream")

    template = Template(
        org_id=user.org_id,
        name=name,
        description=description,
        config_json=config,
        docx_storage_url=storage_url,
        created_by=user.user_id,
    )
    db.add(template)
    await db.flush()
    return TemplateResponse.model_validate(template)


@router.patch(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Update template metadata (admin only)",
)
async def update_template(
    template_id: str,
    body: UpdateTemplateRequest,
    user: AdminUser,
    db: ScopedDB,
) -> TemplateResponse:
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.org_id == user.org_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if body.name is not None:
        template.name = body.name
    if body.description is not None:
        template.description = body.description
    if body.config_json is not None:
        template.config_json = body.config_json

    await db.flush()
    return TemplateResponse.model_validate(template)


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate template (admin only)",
    description="Soft-deletes the template by setting is_active = False. Does not delete the .docx file.",
)
async def delete_template(
    template_id: str,
    user: AdminUser,
    db: ScopedDB,
) -> None:
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.org_id == user.org_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    template.is_active = False
    await db.flush()
