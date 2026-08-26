"""
Seed script — creates the internal org + admin user for local development.

Run:  python -m app.db.seed
or:   make seed

IMPORTANT: This script uses the SYNC database URL (psycopg2) for simplicity.
It is safe to run multiple times — existing org/user is not duplicated.
"""

from __future__ import annotations

import sys
import uuid

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import Base, Organization, User


def seed() -> None:
    engine = create_engine(settings.DATABASE_URL_SYNC, echo=True)

    # Create all tables if running for the first time without Alembic
    # (In prod, use `alembic upgrade head` instead)
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

        session.commit()
        print("[seed] Done. ✓")


if __name__ == "__main__":
    seed()
    sys.exit(0)
