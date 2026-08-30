"""Add template_type to templates table and output_pdf_url to generations table.

Revision: 002
Parent:   001

Changes:
  - templates.template_type  VARCHAR(10) NOT NULL DEFAULT 'docx'  ("docx" | "latex")
  - generations.output_pdf_url  TEXT NULL  (object-store key for the PDF output)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── templates.template_type ────────────────────────────────────────────────
    op.add_column(
        "templates",
        sa.Column(
            "template_type",
            sa.String(10),
            nullable=False,
            server_default="docx",
        ),
    )

    # ── generations.output_pdf_url ─────────────────────────────────────────────
    op.add_column(
        "generations",
        sa.Column("output_pdf_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("generations", "output_pdf_url")
    op.drop_column("templates", "template_type")
