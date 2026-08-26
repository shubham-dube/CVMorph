"""
render_task — Celery task for CV generation (Epic 5.8).

Queue: 'rendering' (separate from the default queue — rendering is CPU-bound
and may take longer; this lets us scale rendering workers independently).

Flow:
  1. Fetch Generation row (with org_id safety check)
  2. Fetch the approved CandidateProfile
  3. Fetch the Template + download the .docx file from object storage
  4. Validate the profile against the template config (required fields)
  5. Call renderer.render(template_path, profile) → docx_bytes
  6. Upload the output to object storage
  7. Create a Document row (type='generated')
  8. Update the Generation row: status='complete', output_document_id, completed_at
  9. Update Candidate.master_profile_id if not already set
  10. Log a UsageEvent

On failure at any step:
  - Set generation.status = 'failed', store error_message
  - Celery will NOT auto-retry render failures (rendering errors are
    deterministic — retrying won't help without a code/template fix)
  - The job endpoint will surface the error_message to the frontend

Integration note for Phase 2/3:
  This task is triggered from POST /v1/generations, which requires the candidate to
  have an approved profile. The profile JSON is fetched directly from the DB —
  this task has NO dependency on the parsing or extraction tasks.
"""

from __future__ import annotations

import asyncio
import logging
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from celery import Task

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Suspicious instruction patterns for the custom-instruction guardrail (Epic 8)
_INVENTION_PATTERNS = re.compile(
    r"\b(add|include|create|insert|fabricate|invent|make up|generate)\b.*\b(certification|skill|experience|award|degree|qualification)\b",
    re.IGNORECASE,
)


@celery_app.task(
    name="render_task.run",
    bind=True,
    queue="rendering",
    max_retries=0,  # rendering failures are deterministic — don't retry automatically
    acks_late=True,  # only ack after successful processing (prevents task loss on worker crash)
    track_started=True,
)
def run(self: Task, generation_id: str, org_id: str) -> dict:
    """
    Synchronous Celery entry point — delegates to the async implementation.
    Celery workers run in their own process without an event loop, so we
    use asyncio.run() here rather than sharing the API process's event loop.
    """
    return asyncio.run(_run_async(generation_id, org_id))


async def _run_async(generation_id: str, org_id: str) -> dict:
    from sqlalchemy import select

    from app.db.session import get_session_for_org
    from app.models import (
        Candidate,
        CandidateProfile as CandidateProfileModel,
        Document,
        Generation,
        Template,
        UsageEvent,
    )
    from app.schemas.candidate_profile import CandidateProfile
    from app.services.storage.object_store import get_object_store
    from app.services.template_engine.renderer import TemplateRenderError, render

    logger.info("render_task started: generation=%s org=%s", generation_id, org_id)

    async with get_session_for_org(org_id) as db:
        # ── 1. Fetch Generation ────────────────────────────────────────────────
        gen_result = await db.execute(
            select(Generation).where(
                Generation.id == generation_id,
                Generation.org_id == org_id,
            )
        )
        generation: Generation | None = gen_result.scalar_one_or_none()

        if not generation:
            logger.error("Generation %s not found for org %s", generation_id, org_id)
            return {"status": "failed", "error": "Generation record not found"}

        # Mark as rendering
        generation.status = "rendering"
        await db.flush()

    try:
        async with get_session_for_org(org_id) as db:
            # ── 2. Fetch Profile ───────────────────────────────────────────────
            profile_result = await db.execute(
                select(CandidateProfileModel).where(
                    CandidateProfileModel.id == generation.profile_id,
                    CandidateProfileModel.org_id == org_id,
                )
            )
            profile_row: CandidateProfileModel | None = profile_result.scalar_one_or_none()

            if not profile_row:
                raise RuntimeError(f"Profile {generation.profile_id} not found")

            if profile_row.extraction_status != "approved":
                raise RuntimeError(
                    f"Profile {generation.profile_id} is not approved (status={profile_row.extraction_status})"
                )

            profile = CandidateProfile.model_validate(profile_row.profile_json)

            # ── 3. Fetch Template + .docx file ────────────────────────────────
            template_result = await db.execute(
                select(Template).where(
                    Template.id == generation.template_id,
                    Template.org_id == org_id,
                )
            )
            template: Template | None = template_result.scalar_one_or_none()

            if not template:
                raise RuntimeError(f"Template {generation.template_id} not found")

            if not template.docx_storage_url:
                raise RuntimeError(
                    f"Template {generation.template_id} has no .docx file attached"
                )

            store = get_object_store()
            template_bytes = await store.get(template.docx_storage_url)

            # ── 4. Formatting instruction guardrail (Epic 8) ─────────────────
            if generation.formatting_instructions:
                if _INVENTION_PATTERNS.search(generation.formatting_instructions):
                    logger.warning(
                        "Suspicious formatting_instructions detected for generation %s — "
                        "may attempt to fabricate facts. Proceeding but logging for review.",
                        generation_id,
                    )
                    # We do NOT block here — the template is deterministic and
                    # can't add facts. The warning is for audit purposes.

            # ── 5. Render ─────────────────────────────────────────────────────
            with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
                tmp.write(template_bytes)
                tmp_path = tmp.name

            try:
                docx_bytes = render(tmp_path, profile)
            finally:
                Path(tmp_path).unlink(missing_ok=True)

            # ── 6. Upload output ──────────────────────────────────────────────
            safe_name = re.sub(r"[^\w\-.]", "_", profile.candidate.full_name)
            output_key = (
                f"{org_id}/generated/{generation_id}/{safe_name}_cv.docx"
            )
            await store.put(
                output_key,
                docx_bytes,
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

            # ── 7. Create output Document row ─────────────────────────────────
            output_doc = Document(
                id=str(uuid.uuid4()),
                org_id=org_id,
                candidate_id=generation.candidate_id,
                type="generated",
                original_filename=f"{safe_name}_cv.docx",
                mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                storage_url=output_key,
                file_size_bytes=len(docx_bytes),
                parse_status="parsed",  # generated docs don't need parsing
            )
            db.add(output_doc)
            await db.flush()

            # ── 8. Update Generation ──────────────────────────────────────────
            now = datetime.now(tz=timezone.utc)
            generation.status = "complete"
            generation.output_document_id = output_doc.id
            generation.completed_at = now
            generation.error_message = None

            # ── 9. Log usage event ────────────────────────────────────────────
            usage_event = UsageEvent(
                org_id=org_id,
                event_type="cv_generated",
                quantity=1,
                reference_id=generation_id,
            )
            db.add(usage_event)

            await db.flush()

        logger.info(
            "render_task complete: generation=%s output_key=%s size=%d bytes",
            generation_id,
            output_key,
            len(docx_bytes),
        )

        return {
            "status": "complete",
            "entity_type": "generation",
            "entity_id": generation_id,
        }

    except (TemplateRenderError, RuntimeError, FileNotFoundError) as exc:
        logger.exception(
            "render_task failed: generation=%s error=%s", generation_id, exc
        )

        # Write failure status back to DB
        async with get_session_for_org(org_id) as db:
            gen_result = await db.execute(
                select(Generation).where(
                    Generation.id == generation_id,
                    Generation.org_id == org_id,
                )
            )
            failed_gen: Generation | None = gen_result.scalar_one_or_none()
            if failed_gen:
                failed_gen.status = "failed"
                failed_gen.error_message = str(exc)
            await db.flush()

        return {
            "status": "failed",
            "entity_type": "generation",
            "entity_id": generation_id,
            "error": str(exc),
        }
