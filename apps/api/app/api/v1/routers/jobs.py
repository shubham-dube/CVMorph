"""GET /v1/jobs/{job_id} — poll async job status (parse / extract / render)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.v1.deps import CurrentUser, DBSession

router = APIRouter(prefix="/jobs")


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued | parsing | parsed | extracting | ready_for_review | failed
    entity_type: str  # "document" | "profile" | "generation"
    entity_id: str
    error_message: str | None = None


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    db: DBSession,
    user: CurrentUser,
) -> JobStatusResponse:
    """
    Poll the status of an async pipeline job.

    Clients should poll this after upload (returns parse status) and after profile
    approval (returns render status). Long-term this becomes a WebSocket push, but
    polling is fine for MVP.
    """
    # TODO (Epic 2.5): look up job in Celery / Redis result backend, assert org ownership
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Job status polling not yet implemented (Epic 2).",
    )
