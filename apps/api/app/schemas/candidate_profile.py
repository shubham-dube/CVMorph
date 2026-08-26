"""
Canonical Candidate Profile — Pydantic v2 schema.

SOURCE OF TRUTH for:
  - What the AI extraction step (Epic 3) must return.
  - What the recruiter review UI (Epic 4) renders and edits.
  - What the template renderer (Epic 5) receives as input.

Derived directly from:
  docs/cv_schema_template_mapping.md §3

RULES:
  1. Every field that a recruiter can review carries confidence / source_type / evidence.
  2. Optional employment fields (client, project_name, etc.) are ALWAYS present in the
     JSON — set to None or [] when absent, never omitted. This keeps template conditionals
     consistent and the frontend free of hasOwnProperty checks.
  3. **bold** markdown-lite in free-text strings is the only markup allowed — the
     richtext filter in the template engine converts these to docx bold runs.
  4. Never add fields not needed by the current template — see cv_schema_template_mapping.md §5.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


# ── Provenance / trust primitives ─────────────────────────────────────────────


class SourceType(str, Enum):
    """
    How the field's value relates to the original CV text.

    source               — copied / lightly cleaned directly from the original CV.
    verified_transformation — reworded by AI but every fact checked against source text.
    ai_generated         — synthesised (e.g. a summary paragraph with no single 1:1 sentence).
                           Always flagged distinctly in the review UI.
    """

    source = "source"
    verified_transformation = "verified_transformation"
    ai_generated = "ai_generated"


class Provenance(BaseModel):
    """
    Attached to every reviewable text unit (bullets, skill groups, education lines).
    NOT attached to simple scalar identifiers (names, dates) — those are validated
    structurally, not semantically.
    """

    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    source_type: SourceType
    evidence: str | None = Field(
        None,
        description="The verbatim source span from the original CV that this field was derived from. "
        "Null only for ai_generated fields.",
    )


# ── Section models ────────────────────────────────────────────────────────────


class Meta(BaseModel):
    """Extraction metadata — stored alongside the profile for audit and debugging."""

    org_id: str
    candidate_id: str
    source_document_id: str
    extraction_model: str = Field(description="e.g. claude-sonnet-4-5")
    extraction_version: str = Field(description="e.g. v1 — bump on major prompt changes")
    extraction_instructions: str | None = Field(
        None,
        description="Recruiter's extraction-time custom instructions (PRD §9.6), echoed back for audit.",
    )
    overall_confidence: Annotated[float, Field(ge=0.0, le=1.0)]


class Candidate(BaseModel):
    """Cover page + running header fields — only two are strictly needed, rest for completeness."""

    full_name: str
    role_title: str = Field(
        description="Positioning title for the cover page. May differ from most recent job title "
        "per recruiter instruction (PRD §9.6 use-case)."
    )
    email: str | None = None
    phone: str | None = None
    location: str | None = None


class SummaryBullet(Provenance):
    """One bullet in the Career Summary section."""

    text: str = Field(description="May contain **bold** markdown spans.")


class CareerSummary(BaseModel):
    bullets: list[SummaryBullet]


class SkillGroup(Provenance):
    """
    One row in the Technical Skills table.
    category: e.g. "Technical Leadership", "Testing Tools", "Cloud Platforms"
    skills: comma-joined in the template — ["AWS", "GCP", "Azure"]
    """

    category: str
    skills: list[str]


class TechnicalSkills(BaseModel):
    groups: list[SkillGroup]


class EducationType(str, Enum):
    degree = "degree"
    certification = "certification"


class EducationItem(Provenance):
    """
    One bullet in the Education / Education & Certifications section.
    text: full human-readable line, may contain **bold** spans.
    type: drives whether the section heading includes "& Certifications".
    """

    type: EducationType
    text: str


class Education(BaseModel):
    has_certifications: bool = Field(
        description="True if ANY item has type='certification'. "
        "Drives the section heading conditional in the template."
    )
    items: list[EducationItem]


class ResponsibilityBullet(Provenance):
    """One bullet in an Employment entry's Responsibilities list."""

    text: str = Field(description="May contain **bold** markdown spans.")


