"""
Generations API

POST /v1/generations        — trigger CV generation from an approved profile + template
GET  /v1/generations/{id}   — poll status; returns signed download URL when complete
GET  /v1/generations        — list generations for the org

Pre-conditions enforced before enqueuing the render job:
  1. candidate belongs to the authenticated org
  2. the candidate's active profile has extraction_status = 'approved'
  3. template belongs to the authenticated org and is_active = True

The actual rendering is done by the Celery render_task in the 'rendering' queue.
This endpoint is non-blocking — it enqueues the job and returns immediately.

Poll GET /v1/generations/{id} until status = 'complete', then use output_document_url
to download the generated .docx.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, ScopedDB
from app.models import (
    Candidate,
    CandidateProfile as CandidateProfileModel,
    Generation,
    Template,
)
from app.workers.tasks.render_task import run as render_task_run

router = APIRouter(prefix="/generations")


# ── Schemas ───────────────────────────────────────────────────────────────────


class CreateGenerationRequest(BaseModel):
    candidate_id: str
    template_id: str
    formatting_instructions: str | None = None


class GenerationResponse(BaseModel):
    id: str
    candidate_id: str
    template_id: str
    profile_id: str
    status: str
    formatting_instructions: str | None
    output_document_url: str | None = None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerationListResponse(BaseModel):
    items: list[GenerationResponse]
    total: int
    page: int
    page_size: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=GenerationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger CV generation",
    description=(
        "Triggers rendering of a formatted CV from an approved candidate profile "
        "and a template. Returns immediately — poll GET /v1/generations/{id} for status.\n\n"
        "**Pre-conditions:**\n"
        "- `candidate_id` must belong to your org\n"
        "- The candidate must have an approved profile (see POST .../approve)\n"
        "- `template_id` must belong to your org and be active\n\n"
        "**Generation-time custom instructions (PRD §9.6):**\n"
        "Use `formatting_instructions` for output emphasis/tone guidance. "
        "Examples: 'emphasize AWS experience', 'shorten summary to 3 bullets', 'use British English'. "
        "These cannot introduce new facts."
    ),
)
async def create_generation(
    body: CreateGenerationRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> GenerationResponse:
    # 1. Validate candidate ownership
    candidate_result = await db.execute(
        select(Candidate).where(
            Candidate.id == body.candidate_id,
            Candidate.org_id == user.org_id,
        )
    )
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # 2. Validate profile is approved
    profile_result = await db.execute(
        select(CandidateProfileModel)
        .where(
            CandidateProfileModel.candidate_id == body.candidate_id,
            CandidateProfileModel.org_id == user.org_id,
            CandidateProfileModel.extraction_status == "approved",
        )
        .order_by(CandidateProfileModel.approved_at.desc())
        .limit(1)
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This candidate does not have an approved profile. "
                "Review the extracted profile and approve it before generating a CV."
            ),
        )

    # 3. Validate template
    template_result = await db.execute(
        select(Template).where(
            Template.id == body.template_id,
            Template.org_id == user.org_id,
            Template.is_active == True,  # noqa: E712
        )
    )
    template = template_result.scalar_one_or_none()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not active",
        )

    # 4. Create Generation row
    generation = Generation(
        org_id=user.org_id,
        candidate_id=body.candidate_id,
        template_id=body.template_id,
        profile_id=profile.id,
        status="pending",
        formatting_instructions=body.formatting_instructions,
        triggered_by=user.user_id,
    )
    db.add(generation)
    await db.flush()  # get the id

    # 5. Enqueue render task (non-blocking)
    render_task_run.delay(generation.id, user.org_id)

    return _generation_to_response(generation)


@router.get(
    "",
    response_model=GenerationListResponse,
    summary="List generations",
    description="Returns all generations for the org, newest first.",
)
async def list_generations(
    user: CurrentUser,
    db: ScopedDB,
    candidate_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> GenerationListResponse:
    query = select(Generation).where(Generation.org_id == user.org_id)

    if candidate_id:
        query = query.where(Generation.candidate_id == candidate_id)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        query.order_by(Generation.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    generations = result.scalars().all()

    return GenerationListResponse(
        items=[_generation_to_response(g) for g in generations],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{generation_id}",
    response_model=GenerationResponse,
    summary="Get generation status",
    description=(
        "Poll this endpoint until `status = 'complete'`. "
        "When complete, `output_document_url` contains a time-limited (1h) signed URL "
        "to download the generated .docx file directly from object storage."
    ),
)
async def get_generation(
    generation_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> GenerationResponse:
    result = await db.execute(
        select(Generation).where(
            Generation.id == generation_id,
            Generation.org_id == user.org_id,
        )
    )
    generation = result.scalar_one_or_none()
    if not generation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")

    response = _generation_to_response(generation)

    # Generate a signed download URL if complete
    if generation.status == "complete" and generation.output_document_id:
        # Fetch the output document's storage_url
        from app.models import Document
        from app.services.storage.object_store import get_object_store

        doc_result = await db.execute(
            select(Document).where(
                Document.id == generation.output_document_id,
                Document.org_id == user.org_id,
            )
        )
        doc = doc_result.scalar_one_or_none()
        if doc:
            store = get_object_store()
            response.output_document_url = await store.signed_url(doc.storage_url, expires_in=3600)

    return response


def _generation_to_response(g: Generation) -> GenerationResponse:
    return GenerationResponse(
        id=g.id,
        candidate_id=g.candidate_id,
        template_id=g.template_id,
        profile_id=g.profile_id,
        status=g.status,
        formatting_instructions=g.formatting_instructions,
        error_message=getattr(g, "error_message", None),
        created_at=g.created_at,
        updated_at=g.updated_at,
    )
