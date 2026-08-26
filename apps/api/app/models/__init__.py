"""
SQLAlchemy ORM Models — mirrors the PRD §7 schema exactly.

All tables are tenant-scoped via `org_id`. Postgres Row-Level Security (RLS)
policies are applied in the Alembic migration (see migrations/versions/).

IMPORTANT: Never query across orgs — always filter by org_id at the application
layer AND rely on RLS as a second defence-in-depth layer.

Epic ownership:
  Epic 1.1 — organizations, users, candidates, documents
  Epic 1.2 — candidate_profiles, templates, generations, review_events
  Epic 1.3 — usage_events, api_keys (schema-ready, unused until P3)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# EPIC 1.1 — Core entities
# ─────────────────────────────────────────────────────────────────────────────


class Organization(Base):
    """
    Tenant root. Every other table links back here.

    plan_tier: "internal" | "free" | "pro" | "enterprise"
    branding_config: JSON blob {logo_url, primary_color, secondary_color, font} — used
        for white-labeling in P3. Store now, use later.
    """

    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(50), nullable=False, default="internal")
    branding_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    users: Mapped[list["User"]] = relationship("User", back_populates="org")
    candidates: Mapped[list["Candidate"]] = relationship("Candidate", back_populates="org")
    templates: Mapped[list["Template"]] = relationship("Template", back_populates="org")


class User(Base):
    """
    Platform user — always belongs to exactly one org.

    role: "admin" | "recruiter"  (RBAC expands in Epic P2)
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True)  # OAuth subject
    role: Mapped[str] = mapped_column(
        Enum("admin", "recruiter", name="user_role_enum"), nullable=False, default="recruiter"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    org: Mapped["Organization"] = relationship("Organization", back_populates="users")

    __table_args__ = (UniqueConstraint("org_id", "email", name="uq_users_org_email"),)


class Candidate(Base):
    """
    A candidate record. One candidate can have many source documents and profiles
    (e.g. CV version history, or new CV from same person).

    master_profile_id: points to the most recently approved CandidateProfile
    """

    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    master_profile_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )  # FK set after first profile is approved
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    org: Mapped["Organization"] = relationship("Organization", back_populates="candidates")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="candidate")
    profiles: Mapped[list["CandidateProfile"]] = relationship(
        "CandidateProfile", back_populates="candidate"
    )
    generations: Mapped[list["Generation"]] = relationship(
        "Generation", back_populates="candidate"
    )


class Document(Base):
    """
    Raw uploaded file (original) or generated output file.

    type: "original" | "generated"
    storage_url: S3/GCS object key or local file path (never a public URL — generate
        signed URLs at request time via the storage service)
    extraction_instructions: recruiter's free-text guidance passed into the extraction
        prompt (PRD §9.6 extraction-time custom instructions)
    parse_status: "pending" | "queued" | "parsing" | "parsed" | "failed"
    raw_text: extracted plain text from the document (stored post-parse, used by extraction)
    """

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(
        Enum("original", "generated", name="document_type_enum"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extraction_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    parse_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    candidate: Mapped["Candidate"] = relationship("Candidate", back_populates="documents")
    profiles: Mapped[list["CandidateProfile"]] = relationship(
        "CandidateProfile", back_populates="source_document"
    )


# ─────────────────────────────────────────────────────────────────────────────
# EPIC 1.2 — Pipeline outputs
# ─────────────────────────────────────────────────────────────────────────────


class CandidateProfile(Base):
    """
    The Canonical Candidate Profile — output of AI extraction, input to template rendering.

    profile_json: the full JSON blob matching cv_schema_template_mapping.md §3.
        This is stored as-is (not decomposed into columns) because:
        a) it's the AI's output, not relational data
        b) the whole blob is passed to the template renderer
        c) we version via extraction_version, not schema migrations
    extraction_status: "pending" | "extracting" | "ready_for_review" | "approved" | "failed"
    """

    __tablename__ = "candidate_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    source_document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="RESTRICT"), nullable=False
    )
    profile_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    extraction_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )
    extraction_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    extraction_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    overall_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    candidate: Mapped["Candidate"] = relationship("Candidate", back_populates="profiles")
    source_document: Mapped["Document"] = relationship("Document", back_populates="profiles")
    review_events: Mapped[list["ReviewEvent"]] = relationship(
        "ReviewEvent", back_populates="profile"
    )
    generations: Mapped[list["Generation"]] = relationship(
        "Generation", back_populates="profile"
    )


class Template(Base):
    """
    A CV template — one .docx file + JSON config defining sections/constraints.

    config_json shape (drives both template-builder UI in P1 and render-time validation):
    {
      "sections": ["career_summary", "technical_skills", "education", "employment"],
      "required_fields": ["candidate.full_name", "candidate.role_title"],
      "max_summary_bullets": 6,
      "max_responsibilities_per_job": 8
    }
    docx_storage_url: object key for the .docx file in object storage
    """

    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    docx_storage_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    org: Mapped["Organization"] = relationship("Organization", back_populates="templates")
    generations: Mapped[list["Generation"]] = relationship(
        "Generation", back_populates="template"
    )


class Generation(Base):
    """
    A single CV generation request — links a profile + template → output document.

    status: "pending" | "rendering" | "complete" | "failed"
    formatting_instructions: generation-time custom instructions (PRD §9.6)
    output_document_id: FK to Document (type="generated") once rendering is complete
    """

    __tablename__ = "generations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("templates.id", ondelete="RESTRICT"), nullable=False
    )
    profile_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("candidate_profiles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    formatting_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_document_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    triggered_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    candidate: Mapped["Candidate"] = relationship("Candidate", back_populates="generations")
    template: Mapped["Template"] = relationship("Template", back_populates="generations")
    profile: Mapped["CandidateProfile"] = relationship(
        "CandidateProfile", back_populates="generations"
    )


class ReviewEvent(Base):
    """
    Immutable audit log of every recruiter edit during the review step.

    field_path: JSON path to the edited field e.g. "employment[0].responsibilities[2].text"
    action: "confirm" | "edit" | "remove"
    old_value / new_value: JSON-serialised before/after values
    """

    __tablename__ = "review_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    profile_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_path: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(
        Enum("confirm", "edit", "remove", name="review_action_enum"), nullable=False
    )
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    profile: Mapped["CandidateProfile"] = relationship(
        "CandidateProfile", back_populates="review_events"
    )


# ─────────────────────────────────────────────────────────────────────────────
# EPIC 1.3 — Future billing & API (schema-ready, unused until P3)
# ─────────────────────────────────────────────────────────────────────────────


class UsageEvent(Base):
    """
    Append-only usage log for future billing.

    event_type: "cv_uploaded" | "cv_generated" | "api_call" | ...
    quantity: number of units (usually 1, but supports bulk events)
    """

    __tablename__ = "usage_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reference_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )  # e.g. generation_id
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class ApiKey(Base):
    """
    Public API keys for future developer/metered API product (P3).

    key_hash: SHA-256 of the raw key — never store the raw key.
    scopes: list of allowed scopes e.g. ["documents:write", "profiles:read"]
    """

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
