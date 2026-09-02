"""
Pipeline — AI extraction: raw_text → CandidateProfile stored in DB.

Runs inline after run_parse() completes — no task queue needed.

Steps:
  1. Fetch document + mark parse_status = "extracting"
  2. Call AI provider for structured profile extraction
  3. Validate the result
  4. Store CandidateProfile row with extraction_status = "ready_for_review"
  5. Update document.parse_status = "extracted"

Design notes:
  - Each DB mutation is a separate transaction, all within get_session_for_org.
  - set_config is called at the start of every context — PgBouncer-safe.
"""

from __future__ import annotations

import logging
import uuid

from app.db.session import get_session_for_org

logger = logging.getLogger(__name__)


async def run_extract(document_id: str, org_id: str) -> None:
    """
    Run AI extraction on a parsed document.
    Called directly from run_parse() — no task queue needed.
    """
    from sqlalchemy import select

    from app.models import CandidateProfile as CandidateProfileModel, Document
    from app.schemas.candidate_profile import CandidateProfile
    from app.services.extraction.provider import get_provider
    from app.services.extraction.validator import validate

    logger.info("extract: started document=%s org=%s", document_id, org_id)

    # ── Step 1: Fetch document + mark as extracting ────────────────────────────
    async with get_session_for_org(org_id) as db:
        result = await db.execute(
            select(Document).where(
                Document.id == document_id,
                Document.org_id == org_id,
            )
        )
        doc: Document | None = result.scalar_one_or_none()

        if not doc or not doc.raw_text:
            logger.error(
                "extract: Document %s not found or has no raw_text", document_id
            )
            return

        # Snapshot fields before session closes
        raw_text = doc.raw_text
        candidate_id = doc.candidate_id
        extraction_instructions = doc.extraction_instructions

        doc.parse_status = "extracting"
        await db.flush()

    try:
        # ── Step 2: Run AI extraction ─────────────────────────────────────────
        provider = get_provider()
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
                f"Extraction validation failed ({len(validation.errors)} errors): {error_summary}"
            )

        # ── Step 4: Store profile + update document (one transaction) ─────────
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
            "extract: done profile=%s candidate=%s confidence=%.2f",
            profile_id,
            candidate_id,
            profile.meta.overall_confidence,
        )

    except Exception:
        logger.exception("extract: failed document=%s", document_id)
        await _mark_extract_failed(document_id, org_id)


async def _mark_extract_failed(document_id: str, org_id: str) -> None:
    """Mark document as failed — isolated transaction."""
    from sqlalchemy import select
    from app.models import Document

    try:
        async with get_session_for_org(org_id) as db:
            result = await db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.org_id == org_id,
                )
            )
            doc = result.scalar_one_or_none()
            if doc:
                doc.parse_status = "failed"
            await db.flush()
    except Exception:
        logger.exception("extract: also failed to write failure status for %s", document_id)
