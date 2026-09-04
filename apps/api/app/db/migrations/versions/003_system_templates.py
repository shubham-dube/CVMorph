"""Add is_system to templates table and update RLS to allow system templates across orgs.

Revision: 003
Parent:   002

Changes:
  - templates.is_system  BOOLEAN NOT NULL DEFAULT false
  - update tenant_isolation_policy on templates to allow is_system = true
  - seed existing default templates as is_system = true
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── templates.is_system ──────────────────────────────────────────────────
    op.add_column(
        "templates",
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # ── Update RLS policy on templates (single statement per execute for asyncpg) ──
    op.execute("DROP POLICY IF EXISTS tenant_isolation_policy ON templates")
    op.execute(
        """
        CREATE POLICY tenant_isolation_policy ON templates
            USING (
                org_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID
                OR is_system = true
            )
        """
    )

    # ── Mark default template as system template ─────────────────────────────
    op.execute(
        "UPDATE templates SET is_system = true WHERE name ILIKE '%Default%' OR name ILIKE '%Copious%'"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_policy ON templates")
    op.execute(
        """
        CREATE POLICY tenant_isolation_policy ON templates
            USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
        """
    )
    op.drop_column("templates", "is_system")
