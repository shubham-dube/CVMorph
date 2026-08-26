"""
Seed script — creates the internal org, admin user, and default template for local development.

Run:  python -m app.db.seed
or:   make seed

IMPORTANT: This script uses the SYNC database URL (psycopg2) for simplicity.
It is safe to run multiple times — existing records are not duplicated.

NOTE: RLS is enforced at the DB layer. This seed script uses the same DB connection
without setting app.current_org_id — that's fine because the seed role bypasses RLS
(or the script connects as the postgres superuser in dev). In production, grant the
seed role BYPASSRLS or run as the migration superuser.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import Base, Organization, Template, User

# Path to the default template config relative to this file
_TEMPLATE_CONFIG_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent.parent
    / "templates"
    / "copious-default"
    / "config.json"
)

# Storage key for the template .docx (inside object storage root)
_TEMPLATE_DOCX_STORAGE_KEY = "templates/copious-default/template.docx"


def seed() -> None:
    engine = create_engine(settings.DATABASE_URL_SYNC, echo=True)

    # Create all tables if running for the first time without Alembic
    # (In prod, always use `alembic upgrade head` instead of create_all)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        # ── Internal org ──────────────────────────────────────────────────────
        existing_org = session.execute(
            select(Organization).where(Organization.name == settings.SEED_ORG_NAME)
        ).scalar_one_or_none()

        if existing_org:
            print(f"[seed] Org '{settings.SEED_ORG_NAME}' already exists — skipping org creation.")
            org = existing_org
        else:
            org = Organization(
                id=str(uuid.uuid4()),
                name=settings.SEED_ORG_NAME,
                plan_tier="internal",
                branding_config={
                    "logo_url": None,
                    "primary_color": "#1A1A2E",
                    "secondary_color": "#E94560",
                    "font": "Inter",
                },
            )
            session.add(org)
            session.flush()
            print(f"[seed] Created org '{org.name}' with id={org.id}")

        # ── Admin user ────────────────────────────────────────────────────────
        existing_user = session.execute(
            select(User).where(User.email == settings.SEED_ADMIN_EMAIL)
        ).scalar_one_or_none()

        if existing_user:
            print(f"[seed] User '{settings.SEED_ADMIN_EMAIL}' already exists — skipping.")
        else:
            admin = User(
                id=str(uuid.uuid4()),
                org_id=org.id,
                email=settings.SEED_ADMIN_EMAIL,
                hashed_password=hash_password(settings.SEED_ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            )
            session.add(admin)
            print(f"[seed] Created admin user '{admin.email}' in org '{org.name}'")

        # ── Default template ──────────────────────────────────────────────────
        existing_template = session.execute(
            select(Template).where(
                Template.org_id == org.id,
                Template.name == "Copious Default",
            )
        ).scalar_one_or_none()

        if existing_template:
            print("[seed] Default template 'Copious Default' already exists — skipping.")
        else:
            # Load config from the templates/ directory
            config_json: dict = {}
            if _TEMPLATE_CONFIG_PATH.exists():
                with open(_TEMPLATE_CONFIG_PATH) as f:
                    raw_config = json.load(f)
                    # Strip internal-only fields before storing in DB
                    config_json = {
                        k: v
                        for k, v in raw_config.items()
                        if not k.startswith("_")
                    }
            else:
                print(
                    f"[seed] WARNING: Template config not found at {_TEMPLATE_CONFIG_PATH}. "
                    "Using empty config."
                )

            template = Template(
                id=str(uuid.uuid4()),
                org_id=org.id,
                name="Copious Default",
                description="Standard Copious branded CV template with cover page and all sections.",
                config_json=config_json,
                docx_storage_url=_TEMPLATE_DOCX_STORAGE_KEY,
                is_active=True,
            )
            session.add(template)
            print(f"[seed] Created template 'Copious Default' → {_TEMPLATE_DOCX_STORAGE_KEY}")

        session.commit()
        print("[seed] Done. ✓")
        print()
        print("  To start the API:")
        print("    docker-compose up -d")
        print("    uvicorn app.main:app --reload")
        print()
        print(f"  Login:  POST /v1/auth/login")
        print(f"  Email:  {settings.SEED_ADMIN_EMAIL}")
        print(f"  Pass:   {settings.SEED_ADMIN_PASSWORD}")


if __name__ == "__main__":
    seed()
    sys.exit(0)
