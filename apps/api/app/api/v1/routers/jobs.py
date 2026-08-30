"""
Jobs API — poll async job status by document_id.

GET /v1/jobs/{document_id}

Since we no longer use Celery, job_id == document_id.
We derive status from Document.parse_status + CandidateProfile.extraction_status
stored directly in the database.

Status ladder:
  queued        → document uploaded, parse not started
  parsing       → text extraction in progress
  extracting    → AI profile extraction in progress
  ready_for_review → profile created, ready for recruiter review
  failed        → any step failed
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, ScopedDB
from app.models import CandidateProfile as CandidateProfileModel, Document

router = APIRouter(prefix="/jobs")


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    entity_type: str | None = None  # "document" | "profile"
    entity_id: str | None = None
    error_message: str | None = None
    meta: dict | None = None


@router.get(
    "/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll async job status",
    description=(
        "Returns the current status of an async pipeline job. "
        "`job_id` is the `document_id` returned by POST /v1/documents.\n\n"
        "**Status values:**\n"
        "- `queued` — upload complete, parse not yet started\n"
        "- `parsing` — extracting text from the document\n"
        "- `extracting` — AI profile extraction running\n"
        "- `ready_for_review` — profile created, navigate to review page\n"
        "- `failed` — pipeline failed (see error_message)\n\n"
        "**Polling recommendation:** 2s interval, stop on `ready_for_review` or `failed`."
    ),
)
async def get_job_status(
    job_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> JobStatusResponse:
    """
    Derive job status from DB columns — no Celery result backend needed.
    job_id == document_id (set by POST /v1/documents).
    """
    # Fetch the document (scoped to org via RLS + explicit filter)
    doc_result = await db.execute(
        select(Document).where(
            Document.id == job_id,
            Document.org_id == user.org_id,
        )
    )
    doc = doc_result.scalar_one_or_none()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found. Ensure job_id is a valid document_id for your org.",
        )

    parse_status = doc.parse_status

    # Terminal failure
    if parse_status == "failed":
        return JobStatusResponse(
            job_id=job_id,
            status="failed",
            entity_type="document",
            entity_id=job_id,
            error_message="CV parsing failed. Please check the file and try again.",
        )

    # Still queued or actively parsing text
    if parse_status in ("pending", "queued", "parsing"):
        return JobStatusResponse(
            job_id=job_id,
            status=parse_status if parse_status != "pending" else "queued",
            entity_type="document",
            entity_id=job_id,
        )

    # Parse done — check if extraction has completed
    if parse_status in ("parsed", "extracting", "extracted"):
        # Look for a completed profile
        profile_result = await db.execute(
            select(CandidateProfileModel)
            .where(
                CandidateProfileModel.source_document_id == job_id,
                CandidateProfileModel.org_id == user.org_id,
            )
            .order_by(CandidateProfileModel.created_at.desc())
            .limit(1)
        )
        profile = profile_result.scalar_one_or_none()

        if profile and profile.extraction_status == "failed":
            return JobStatusResponse(
                job_id=job_id,
                status="failed",
                entity_type="profile",
                entity_id=profile.id,
                error_message="AI extraction failed. The CV may be too short or in an unsupported format.",
            )

        if profile and profile.extraction_status in ("ready_for_review", "approved"):
            return JobStatusResponse(
                job_id=job_id,
                status="ready_for_review",
                entity_type="profile",
                entity_id=profile.id,
                meta={"overall_confidence": float(profile.overall_confidence or 0)},
            )

        # Profile not yet created or still extracting
        return JobStatusResponse(
            job_id=job_id,
            status="extracting",
            entity_type="document",
            entity_id=job_id,
        )

    # Fallback
    return JobStatusResponse(
        job_id=job_id,
        status=parse_status,
        entity_type="document",
        entity_id=job_id,
    )
