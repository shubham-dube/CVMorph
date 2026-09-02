"""
Pipeline — parse incoming CV document into raw text.

Runs as a FastAPI BackgroundTask in the same process as the API server.

Steps:
  1. Mark document.parse_status = "parsing"
  2. Download file from object storage
  3. Extract text (PDF via PyMuPDF, DOCX via python-docx)
  4. Store raw_text, set parse_status = "parsed"
  5. Chain run_extract() as next async step

Design notes:
  - Each DB mutation is a separate transaction — safe with PgBouncer.
  - set_config is called at the start of every get_session_for_org context.
  - The background task retries the initial DB read a few times in case the
    parent request's transaction hasn't been fully visible yet (replication lag
    or pooler delay on the first millisecond).
"""

from __future__ import annotations

import asyncio
import logging

from app.db.session import get_session_for_org

logger = logging.getLogger(__name__)


async def _fetch_document(document_id: str, org_id: str, *, max_retries: int = 5):
    """
    Fetch a Document row with retries — the background task may start before
    the parent request's transaction is fully committed and visible on the
    connection the background task gets from the pool.
    """
    from sqlalchemy import select
    from app.models import Document

    for attempt in range(max_retries):
        async with get_session_for_org(org_id) as db:
            result = await db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.org_id == org_id,
                )
            )
            doc = result.scalar_one_or_none()
            if doc is not None:
                return doc

        if attempt < max_retries - 1:
            wait = 0.5 * (attempt + 1)  # 0.5s, 1.0s, 1.5s, 2.0s
            logger.warning(
                "parse: Document %s not visible yet (attempt %d/%d), retrying in %.1fs",
                document_id, attempt + 1, max_retries, wait,
            )
            await asyncio.sleep(wait)

    return None


async def run_parse(document_id: str, org_id: str) -> None:
    """
    Parse a raw document into clean text, then chain AI extraction.
    Called via FastAPI BackgroundTasks — runs in the API process event loop.
    """
    from app.models import Document
    from app.services.parsing import docx_parser, pdf_parser
    from app.services.parsing.text_extractor import ParseError
    from app.services.storage.object_store import get_object_store
    from sqlalchemy import select

    logger.info("parse: started document=%s org=%s", document_id, org_id)

    # ── Step 1: Fetch document (with retry for pool/commit visibility lag) ────
    doc = await _fetch_document(document_id, org_id)
    if not doc:
        logger.error(
            "parse: Document %s not found in org %s after retries — aborting",
            document_id, org_id,
        )
        return

    # Snapshot immutable fields before closing the session
    storage_url = doc.storage_url
    mime_type = doc.mime_type or ""
    filename = doc.original_filename or "file"

    # ── Step 2: Mark as parsing (own transaction) ──────────────────────────────
    async with get_session_for_org(org_id) as db:
        result = await db.execute(
            select(Document).where(
                Document.id == document_id,
                Document.org_id == org_id,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            logger.error("parse: Document %s disappeared — aborting", document_id)
            return
        doc.parse_status = "parsing"
        await db.flush()

    try:
        # ── Step 3: Download from object storage ──────────────────────────────
        store = get_object_store()
        file_bytes = await store.get(storage_url)

        # ── Step 4: Parse to text ─────────────────────────────────────────────
        if "pdf" in mime_type or filename.lower().endswith(".pdf"):
            try:
                raw_text = pdf_parser.extract_text(file_bytes)
            except Exception as exc:
                raise ParseError(str(exc)) from exc
        elif "wordprocessingml" in mime_type or filename.lower().endswith(".docx"):
            try:
                raw_text = docx_parser.extract_text(file_bytes)
            except Exception as exc:
                raise ParseError(str(exc)) from exc
        else:
            raise ParseError(
                f"Unsupported file type: {mime_type!r}. Only PDF and DOCX are accepted."
            )

        if not raw_text or len(raw_text.strip()) < 50:
            raise ParseError(
                "No readable text found. If this is a scanned PDF, please upload "
                "a text-based PDF or DOCX instead."
            )

        # ── Step 5: Persist raw_text + mark parsed (own transaction) ──────────
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

        logger.info(
            "parse: done document=%s text_length=%d — chaining extract",
            document_id,
            len(raw_text),
        )

        # ── Step 6: Chain extraction ───────────────────────────────────────────
        from app.pipeline.extract import run_extract
        await run_extract(document_id, org_id)

    except ParseError as exc:
        logger.error("parse: failed document=%s error=%s", document_id, exc)
        await _mark_document_failed(document_id, org_id)

    except Exception:
        logger.exception("parse: unexpected error document=%s", document_id)
        await _mark_document_failed(document_id, org_id)


async def _mark_document_failed(document_id: str, org_id: str) -> None:
    """Mark a document as failed — isolated transaction so it always commits."""
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
                doc.raw_text = None
            await db.flush()
    except Exception:
        logger.exception("parse: also failed to write failure status for %s", document_id)
