"""
extract_task — Celery task: document_id → CandidateProfile stored in DB.

Pipeline step: parsed → extracting → ready_for_review (or failed).

Uses the GeminiProvider (configurable via settings) to run structured AI extraction.
Validates the result before writing to the DB.

Epic 3.6 implementation.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.tasks.extract_task.run",
    bind=True,
    queue="default",
    max_retries=1,       # extraction errors are often transient (rate limits, timeouts)
    default_retry_delay=30,
    acks_late=True,
    track_started=True,
)
def run(self, document_id: str, org_id: str) -> dict:
    """
    Run AI extraction on a parsed document.

    Args:
        document_id: UUID of the Document row (must have parse_status = "parsed").
        org_id: Org context.

    Returns:
        {"profile_id": ..., "status": "ready_for_review", "overall_confidence": N}

    Side-effects:
        - Creates a CandidateProfile row with profile_json
        - Sets documents.parse_status = "extracted"
        - Sets candidate_profiles.extraction_status = "ready_for_review" (or "failed")
    """
    return asyncio.run(_run_async(self, document_id, org_id))


async def _run_async(task, document_id: str, org_id: str) -> dict:
    from sqlalchemy import select

    from app.db.session import get_session_for_org
    from app.models import CandidateProfile as CandidateProfileModel
    from app.models import Document
    from app.schemas.candidate_profile import CandidateProfile
    from app.services.extraction.provider import get_provider
    from app.services.extraction.validator import validate

    logger.info("extract_task started: document=%s org=%s", document_id, org_id)

    # ── Step 1: Fetch Document ────────────────────────────────────────────────
    async with get_session_for_org(org_id) as db:
        result = await db.execute(
            select(Document).where(
                Document.id == document_id,
                Document.org_id == org_id,
            )
        )
        doc: Document | None = result.scalar_one_or_none()

        if not doc:
            logger.error("extract_task: Document %s not found", document_id)
            return {"status": "failed", "error": "Document not found"}

        if not doc.raw_text:
            logger.error(
                "extract_task: Document %s has no raw_text (parse not complete?)", document_id
            )
            return {"status": "failed", "error": "Document has no parsed text"}

        # Snapshot what we need — session closes after this block
        raw_text = doc.raw_text
        candidate_id = doc.candidate_id
        extraction_instructions = doc.extraction_instructions

        # Mark as extracting
        doc.parse_status = "extracting"
        await db.flush()

    try:
        # ── Step 2: Run AI extraction ─────────────────────────────────────────
        provider = get_provider()  # returns GeminiProvider by default
        profile: CandidateProfile = await provider.extract(
            raw_text=raw_text,
            org_id=org_id,
            candidate_id=candidate_id,
            source_document_id=document_id,
            instructions=extraction_instructions,
        )

        # ── Step 3: Validate ──────────────────────────────────────────────────
        validation = validate(profile)
        if not validation.is_valid:
            error_summary = "; ".join(validation.errors[:3])
            raise ValueError(
                f"Extraction validation failed ({len(validation.errors)} error(s)): {error_summary}"
            )

        # ── Step 4: Store profile ─────────────────────────────────────────────
        profile_id = str(uuid.uuid4())

        async with get_session_for_org(org_id) as db:
            profile_row = CandidateProfileModel(
                id=profile_id,
                org_id=org_id,
                candidate_id=candidate_id,
                source_document_id=document_id,
                profile_json=profile.model_dump(mode="json"),
                extraction_status="ready_for_review",
                extraction_model=profile.meta.extraction_model,
                extraction_version=profile.meta.extraction_version,
                overall_confidence=profile.meta.overall_confidence,
            )
            db.add(profile_row)

            # Update the document parse_status
            doc_result = await db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.org_id == org_id,
                )
            )
            doc = doc_result.scalar_one()
            doc.parse_status = "extracted"
            await db.flush()

        logger.info(
            "extract_task done: profile=%s candidate=%s overall_confidence=%.2f",
            profile_id,
            candidate_id,
            profile.meta.overall_confidence,
        )

        return {
            "status": "ready_for_review",
            "entity_type": "profile",
            "entity_id": profile_id,
            "overall_confidence": profile.meta.overall_confidence,
        }

    except Exception as exc:
        logger.exception("extract_task failed: document=%s error=%s", document_id, exc)

        # Write failure status back to DB
        try:
            async with get_session_for_org(org_id) as db:
                doc_result = await db.execute(
                    select(Document).where(
                        Document.id == document_id,
                        Document.org_id == org_id,
                    )
                )
                doc = doc_result.scalar_one_or_none()
                if doc:
                    doc.parse_status = "failed"
                await db.flush()
        except Exception as db_exc:
            logger.error("extract_task: failed to write failure status: %s", db_exc)

        # Celery will retry if max_retries not exceeded
        raise task.retry(exc=exc) if task.request.retries < task.max_retries else exc
