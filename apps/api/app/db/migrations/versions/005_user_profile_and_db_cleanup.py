"""Add name, picture_url to users table; drop hashed_password and api_keys table.

Revision: 005
Parent:   004

Changes:
  - users.name         VARCHAR(255) NULL
  - users.picture_url  TEXT NULL
  - users.hashed_password  DROP COLUMN
  - api_keys               DROP TABLE IF EXISTS
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users.name ─────────────────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("name", sa.String(255), nullable=True),
    )

    # ── users.picture_url ──────────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("picture_url", sa.Text(), nullable=True),
    )

    # ── drop users.hashed_password ─────────────────────────────────────────────
    op.drop_column("users", "hashed_password")

    # ── drop unused api_keys table ─────────────────────────────────────────────
    op.execute("DROP TABLE IF EXISTS api_keys CASCADE")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("hashed_password", sa.String(255), nullable=True),
    )
    op.drop_column("users", "picture_url")
    op.drop_column("users", "name")
