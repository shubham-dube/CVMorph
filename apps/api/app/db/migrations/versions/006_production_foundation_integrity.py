"""Production foundation data integrity fixes.

Revision: 006
Parent:   005

Changes:
  - users: re-add hashed_password VARCHAR(255) NULL (AUD-007)
  - candidates:
      - add is_deleted BOOLEAN NOT NULL DEFAULT FALSE (AUD-020)
      - add deleted_at TIMESTAMPTZ NULL (AUD-020)
      - add FK constraint on master_profile_id -> candidate_profiles.id ON DELETE SET NULL (AUD-025)
  - templates:
      - alter org_id to NULLABLE (AUD-028)
      - add is_deleted BOOLEAN NOT NULL DEFAULT FALSE (AUD-020)
      - add deleted_at TIMESTAMPTZ NULL (AUD-020)
  - generations:
      - add is_deleted BOOLEAN NOT NULL DEFAULT FALSE (AUD-020)
      - add deleted_at TIMESTAMPTZ NULL (AUD-020)
  - candidate_profiles:
      - alter profile_json to JSONB on PostgreSQL (AUD-019)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: str | None = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # 1. users.hashed_password (AUD-007)
    op.add_column("users", sa.Column("hashed_password", sa.String(255), nullable=True))

    # 2. candidates soft delete + FK (AUD-020, AUD-025)
    op.add_column(
        "candidates",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_candidates_is_deleted", "candidates", ["is_deleted"])
    op.add_column("candidates", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    if is_postgres:
        op.create_foreign_key(
            "fk_candidates_master_profile_id",
            "candidates",
            "candidate_profiles",
            ["master_profile_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # 3. templates.org_id nullable + soft delete (AUD-028, AUD-020)
    op.alter_column(
        "templates",
        "org_id",
        existing_type=postgresql.UUID(as_uuid=False) if is_postgres else sa.String(36),
        nullable=True,
    )
    op.add_column(
        "templates",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_templates_is_deleted", "templates", ["is_deleted"])
    op.add_column("templates", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    # 4. generations soft delete (AUD-020)
    op.add_column(
        "generations",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_generations_is_deleted", "generations", ["is_deleted"])
    op.add_column("generations", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    # 5. candidate_profiles.profile_json to JSONB (AUD-019)
    if is_postgres:
        op.execute(
            "ALTER TABLE candidate_profiles ALTER COLUMN profile_json TYPE JSONB USING profile_json::jsonb"
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.execute(
            "ALTER TABLE candidate_profiles ALTER COLUMN profile_json TYPE JSON USING profile_json::json"
        )

    op.drop_index("ix_generations_is_deleted", table_name="generations")
    op.drop_column("generations", "deleted_at")
    op.drop_column("generations", "is_deleted")

    op.drop_index("ix_templates_is_deleted", table_name="templates")
    op.drop_column("templates", "deleted_at")
    op.drop_column("templates", "is_deleted")
    op.alter_column(
        "templates",
        "org_id",
        existing_type=postgresql.UUID(as_uuid=False) if is_postgres else sa.String(36),
        nullable=False,
    )

    if is_postgres:
        op.drop_constraint("fk_candidates_master_profile_id", "candidates", type_="foreignkey")
    op.drop_index("ix_candidates_is_deleted", table_name="candidates")
    op.drop_column("candidates", "deleted_at")
    op.drop_column("candidates", "is_deleted")

    op.drop_column("users", "hashed_password")
