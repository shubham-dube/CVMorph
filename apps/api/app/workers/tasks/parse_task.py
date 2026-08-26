"""
parse_task — Celery task: document_id → raw_text.

Pipeline step: Document uploaded → parse_task → raw_text stored on Document row.
Job status transitions: queued → parsing → parsed (or failed).

Epic 2.4 implementation.
"""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="app.workers.tasks.parse_task.run", max_retries=2, default_retry_delay=10)
def run(self, document_id: str, org_id: str) -> dict:
    """
    Parse a raw document into clean text.

    Args:
        document_id: UUID of the Document row to process.
        org_id: Org context (for DB session scoping).

    Returns:
        {"document_id": ..., "status": "parsed", "text_length": N}

    Side-effects:
        - Sets documents.parse_status = "parsing" / "parsed" / "failed"
        - Stores raw_text on the documents row
        - On success: enqueues extract_task
    """
    logger.info("parse_task started for document_id=%s", document_id)

    # TODO (Epic 2.4):
    # 1. Fetch Document row from DB (assert org_id matches)
    # 2. Download file from object storage
    # 3. Route to pdf_parser or docx_parser based on mime_type
    # 4. Store extracted raw_text on Document row
    # 5. Enqueue extract_task.run.delay(document_id, org_id)
    # 6. Update parse_status = "parsed"

    raise NotImplementedError("parse_task not yet implemented (Epic 2.4)")
