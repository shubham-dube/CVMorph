"""
Jobs API — poll async job status.

GET /v1/jobs/{job_id}

Jobs are Celery tasks. The job_id returned by POST /v1/documents is the
Celery task ID. This endpoint wraps the Celery result backend to provide
a uniform, human-readable status response.

Status mapping:
  Celery PENDING   → "queued"
  Celery STARTED   → depends on entity type (parsing / extracting / rendering)
  Celery SUCCESS   → "parsed" | "ready_for_review" | "complete"
  Celery FAILURE   → "failed"
  Celery RETRY     → "retrying"

NOTE (Phase 2/3 dependency):
  This endpoint requires Phase 2 (parse_task) and Phase 3 (extract_task) to be
  implemented. Until then, it returns the raw Celery state for debugging.
  See docs/integration-guide-phase-2-3.md for the expected task result shape.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/jobs")

# Celery state → our status string
_CELERY_STATE_MAP = {
    "PENDING": "queued",
    "STARTED": "processing",
    "RETRY": "retrying",
    "SUCCESS": "success",
    "FAILURE": "failed",
    "REVOKED": "cancelled",
}


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    entity_type: str | None = None  # "document" | "profile" | "generation"
    entity_id: str | None = None
    error_message: str | None = None
    meta: dict | None = None


@router.get(
    "/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll async job status",
    description=(
        "Returns the current status of an async job (parse, extract, or render). "
        "Poll this endpoint after receiving a `job_id` from POST /v1/documents or "
        "POST /v1/generations.\n\n"
        "**Status values:**\n"
        "- `queued` — task is waiting in the queue\n"
        "- `processing` — task is actively running\n"
        "- `retrying` — task failed and is being retried\n"
        "- `success` — task completed (check entity for result)\n"
        "- `failed` — task failed permanently (see error_message)\n\n"
        "**Polling recommendation:** exponential backoff starting at 1s, max 10s interval."
    ),
)
async def get_job_status(job_id: str) -> JobStatusResponse:
    try:
        from celery.result import AsyncResult
        from app.workers.celery_app import celery_app

        result = AsyncResult(job_id, app=celery_app)
        celery_state = result.state

        mapped_status = _CELERY_STATE_MAP.get(celery_state, celery_state.lower())

        # Extract task-specific metadata from the result if available
        entity_type = None
        entity_id = None
        error_message = None
        meta = None

        if celery_state == "SUCCESS" and result.result:
            task_result = result.result
            if isinstance(task_result, dict):
                entity_type = task_result.get("entity_type")
                entity_id = task_result.get("entity_id")
                # Use the task's own status label if provided (e.g. "parsed", "ready_for_review")
                if "status" in task_result:
                    mapped_status = task_result["status"]

        elif celery_state == "FAILURE":
            error_message = str(result.result) if result.result else "Unknown error"

        elif celery_state == "STARTED" and result.info:
            meta = result.info if isinstance(result.info, dict) else None

        return JobStatusResponse(
            job_id=job_id,
            status=mapped_status,
            entity_type=entity_type,
            entity_id=entity_id,
            error_message=error_message,
            meta=meta,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve job status: {exc}",
        )
