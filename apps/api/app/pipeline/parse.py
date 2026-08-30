"""
Pipeline — parse incoming CV document into raw text.

Replaces the Celery parse_task. Runs as a FastAPI BackgroundTask
in the same process as the API server.

Steps:
  1. Mark document.parse_status = "parsing"
  2. Download file from object storage
  3. Extract text (PDF via PyMuPDF, DOCX via python-docx)
  4. Store raw_text, set parse_status = "parsed"
  5. Chain run_extract() as another background step
"""

from __future__ import annotations

import logging

from app.db.session import get_session_for_org

logger = logging.getLogger(__name__)


async def run_parse(document_id: str, org_id: str) -> None:
    """
    Parse a raw document into clean text, then chain AI extraction.
    Called via FastAPI BackgroundTasks — runs in the API process event loop.
    """
    from sqlalchemy import select

    from app.models import Document
    from app.services.parsing import docx_parser, pdf_parser
    from app.services.parsing.text_extractor import ParseError
    from app.services.storage.object_store import get_object_store

    logger.info("parse: started document=%s org=%s", document_id, org_id)

    # ── Step 1: Mark as parsing ───────────────────────────────────────────────
    async with get_session_for_org(org_id) as db:
        result = await db.execute(
            select(Document).where(
                Document.id == document_id,
                Document.org_id == org_id,
            )
        )
        doc: Document | None = result.scalar_one_or_none()
        if not doc:
            logger.error("parse: Document %s not found", document_id)
            return

        doc.parse_status = "parsing"
        await db.flush()

    try:
        # ── Step 2: Download from object storage ──────────────────────────────
        store = get_object_store()
        file_bytes = await store.get(doc.storage_url)

        # ── Step 3: Parse to text ─────────────────────────────────────────────
        mime = doc.mime_type or ""
        filename = doc.original_filename or "file"

        if "pdf" in mime or filename.lower().endswith(".pdf"):
            try:
                raw_text = pdf_parser.extract_text(file_bytes)
            except Exception as exc:
                raise ParseError(str(exc)) from exc
        elif "wordprocessingml" in mime or filename.lower().endswith(".docx"):
            try:
                raw_text = docx_parser.extract_text(file_bytes)
            except Exception as exc:
                raise ParseError(str(exc)) from exc
        else:
            raise ParseError(
                f"Unsupported file type: {mime!r}. Only PDF and DOCX are accepted."
            )

        if not raw_text or len(raw_text.strip()) < 50:
            raise ParseError(
                "No readable text found. If this is a scanned PDF, please upload "
                "a text-based PDF or DOCX instead."
            )

        # ── Step 4: Store raw_text + update status ────────────────────────────
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

        # ── Step 5: Chain extraction ──────────────────────────────────────────
        from app.pipeline.extract import run_extract
        await run_extract(document_id, org_id)

    except ParseError as exc:
        logger.error("parse: failed document=%s error=%s", document_id, exc)
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
        logger.exception("parse: unexpected error document=%s", document_id)
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
            logger.exception("parse: also failed to write failure status")
