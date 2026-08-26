"""
render_task — Celery task: generation_id → .docx bytes → stored in object storage.

Pipeline step: approved → rendering → complete (or failed).
Runs in the "rendering" queue (separate from parse/extract).

Epic 5.8 implementation.
"""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="app.workers.tasks.render_task.run",
    queue="rendering",
    max_retries=1,
    default_retry_delay=10,
)
def run(self, generation_id: str, org_id: str) -> dict:
    """
    Render a CandidateProfile into a formatted .docx using the selected template.

    Args:
        generation_id: UUID of the Generation row to process.
        org_id: Org context.

    Returns:
        {"generation_id": ..., "status": "complete", "output_document_id": ...}

    Side-effects:
        - Calls renderer.render(template_path, profile) → docx_bytes
        - Stores .docx in object storage
        - Creates a Document row (type="generated")
        - Updates Generation row: status="complete", output_document_id=...
    """
    logger.info("render_task started for generation_id=%s", generation_id)

    # TODO (Epic 5.8):
    # 1. Fetch Generation row (assert org_id, assert status is not already complete/failed)
    # 2. Fetch associated CandidateProfile + Template
    # 3. Download template .docx from object storage to a temp file
    # 4. profile = CandidateProfile.model_validate(profile_json)
    # 5. docx_bytes = renderer.render(template_path, profile)
    # 6. Upload docx_bytes to object storage
    # 7. Create Document row (type="generated") + update Generation row

    raise NotImplementedError("render_task not yet implemented (Epic 5.8)")
