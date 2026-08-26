"""
parse_task — Celery task: document_id → raw_text.

Pipeline step: Document uploaded → parse_task → raw_text stored on Document row.
Job status transitions: queued → parsing → parsed (or failed).

On success, automatically enqueues extract_task.

Epic 2.4 implementation.
"""

from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.tasks.parse_task.run",
    bind=True,
    queue="default",
    max_retries=2,
    default_retry_delay=10,
    acks_late=True,
    track_started=True,
)
def run(self, document_id: str, org_id: str) -> dict:
    """
    Parse a raw document into clean text.

    Args:
        document_id: UUID of the Document row to process.
        org_id: Org context (for DB session scoping + RLS).

    Returns:
        {"document_id": ..., "status": "parsed", "text_length": N}

    Side-effects:
        - Sets documents.parse_status = "parsing" / "parsed" / "failed"
        - Stores raw_text on the documents row
        - On success: enqueues extract_task
    """
    return asyncio.run(_run_async(self, document_id, org_id))


async def _run_async(task, document_id: str, org_id: str) -> dict:
    from sqlalchemy import select

    from app.db.session import get_session_for_org
    from app.models import Document
    from app.services.parsing import docx_parser, pdf_parser
    from app.services.parsing.text_extractor import ParseError
    from app.services.storage.object_store import get_object_store

    logger.info("parse_task started: document=%s org=%s", document_id, org_id)

    # ── Step 1: Fetch Document + mark as parsing ───────────────────────────────
    async with get_session_for_org(org_id) as db:
        result = await db.execute(
            select(Document).where(
                Document.id == document_id,
                Document.org_id == org_id,
            )
        )
        doc: Document | None = result.scalar_one_or_none()

        if not doc:
            logger.error("Document %s not found for org %s", document_id, org_id)
            return {"status": "failed", "error": "Document not found"}

        doc.parse_status = "parsing"
        await db.flush()

    try:
        # ── Step 2: Download from object storage ──────────────────────────────
        store = get_object_store()
        file_bytes = await store.get(doc.storage_url)

        # ── Step 3: Route to correct parser ──────────────────────────────────
        mime = doc.mime_type or ""
        filename = doc.original_filename or "file"

        if "pdf" in mime:
            try:
                raw_text = pdf_parser.extract_text(file_bytes)
            except pdf_parser.ParseError as exc:
                raise ParseError(str(exc)) from exc
        elif "wordprocessingml" in mime or filename.endswith(".docx"):
            try:
                raw_text = docx_parser.extract_text(file_bytes)
            except docx_parser.ParseError as exc:
                raise ParseError(str(exc)) from exc
        else:
            raise ParseError(
                f"Unsupported MIME type: {mime!r}. Only PDF and DOCX are supported."
            )

        # ── Step 4: Guard against scanned / image-only files ──────────────────
        if not raw_text or len(raw_text.strip()) < 50:
            raise ParseError(
                "No readable text found in this file. "
                "If it is a scanned PDF, OCR support is coming soon. "
                "Please upload a text-based PDF or DOCX."
            )

        # ── Step 5: Store raw_text + update status ────────────────────────────
        async with get_session_for_org(org_id) as db:
            result = await db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.org_id == org_id,
                )
            )
            doc = result.scalar_one()
            doc.raw_text = raw_text
            doc.parse_status = "parsed"
            await db.flush()

        # ── Step 6: Enqueue extract_task ──────────────────────────────────────
        from app.workers.tasks.extract_task import run as extract_run
        extract_run.delay(document_id, org_id)

        logger.info(
            "parse_task done: document=%s text_length=%d, extract_task enqueued",
            document_id,
            len(raw_text),
        )
        return {
            "status": "parsed",
            "entity_type": "document",
            "entity_id": document_id,
            "text_length": len(raw_text),
        }

    except ParseError as exc:
        logger.error("parse_task failed: document=%s error=%s", document_id, exc)
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
                doc.raw_text = None
            await db.flush()

        return {"status": "failed", "error": str(exc)}

    except Exception as exc:
        logger.exception("parse_task unexpected error: document=%s", document_id)
        # Re-raise so Celery handles retry
        try:
            raise task.retry(exc=exc)
        except Exception:
            # Max retries exceeded — mark as failed
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
            raise
