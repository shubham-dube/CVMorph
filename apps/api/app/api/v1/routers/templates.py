"""
Templates API

GET    /v1/templates        — list org's templates (active by default)
GET    /v1/templates/{id}   — get template details
POST   /v1/templates        — upload a new template (admin only)
PATCH  /v1/templates/{id}   — update template metadata (admin only)
DELETE /v1/templates/{id}   — soft-delete (admin only)

Supports two template types:
  docx  — .docx file using docxtpl Jinja2 placeholders (classic approach)
  latex — .tex.j2 file using Jinja2 with LaTeX-safe delimiters (<< >>, <% %>)

Both types produce PDF + DOCX output via the render pipeline.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.deps import AdminUser, CurrentUser, ScopedDB
from app.models import Template
from app.services.storage.object_store import get_object_store

router = APIRouter(prefix="/templates")

# ── Allowed file types ────────────────────────────────────────────────────────
ALLOWED_DOCX_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def _detect_template_type(filename: str, content_type: str) -> str:
    """Return 'latex' or 'docx' based on filename extension."""
    name = (filename or "").lower()
    if name.endswith(".tex.j2") or name.endswith(".tex"):
        return "latex"
    return "docx"


# ── Schemas ───────────────────────────────────────────────────────────────────


class TemplateResponse(BaseModel):
    id: str
    org_id: str
    name: str
    description: str | None
    config_json: dict
    template_type: str  # "docx" | "latex"
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    config_json: dict | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=list[TemplateResponse],
    summary="List templates",
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
    return [TemplateResponse.model_validate(t) for t in result.scalars().all()]


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
        "Upload a DOCX or LaTeX (.tex.j2) template file.\n\n"
        "**DOCX templates**: Use docxtpl Jinja2 placeholders. "
        "See docs/cv_schema_template_mapping.md for the placeholder reference.\n\n"
        "**LaTeX templates**: Use Jinja2 with LaTeX-safe delimiters: "
        "`<< expression >>`, `<% block %>`, `<# comment #>`. "
        "LaTeX escaping is applied automatically to all profile values."
    ),
)
async def create_template(
    user: AdminUser,
    db: ScopedDB,
    file: UploadFile | None = None,
    name: str = "New Template",
    description: str | None = None,
    config_json: str = "{}",
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
    template_type = "docx"

    if file:
        filename = file.filename or "template"
        template_type = _detect_template_type(filename, file.content_type or "")

        # Validate file type
        if template_type == "docx":
            if (
                file.content_type not in ALLOWED_DOCX_MIMES
                and not filename.lower().endswith(".docx")
            ):
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=(
                        "For DOCX templates, upload a .docx file. "
                        "For LaTeX templates, upload a .tex.j2 file."
                    ),
                )

        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded template file is empty.",
            )

        store = get_object_store()
        key = f"{user.org_id}/templates/{uuid.uuid4()}/{filename}"
        content_type = (
            file.content_type
            or (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                if template_type == "docx"
                else "text/plain"
            )
        )
        storage_url = await store.put(key, file_bytes, content_type=content_type)

    template = Template(
        org_id=user.org_id,
        name=name,
        description=description,
        config_json=config,
        docx_storage_url=storage_url,
        template_type=template_type,
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
