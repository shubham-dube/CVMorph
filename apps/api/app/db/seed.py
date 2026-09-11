"""
Seed script — creates internal system org, admin user, and official system templates.

Official System Templates (sourced from apps/api/seed/templates):
  1. Classic Professional  (Classic Professional.docx)
  2. Contemporary Header   (Contemporary Header.docx)
  3. Modern Sidebar        (Modern Sidebar.docx)

Run:
  uv run python -m app.db.seed
"""

from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from pathlib import Path

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import Organization, Template, Generation
from app.services.storage.object_store import get_object_store

logger = logging.getLogger("cvmorph.seed")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Path to the seed templates directory
_SEED_TEMPLATES_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "seed"
    / "templates"
)

# Deterministic IDs for system templates (UUIDv5)
CLASSIC_PROFESSIONAL_ID = "44728264-6568-5338-b6f8-a59c02b31a2b"
CONTEMPORARY_HEADER_ID = "cf98ebf2-78fe-5c6b-9738-7d6fbe42da72"
MODERN_SIDEBAR_ID = "18999c91-951a-50cd-8301-85800101dcf3"

SYSTEM_TEMPLATES_CONFIG = [
    {
        "id": CLASSIC_PROFESSIONAL_ID,
        "name": "Classic Professional",
        "description": "Standard corporate single-column resume template with clean horizontal dividing lines and serif typography.",
        "filename": "Classic Professional.docx",
        "storage_key": "templates/system/classic-professional.docx",
        "config_json": {
            "sections": ["summary", "skills", "experience", "education", "projects", "certifications"],
            "required_fields": ["candidate.full_name", "candidate.email"],
            "max_summary_bullets": 8,
            "max_responsibilities_per_job": 10,
        },
    },
    {
        "id": CONTEMPORARY_HEADER_ID,
        "name": "Contemporary Header",
        "description": "Polished design featuring an accent color banner header, crisp typography, and high information density.",
        "filename": "Contemporary Header.docx",
        "storage_key": "templates/system/contemporary-header.docx",
        "config_json": {
            "sections": ["summary", "skills", "experience", "education", "projects", "certifications"],
            "required_fields": ["candidate.full_name", "candidate.email"],
            "max_summary_bullets": 8,
            "max_responsibilities_per_job": 10,
        },
    },
    {
        "id": MODERN_SIDEBAR_ID,
        "name": "Modern Sidebar",
        "description": "Sophisticated two-column layout placing contact info, skills, and education into a sleek sidebar column.",
        "filename": "Modern Sidebar.docx",
        "storage_key": "templates/system/modern-sidebar.docx",
        "config_json": {
            "sections": ["summary", "skills", "experience", "education", "projects", "certifications"],
            "required_fields": ["candidate.full_name", "candidate.email"],
            "max_summary_bullets": 8,
            "max_responsibilities_per_job": 10,
        },
    },
]


