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
from pathlib import Path

from docxtpl import DocxTemplate

from app.schemas.candidate_profile import CandidateProfile
from app.services.template_engine.richtext import to_richtext

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
    # See docs/cv_schema_template_mapping.md §4 for the placeholder reference.
    context = _build_context(tpl, profile)

    try:
        tpl.render(context)
    except Exception as exc:
        raise TemplateRenderError(f"docxtpl render failed: {exc}") from exc

    buffer = io.BytesIO()
    tpl.save(buffer)
    buffer.seek(0)
    return buffer.read()


def _build_context(tpl: DocxTemplate, profile: CandidateProfile) -> dict:
    """
    Build the Jinja2 context dict for docxtpl.

    RichText conversion is applied here to all free-text fields that may contain
    **bold** spans. Simple scalars are passed as strings.
    """

    def rt(text: str | None) -> object:
        """Shorthand: convert to RichText, return empty RichText for None."""
        return to_richtext(text or "")

    # Career summary bullets — convert each to RichText
    summary_bullets = [
        {"text": rt(b.text), "confidence": b.confidence, "source_type": b.source_type.value}
        for b in profile.career_summary.bullets
    ]

    # Technical skills — join skill list for the right column
    skill_groups = [
        {"category": g.category, "skills": ", ".join(g.skills)}
        for g in profile.technical_skills.groups
    ]

    # Education items
    education_items = [
        {"text": rt(item.text), "type": item.type.value}
        for item in profile.education.items
    ]

    # Employment entries — apply RichText to project_description + each responsibility
    employment = []
    for job in profile.employment:
        employment.append(
            {
                "company": job.company,
                "client": job.client,
                "role": job.role,
                "duration_display": job.duration_display,
                "project_name": job.project_name,
                "technology_used": ", ".join(job.technology_used) if job.technology_used else None,
                "project_description": rt(job.project_description) if job.project_description else None,
                "responsibilities": [
                    {"text": rt(r.text)} for r in job.responsibilities
                ],
            }
        )

    return {
        "candidate": {
            "full_name": profile.candidate.full_name,
            "role_title": profile.candidate.role_title,
        },
        "career_summary": {"bullets": summary_bullets},
        "technical_skills": {"groups": skill_groups},
        "education": {
            "has_certifications": profile.education.has_certifications,
            "items": education_items,
        },
        "employment": employment,
    }


class TemplateRenderError(Exception):
    """Raised when docxtpl fails to render the template."""
