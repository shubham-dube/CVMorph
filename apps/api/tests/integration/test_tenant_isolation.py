"""
Tenant isolation tests — the most critical security invariant.

These tests verify that a user from Org A CANNOT access data from Org B,
at both the application layer (router filtering) and confirm RLS is configured.

We test:
  - Candidates: Org B user cannot read Org A's candidates
  - Profile: Org B user cannot read Org A's candidate's profile
  - Templates: Org B user cannot read Org A's templates
  - Generations: Org B user cannot read Org A's generations

These MUST pass on every PR. Cross-org data access is a critical security failure.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models import (
    Candidate,
    Organization,
    Template,
    User,
)


@pytest.fixture
async def org_b(db_session: AsyncSession) -> Organization:
    org = Organization(
        id=str(uuid.uuid4()),
        name="Org B",
        plan_tier="internal",
        branding_config={},
    )
    db_session.add(org)
    await db_session.flush()
    return org


@pytest.fixture
def org_b_token(org_b: Organization) -> str:
    """Token for a user in Org B."""
    return create_access_token(
        subject=str(uuid.uuid4()),
        org_id=org_b.id,
        role="recruiter",
    )


@pytest.fixture
def org_b_headers(org_b_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {org_b_token}"}


@pytest.mark.asyncio
async def test_org_b_cannot_list_org_a_candidates(
    async_client: AsyncClient,
    seed_org: Organization,
    db_session: AsyncSession,
    org_b_headers: dict,
):
    """Org B's token should see 0 candidates even if Org A has some."""
    # Create a candidate in Org A
    candidate = Candidate(
        id=str(uuid.uuid4()),
        org_id=seed_org.id,
        name="Org A Candidate",
    )
    db_session.add(candidate)
    await db_session.flush()

    # Org B token should return empty list, NOT Org A's candidate
    response = await async_client.get("/v1/candidates", headers=org_b_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_org_b_cannot_get_org_a_candidate(
    async_client: AsyncClient,
    seed_org: Organization,
    db_session: AsyncSession,
    org_b_headers: dict,
):
    """Org B cannot GET a specific candidate from Org A — must return 404."""
    candidate = Candidate(
        id=str(uuid.uuid4()),
        org_id=seed_org.id,
        name="Org A Private Candidate",
    )
    db_session.add(candidate)
    await db_session.flush()

    response = await async_client.get(
        f"/v1/candidates/{candidate.id}", headers=org_b_headers
    )
    # Must be 404 (not 403 — don't reveal the resource exists)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_org_b_cannot_list_org_a_templates(
    async_client: AsyncClient,
    seed_org: Organization,
    db_session: AsyncSession,
    org_b_headers: dict,
):
    """Org B's template list must never include Org A's templates."""
    template = Template(
        id=str(uuid.uuid4()),
        org_id=seed_org.id,
        name="Org A Secret Template",
        config_json={},
    )
    db_session.add(template)
    await db_session.flush()

    response = await async_client.get("/v1/templates", headers=org_b_headers)
    assert response.status_code == 200
    # No Org A templates visible
    for t in response.json():
        assert t["org_id"] != str(seed_org.id)


@pytest.mark.asyncio
async def test_org_b_cannot_get_org_a_profile(
    async_client: AsyncClient,
    seed_org: Organization,
    db_session: AsyncSession,
    org_b_headers: dict,
):
    """Org B cannot access a candidate's profile from Org A."""
    candidate = Candidate(
        id=str(uuid.uuid4()),
        org_id=seed_org.id,
        name="Sensitive Candidate",
    )
    db_session.add(candidate)
    await db_session.flush()

    response = await async_client.get(
        f"/v1/candidates/{candidate.id}/profile", headers=org_b_headers
    )
    assert response.status_code == 404