async def seed() -> None:
    store = get_object_store()
    logger.info("Starting CVMorph system seed (resume templates)...")
    logger.info("Seed templates directory: %s", _SEED_TEMPLATES_DIR)

    async with AsyncSessionLocal() as session:
        # Retrieve existing org_id for template foreign key (Template.org_id is non-nullable)
        first_org_id = (
            await session.execute(
                select(Organization.id).order_by(Organization.created_at.asc())
            )
        ).scalars().first()

        if not first_org_id:
            # Fallback only if database has no organizations yet
            system_org = Organization(
                id=str(uuid.uuid4()),
                name="System",
                plan_tier="internal",
            )
            session.add(system_org)
            await session.flush()
            first_org_id = system_org.id

        # ── Seed Official System Templates from apps/api/seed/templates ──────
        valid_system_ids = set()

        for tpl_info in SYSTEM_TEMPLATES_CONFIG:
            tpl_id = tpl_info["id"]
            valid_system_ids.add(tpl_id)
            source_file = _SEED_TEMPLATES_DIR / tpl_info["filename"]

            if not source_file.exists():
                logger.error("Template file not found at %s! Skipping.", source_file)
                continue

            docx_bytes = source_file.read_bytes()
            storage_key = tpl_info["storage_key"]

            # Upload to Cloudflare R2 / Object Store
            uploaded_key = await store.put(
                storage_key,
                docx_bytes,
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
            logger.info("Uploaded '%s' (%d bytes) → %s", tpl_info["name"], len(docx_bytes), uploaded_key)

            # Check if template already exists by ID
            existing_tpl = (
                await session.execute(
                    select(Template).where(Template.id == tpl_id).order_by(Template.created_at.asc())
                )
            ).scalars().first()

            if existing_tpl:
                existing_tpl.name = tpl_info["name"]
                existing_tpl.description = tpl_info["description"]
                existing_tpl.config_json = tpl_info["config_json"]
                existing_tpl.docx_storage_url = uploaded_key
                existing_tpl.template_type = "docx"
                existing_tpl.is_system = True
                existing_tpl.is_active = True
                logger.info("Updated existing system template '%s' (id=%s)", existing_tpl.name, tpl_id)
            else:
                new_tpl = Template(
                    id=tpl_id,
                    org_id=first_org_id,
                    name=tpl_info["name"],
                    description=tpl_info["description"],
                    config_json=tpl_info["config_json"],
                    docx_storage_url=uploaded_key,
                    template_type="docx",
                    is_system=True,
                    is_active=True,
                )
                session.add(new_tpl)
                logger.info("Created system template '%s' (id=%s)", tpl_info["name"], tpl_id)

        await session.flush()

        # ── 4. Remove Previous System Templates & Obsolete "Copious" Defaults ──
        # Find any templates flagged as is_system that are NOT in valid_system_ids
        old_system_result = await session.execute(
            select(Template).where(
                or_(
                    (Template.is_system == True) & (~Template.id.in_(valid_system_ids)),  # noqa: E712
                    Template.name.in_(["Copious Default", "CVMorph Standard"]),
                )
            )
        )
        old_system_templates = old_system_result.scalars().all()

        for old_tpl in old_system_templates:
            if old_tpl.id in valid_system_ids:
                continue

            logger.info("Cleaning up obsolete template '%s' (id=%s)", old_tpl.name, old_tpl.id)

            # Reassign any historical generations referencing this template to Classic Professional
            gen_update_result = await session.execute(
                update(Generation)
                .where(Generation.template_id == old_tpl.id)
                .values(template_id=CLASSIC_PROFESSIONAL_ID)
            )
            if gen_update_result.rowcount:
                logger.info("Reassigned %d generations from '%s' to Classic Professional", gen_update_result.rowcount, old_tpl.name)

            # Delete the obsolete template record
            await session.delete(old_tpl)
            logger.info("Deleted obsolete template '%s' (id=%s)", old_tpl.name, old_tpl.id)

        # ── 5. Deactivate Duplicate Custom Templates in Workspaces ───────────
        # Soft-delete duplicate custom templates that match system template names or old copious names
        deactivate_names = [
            "ClassicProfessional",
            "Classic Professional",
            "Contemporary Header",
            "ModernSidebar",
            "Modern Sidebar",
            "Copious CV Minimal",
            "Copious CV CoverPage",
            "Copious CV Letterhead",
            "Copious CV Template Minimal",
            "Copious CV Template CoverPage",
            "Copious CV Template Letterhead",
            "Copious CV Template Minimal 2",
            "Copious CV Template CoverPage 3",
            "Copious CV Template Letterhead 2",
        ]
        dup_result = await session.execute(
            update(Template)
            .where(
                Template.is_system == False,  # noqa: E712
                Template.is_active == True,   # noqa: E712
                Template.name.in_(deactivate_names),
            )
            .values(is_active=False)
        )
        if dup_result.rowcount:
            logger.info("Deactivated %d legacy/duplicate custom templates from workspaces", dup_result.rowcount)

        await session.commit()
        logger.info("CVMorph system seed completed successfully! ✓")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
    sys.exit(0)
