"""
Template renderer — deterministic, pure function, NO AI calls.

Signature: render(template_path, profile) -> bytes (.docx)

This is intentionally a pure function so it can be:
  - Unit tested with hand-written profile fixtures (no AI needed).
  - Called from render_task.py without any side effects.
  - Reproduced byte-for-byte given the same inputs.

Epic 5.6 implementation.
"""

from __future__ import annotations

import io
import logging
import re
from pathlib import Path
from xml.sax.saxutils import escape as _xml_escape

from docxtpl import DocxTemplate, RichText

from app.schemas.candidate_profile import CandidateProfile

logger = logging.getLogger(__name__)


def render(template_path: str | Path, profile: CandidateProfile) -> bytes:
    """
    Render a CandidateProfile into a .docx file using a docxtpl template.

    Args:
        template_path: Absolute or relative path to the .docx template file.
        profile: Validated, recruiter-approved CandidateProfile.

    Returns:
        Raw .docx bytes ready to stream / store in object storage.

    Raises:
        FileNotFoundError: if template_path does not exist.
        TemplateRenderError: if docxtpl encounters an error during rendering.
    """
    template_path = Path(template_path)
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    tpl = DocxTemplate(str(template_path))

    # Build the context dict — mirrors the template placeholder names exactly.
    context = _build_context(tpl, profile)

    try:
        tpl.render(context)
    except Exception as exc:
        raise TemplateRenderError(f"docxtpl render failed: {exc}") from exc

    buffer = io.BytesIO()
    tpl.save(buffer)
    buffer.seek(0)
    return buffer.read()


def _strip_bold(text: str) -> str:
    """Remove **bold** markdown spans, returning plain text."""
    return re.sub(r"\*\*(.+?)\*\*", r"\1", text or "")


def _to_richtext(tpl: DocxTemplate, text: str | None) -> RichText:
    """
    Convert a markdown-lite string with **bold** spans into a docxtpl RichText object.
    Use this ONLY for fields rendered with {{r variable}} in the template.
    For plain {{ variable }} fields, use xs() instead.
    """
    rt = RichText()
    if not text:
        return rt

    parts = re.split(r"(\*\*.+?\*\*)", text)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            rt.add(part[2:-2], bold=True)
        elif part:
            rt.add(part)
    return rt


def xs(text: str | None) -> str:
    """
    XML-safe plain string. Use for {{ variable }} placeholders in the template.
    Also strips **bold** markdown since we can't bold plain-text placeholders.
    """
    if text is None:
        return ""
    return _xml_escape(_strip_bold(str(text)))


def _build_context(tpl: DocxTemplate, profile: CandidateProfile) -> dict:
    """
    Build the Jinja2 context dict for docxtpl.

    IMPORTANT rules about data types:
      - {{ variable }}   → must be a plain str (use xs())
      - {{r variable }}  → must be a RichText object (use _to_richtext())
      - list fields      → must stay as list[str], never pre-joined to a string
                           (the template uses | join(", ") itself)
    """

    # Career summary bullets — RichText objects (template uses {{r bullet.text }} with 'r' prefix)
    summary_bullets = [
        {
            "text": _to_richtext(tpl, b.text),
            "confidence": b.confidence,
            "source_type": b.source_type.value,
        }
        for b in profile.career_summary.bullets
    ]

    # Technical skills — skills stays as list[str] so template's | join(", ") works
    skill_groups = [
        {
            "category": xs(g.category),
            "skills": [xs(s) for s in g.skills],  # list, NOT pre-joined string
        }
        for g in profile.technical_skills.groups
    ]

    # Education items — plain text strings (template uses {{ item.text }} plain, key is 'items' not 'entries')
    education_items = [
        {
            "text": xs(item.text),
            "type": item.type.value,
        }
        for item in profile.education.items
    ]

    # Employment entries
    employment = []
    for job in profile.employment:
        employment.append(
            {
                "company": xs(job.company),
                "client": xs(job.client) if job.client else None,
                "role": xs(job.role),
                "duration_display": xs(job.duration_display),
                "project_name": xs(job.project_name) if job.project_name else None,
                # technology_used stays as list[str] — template uses | join(", ")
                "technology_used": [xs(t) for t in job.technology_used] if job.technology_used else [],
                "project_description": xs(job.project_description) if job.project_description else None,
                # responsibilities text as plain string — template uses {{ resp.text }}
                "responsibilities": [
                    {"text": xs(r.text)} for r in job.responsibilities
                ],
            }
        )

    return {
        "candidate": {
            "full_name": xs(profile.candidate.full_name),
            "role_title": xs(profile.candidate.role_title),
        },
        "career_summary": {"bullets": summary_bullets},
        "technical_skills": {"groups": skill_groups},
        "education": {
            "has_certifications": profile.education.has_certifications,
            "items": education_items,   # template uses .get("items") not .entries
        },
        "employment": employment,
    }


class TemplateRenderError(Exception):
    """Raised when docxtpl fails to render the template."""
