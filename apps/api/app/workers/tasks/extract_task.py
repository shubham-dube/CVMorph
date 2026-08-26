"""
extract_task — Celery task: document_id → CandidateProfile.

Pipeline step: parsed → extracting → ready_for_review (or failed).

Epic 3.6 implementation.
"""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="app.workers.tasks.extract_task.run", max_retries=1, default_retry_delay=30)
def run(self, document_id: str, org_id: str) -> dict:
    """
    Run AI extraction on a parsed document.

    Args:
        document_id: UUID of the Document row (must have parse_status = "parsed").
        org_id: Org context.

    Returns:
        {"profile_id": ..., "status": "ready_for_review", "overall_confidence": N}

    Side-effects:
        - Creates/updates CandidateProfile row with profile_json
        - Sets extraction_status = "ready_for_review" (or "failed")
        - On failure after retry: marks status = "failed", stores error
    """
    logger.info("extract_task started for document_id=%s", document_id)

    # TODO (Epic 3.6):
    # 1. Fetch Document row + raw_text (assert org_id, assert parse_status == "parsed")
    # 2. Get candidate_id + extraction_instructions from Document row
    # 3. Call: provider = get_provider(); profile = await provider.extract(raw_text, ...)
    # 4. Call: result = validate(profile); if not result.is_valid → retry or fail
    # 5. Store profile in candidate_profiles row
    # 6. Set extraction_status = "ready_for_review"

    raise NotImplementedError("extract_task not yet implemented (Epic 3.6)")
