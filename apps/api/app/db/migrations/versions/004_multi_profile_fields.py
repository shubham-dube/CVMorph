"""Add multi-profile fields to candidate_profiles table.

Revision: 004
Parent:   003

Changes:
  - candidate_profiles.title  VARCHAR(255) NOT NULL DEFAULT 'Primary Profile'
  - candidate_profiles.target_role  VARCHAR(255) NULL
  - candidate_profiles.job_description  TEXT NULL
  - candidate_profiles.custom_prompt  TEXT NULL
  - candidate_profiles.bluff_level  VARCHAR(50) NULL DEFAULT 'none'
  - candidate_profiles.parent_profile_id  UUID NULL FK candidate_profiles(id)
  - candidate_profiles.source_document_id  ALTER DROP NOT NULL
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004"
down_revision: str | None = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── candidate_profiles.title ───────────────────────────────────────────────
    op.add_column(
        "candidate_profiles",
        sa.Column(
            "title",
            sa.String(255),
            nullable=False,
            server_default="Primary Profile",
        ),
    )

    # ── candidate_profiles.target_role ─────────────────────────────────────────
    op.add_column(
        "candidate_profiles",
        sa.Column("target_role", sa.String(255), nullable=True),
    )

    # ── candidate_profiles.job_description ─────────────────────────────────────
    op.add_column(
        "candidate_profiles",
        sa.Column("job_description", sa.Text(), nullable=True),
    )

    # ── candidate_profiles.custom_prompt ───────────────────────────────────────
    op.add_column(
        "candidate_profiles",
        sa.Column("custom_prompt", sa.Text(), nullable=True),
    )

    # ── candidate_profiles.bluff_level ─────────────────────────────────────────
    op.add_column(
        "candidate_profiles",
        sa.Column(
            "bluff_level",
            sa.String(50),
            nullable=True,
            server_default="none",
        ),
    )

    # ── candidate_profiles.parent_profile_id ───────────────────────────────────
    op.add_column(
        "candidate_profiles",
        sa.Column(
            "parent_profile_id",
            UUID(as_uuid=False),
            sa.ForeignKey("candidate_profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # ── candidate_profiles.source_document_id nullable ─────────────────────────
    op.alter_column(
        "candidate_profiles",
        "source_document_id",
        existing_type=UUID(as_uuid=False),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "candidate_profiles",
        "source_document_id",
        existing_type=UUID(as_uuid=False),
        nullable=False,
    )
    op.drop_column("candidate_profiles", "parent_profile_id")
    op.drop_column("candidate_profiles", "bluff_level")
    op.drop_column("candidate_profiles", "custom_prompt")
    op.drop_column("candidate_profiles", "job_description")
    op.drop_column("candidate_profiles", "target_role")
    op.drop_column("candidate_profiles", "title")
