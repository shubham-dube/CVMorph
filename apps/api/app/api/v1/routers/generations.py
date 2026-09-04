"""
Generations API

POST /v1/generations        — trigger CV generation (approved profile + template)
GET  /v1/generations/{id}   — poll status; returns signed download URLs when complete
GET  /v1/generations        — list generations for the org

Both PDF and DOCX outputs are available on completion.
Generation runs via FastAPI BackgroundTasks (no Celery).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, ScopedDB
from app.models import (
    Candidate,
    CandidateProfile as CandidateProfileModel,
    Generation,
    Template,
)

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
    output_document_url: str | None = None   # DOCX download URL
    output_pdf_url: str | None = None         # PDF view URL (inline)
    output_pdf_download_url: str | None = None # PDF download URL (attachment)
    output_filename: str | None = None       # Clean formatted title
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
        "Generates a formatted CV from an approved candidate profile and a template.\n\n"
        "**Pre-conditions:**\n"
        "- Candidate must belong to your org\n"
        "- Candidate must have an approved profile\n"
        "- Template must belong to your org and be active\n\n"
        "**Output:** Both PDF and DOCX are generated. Poll GET /v1/generations/{id} "
        "until status='complete', then use `output_document_url` (DOCX) and "
        "`output_pdf_url` (PDF) to download."
    ),
)
async def create_generation(
    body: CreateGenerationRequest,
    background_tasks: BackgroundTasks,
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
    if not candidate_result.scalar_one_or_none():
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
                "Review and approve the extracted profile before generating a CV."
            ),
        )

    # 3. Validate template (org template or system template)
    from sqlalchemy import or_
    template_result = await db.execute(
        select(Template).where(
            Template.id == body.template_id,
            or_(Template.org_id == user.org_id, Template.is_system == True),
            Template.is_active == True,  # noqa: E712
        )
    )
    if not template_result.scalar_one_or_none():
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
    # Explicit commit before returning so BackgroundTasks can see the data
    await db.commit()

    # 5. Start render in background (no Celery)
    from app.pipeline.render import run_render
    background_tasks.add_task(run_render, generation.id, user.org_id)

    return _to_response(generation)


@router.get(
    "",
    response_model=GenerationListResponse,
    summary="List generations",
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
    return GenerationListResponse(
        items=[_to_response(g) for g in result.scalars().all()],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{generation_id}",
    response_model=GenerationResponse,
    summary="Get generation status",
    description=(
        "Poll until `status = 'complete'`. On completion:\n"
        "- `output_document_url` — time-limited URL to download the .docx file\n"
        "- `output_pdf_url` — time-limited URL to download the .pdf file"
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

    response = _to_response(generation)

    # Build signed URLs when complete
    if generation.status == "complete":
        from app.models import Document
        from app.services.storage.object_store import get_object_store

        store = get_object_store()

        doc_filename: str | None = None
        # DOCX signed URL (from Document row)
        if generation.output_document_id:
            doc_result = await db.execute(
                select(Document).where(
                    Document.id == generation.output_document_id,
                    Document.org_id == user.org_id,
                )
            )
            doc = doc_result.scalar_one_or_none()
            if doc:
                doc_filename = doc.original_filename
                response.output_document_url = await store.signed_url(
                    doc.storage_url,
                    expires_in=3600,
                    filename=doc.original_filename,
                    disposition="attachment",
                )

        if doc_filename:
            response.output_filename = doc_filename.removesuffix(".docx")
        elif generation.output_pdf_url:
            response.output_filename = generation.output_pdf_url.split("/")[-1].removesuffix(".pdf")

        # PDF signed URLs (stored directly on Generation)
        if generation.output_pdf_url:
            pdf_filename = f"{response.output_filename}.pdf" if response.output_filename else None
            # Inline URL for browser rendering / iframe
            response.output_pdf_url = await store.signed_url(
                generation.output_pdf_url,
                expires_in=3600,
                filename=pdf_filename,
                disposition="inline",
            )
            # Attachment URL for direct download button
            response.output_pdf_download_url = await store.signed_url(
                generation.output_pdf_url,
                expires_in=3600,
                filename=pdf_filename,
                disposition="attachment",
            )

    return response


# ── Helper ────────────────────────────────────────────────────────────────────


def _to_response(g: Generation) -> GenerationResponse:
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