class EmploymentEntry(BaseModel):
    """
    One entry in the Employment Summary & Projects section.

    Fields marked Optional MUST still be present in the JSON (set to None / []).
    The template uses {% if job.client %} guards — it does not use hasOwnProperty.
    """

    company: str
    client: str | None = Field(None, description="End-client name, if different from company.")
    role: str
    start_date: str | None = Field(None, description="ISO partial date: YYYY-MM")
    end_date: str | None = Field(None, description="ISO partial date: YYYY-MM, or null if current.")
    is_current: bool = False
    duration_display: str = Field(
        description="Human-friendly duration string e.g. 'May/2022 - Present'. "
        "Normalised to Mon/YYYY style by extraction prompt. "
        "Template prints this verbatim — no formatting logic needed."
    )
    project_name: str | None = None
    technology_used: list[str] = Field(
        default_factory=list,
        description="Empty list [] when absent — never None.",
    )
    project_description: str | None = Field(
        None, description="May contain **bold** markdown spans."
    )
    responsibilities: list[ResponsibilityBullet]
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = Field(
        description="Roll-up: lowest confidence among this entry's fields. "
        "Used by review UI to flag entire entries needing attention."
    )


# ── Root schema ───────────────────────────────────────────────────────────────


class CandidateProfile(BaseModel):
    """
    The Canonical Candidate Profile.

    This is the single object that flows through the entire pipeline:
      AI extraction → DB storage → recruiter review & edits → template rendering

    Validation rules enforced here (validator.py adds additional post-extraction checks):
      - overall_confidence in [0, 1]
      - All enums validated
      - employment entries always have responsibilities (may be empty list)
      - has_certifications is consistent with items list (validator.py checks this)
    """

    meta: Meta
    candidate: Candidate
    career_summary: CareerSummary
    technical_skills: TechnicalSkills
    education: Education
    employment: list[EmploymentEntry]

    model_config = {
        "json_schema_extra": {
            "example": {
                "meta": {
                    "org_id": "11111111-1111-1111-1111-111111111111",
                    "candidate_id": "22222222-2222-2222-2222-222222222222",
                    "source_document_id": "33333333-3333-3333-3333-333333333333",
                    "extraction_model": "claude-sonnet-4-5",
                    "extraction_version": "v1",
                    "extraction_instructions": None,
                    "overall_confidence": 0.93,
                },
                "candidate": {
                    "full_name": "Rupesh G",
                    "role_title": "Snr. Full Stack Consultant",
                    "email": "rupesh@example.com",
                    "phone": "+91 9999999999",
                    "location": "Bangalore, India",
                },
                "career_summary": {
                    "bullets": [
                        {
                            "text": "Engineering Leader with **15+ years** of software engineering experience.",
                            "confidence": 0.95,
                            "source_type": "verified_transformation",
                            "evidence": "Engineering Leader with 15+ years...",
                        }
                    ]
                },
                "technical_skills": {
                    "groups": [
                        {
                            "category": "Technical Leadership",
                            "skills": ["Platform Engineering Strategy", "Distributed Systems"],
                            "confidence": 0.9,
                            "source_type": "source",
                            "evidence": None,
                        }
                    ]
                },
                "education": {
                    "has_certifications": False,
                    "items": [
                        {
                            "type": "degree",
                            "text": "Bachelor of Engineering (B.E.) in Computer Science from RGPV, India (2003).",
                            "confidence": 0.98,
                            "source_type": "source",
                            "evidence": "Bachelor of Engineering (B.E.)...",
                        }
                    ],
                },
                "employment": [
                    {
                        "company": "McLaren Strategic Solutions",
                        "client": None,
                        "role": "Technical Architect",
                        "start_date": "2022-05",
                        "end_date": None,
                        "is_current": True,
                        "duration_display": "May/2022 - Present",
                        "project_name": None,
                        "technology_used": [],
                        "project_description": None,
                        "responsibilities": [
                            {
                                "text": "Own end-to-end delivery for **J.P. Morgan Chase (Trade Finance)**.",
                                "confidence": 0.92,
                                "source_type": "verified_transformation",
                                "evidence": "Own end-to-end delivery...",
                            }
                        ],
                        "confidence": 0.9,
                    }
                ],
            }
        }
    }
