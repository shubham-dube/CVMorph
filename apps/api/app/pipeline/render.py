"""
Pipeline — render: approved CandidateProfile + Template → PDF + DOCX outputs.

Replaces the Celery render_task. Runs as a FastAPI BackgroundTask.

Two rendering paths:
  template_type = "docx"  → docxtpl renders DOCX, then LibreOffice converts → PDF
  template_type = "latex" → Jinja2+xelatex renders PDF, then LibreOffice converts → DOCX

Both outputs are stored in object storage. The Generation row is updated with
both output_document_id (DOCX) and output_pdf_url (PDF).

Steps:
  1. Fetch Generation + Profile + Template from DB
  2. Download template file from object storage
  3. Render primary format (DOCX or PDF)
  4. Convert to secondary format via LibreOffice
  5. Upload both outputs
  6. Create Document row for the DOCX output
  7. Update Generation: status=complete, output_document_id, output_pdf_url
  8. Log UsageEvent
"""

from __future__ import annotations

import logging
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.db.session import get_session_for_org

logger = logging.getLogger(__name__)

_INVENTION_PATTERNS = re.compile(
    r"\b(add|include|create|insert|fabricate|invent|make up|generate)\b.*"
    r"\b(certification|skill|experience|award|degree|qualification)\b",
    re.IGNORECASE,
)


async def run_render(generation_id: str, org_id: str) -> None:
    """
    Render a CV for the given generation_id.
    Produces both PDF and DOCX outputs, stored in object storage.
    """
    import asyncio
    from sqlalchemy import select

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

    logger.info("render: started generation=%s org=%s", generation_id, org_id)

    # ── 1. Fetch Generation with retries (parent transaction may not be committed yet) ──
    generation: Generation | None = None
    for attempt in range(5):
        async with get_session_for_org(org_id) as db:
            gen_result = await db.execute(
                select(Generation).where(
                    Generation.id == generation_id,
                    Generation.org_id == org_id,
                )
            )
            generation = gen_result.scalar_one_or_none()
            if generation is not None:
                generation.status = "rendering"
                await db.flush()
                break

        if attempt < 4:
            await asyncio.sleep(0.5 * (attempt + 1))

    if generation is None:
        logger.error("render: Generation %s not found after retries", generation_id)
        return

    try:
        async with get_session_for_org(org_id) as db:
            # ── 2. Fetch Profile ───────────────────────────────────────────────
            profile_result = await db.execute(
                select(CandidateProfileModel).where(
                    CandidateProfileModel.id == generation.profile_id,
                    CandidateProfileModel.org_id == org_id,
                )
            )
            profile_row = profile_result.scalar_one_or_none()
            if not profile_row:
                raise RuntimeError(f"Profile {generation.profile_id} not found")
            if profile_row.extraction_status != "approved":
                raise RuntimeError(
                    f"Profile {generation.profile_id} is not approved "
                    f"(status={profile_row.extraction_status})"
                )

            profile = CandidateProfile.model_validate(profile_row.profile_json)

            # ── 3. Fetch Template + file ───────────────────────────────────────
            tpl_result = await db.execute(
                select(Template).where(
                    Template.id == generation.template_id,
                    Template.org_id == org_id,
                )
            )
            template: Template | None = tpl_result.scalar_one_or_none()
            if not template:
                raise RuntimeError(f"Template {generation.template_id} not found")
            if not template.docx_storage_url:
                raise RuntimeError(
                    f"Template {generation.template_id} has no file attached"
                )

            store = get_object_store()
            template_bytes = await store.get(template.docx_storage_url)
            template_type = getattr(template, "template_type", "docx") or "docx"

            # ── 4. Formatting instruction safety check ─────────────────────────
            if generation.formatting_instructions and _INVENTION_PATTERNS.search(
                generation.formatting_instructions
            ):
                logger.warning(
                    "render: suspicious formatting_instructions detected for %s",
                    generation_id,
                )

            # ── 5. Render to primary format ────────────────────────────────────
            safe_name = re.sub(r"[^\w\-.]", "_", profile.candidate.full_name)

            with tempfile.TemporaryDirectory() as tmpdir:
                tmpdir_path = Path(tmpdir)

                if template_type == "latex":
                    pdf_bytes, docx_bytes = await _render_latex(
                        template_bytes, profile, tmpdir_path
                    )
                else:
                    # Default: DOCX template
                    pdf_bytes, docx_bytes = await _render_docx(
                        template_bytes, profile, tmpdir_path
                    )

            # ── 6. Upload both outputs ─────────────────────────────────────────
            docx_key = f"{org_id}/generated/{generation_id}/{safe_name}_cv.docx"
            pdf_key = f"{org_id}/generated/{generation_id}/{safe_name}_cv.pdf"

            await store.put(
                docx_key,
                docx_bytes,
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
            await store.put(
                pdf_key,
                pdf_bytes,
                content_type="application/pdf",
            )

            # ── 7. Create Document row (DOCX as canonical output) ──────────────
            output_doc = Document(
                id=str(uuid.uuid4()),
                org_id=org_id,
                candidate_id=generation.candidate_id,
                type="generated",
                original_filename=f"{safe_name}_cv.docx",
                mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                storage_url=docx_key,
                file_size_bytes=len(docx_bytes),
                parse_status="parsed",
            )
            db.add(output_doc)
            await db.flush()

            # ── 8. Update Generation ───────────────────────────────────────────
            now = datetime.now(tz=timezone.utc)
            db.add(generation)
            generation.status = "complete"
            generation.output_document_id = output_doc.id
            generation.output_pdf_url = pdf_key      # stored as object key
            generation.completed_at = now
            generation.error_message = None

            # ── 9. Log usage ───────────────────────────────────────────────────
            db.add(UsageEvent(
                org_id=org_id,
                event_type="cv_generated",
                quantity=1,
                reference_id=generation_id,
            ))

            await db.flush()

        logger.info(
            "render: complete generation=%s docx=%s pdf=%s",
            generation_id, docx_key, pdf_key,
        )

    except Exception as exc:
        logger.exception("render: failed generation=%s error=%s", generation_id, exc)
        try:
            async with get_session_for_org(org_id) as db:
                gen_result = await db.execute(
                    select(Generation).where(
                        Generation.id == generation_id,
                        Generation.org_id == org_id,
                    )
                )
                failed_gen = gen_result.scalar_one_or_none()
                if failed_gen:
                    failed_gen.status = "failed"
                    failed_gen.error_message = str(exc)
                await db.flush()
        except Exception:
            logger.exception("render: also failed to write failure status")


# ── Rendering backends ────────────────────────────────────────────────────────


async def _render_docx(
    template_bytes: bytes,
    profile: "CandidateProfile",
    tmpdir: Path,
) -> tuple[bytes, bytes]:
    """
    DOCX template path:
      template.docx + profile → docxtpl → output.docx → LibreOffice → output.pdf
    Returns (pdf_bytes, docx_bytes).
    """
    from app.services.template_engine.docx_renderer import render as render_docx
    from app.services.template_engine.converter import docx_to_pdf

    tpl_path = tmpdir / "template.docx"
    tpl_path.write_bytes(template_bytes)

    docx_bytes = render_docx(str(tpl_path), profile)

    # Convert DOCX → PDF via LibreOffice
    out_docx = tmpdir / "output.docx"
    out_docx.write_bytes(docx_bytes)
    pdf_bytes = await docx_to_pdf(out_docx, tmpdir)

    return pdf_bytes, docx_bytes


async def _render_latex(
    template_bytes: bytes,
    profile: "CandidateProfile",
    tmpdir: Path,
) -> tuple[bytes, bytes]:
    """
    LaTeX template path:
      template.tex.j2 + profile → Jinja2 → xelatex → output.pdf → LibreOffice → output.docx
    Returns (pdf_bytes, docx_bytes).
    """
    from app.services.template_engine.latex_renderer import render as render_latex
    from app.services.template_engine.converter import pdf_to_docx

    tpl_path = tmpdir / "template.tex.j2"
    tpl_path.write_bytes(template_bytes)

    pdf_bytes = await render_latex(str(tpl_path), profile, tmpdir)

    # Convert PDF → DOCX via LibreOffice
    out_pdf = tmpdir / "output.pdf"
    out_pdf.write_bytes(pdf_bytes)
    docx_bytes = await pdf_to_docx(out_pdf, tmpdir)

    return pdf_bytes, docx_bytes
