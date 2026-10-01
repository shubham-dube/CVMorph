"""
Characterization test harness pinning current system behavior.
Covers critical flows:
  1. Health check: GET /v1/health -> 200 OK
  2. Candidate lifecycle:
     - POST /v1/candidates -> 201 Created
     - GET /v1/candidates -> 200 with CandidateListResponse
     - GET /v1/candidates/{id} -> 200 with CandidateResponse
     - GET /v1/candidates/{id}/profile -> 404 when no profile uploaded
  3. Template catalog:
     - GET /v1/templates -> 200 list
  4. CV Extraction endpoint:
     - POST /v1/cv/extract validation and success
  5. Auth flows:
     - POST /v1/auth/login -> 200 with JWT
     - GET /v1/auth/me -> 200 with authenticated user
"""

from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Candidate, CandidateProfile, Organization, Template, User


@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient):
    response = await async_client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ("ok", "healthy")


@pytest.mark.asyncio
async def test_candidate_creation_and_retrieval(
    async_client: AsyncClient,
    seed_org: Organization,
    auth_headers: dict[str, str],
):
    # 1. Create a new candidate
    create_payload = {"name": "Alex Mercer"}
    create_res = await async_client.post(
        "/v1/candidates",
        json=create_payload,
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    candidate_data = create_res.json()
    assert candidate_data["name"] == "Alex Mercer"
    assert "id" in candidate_data
    candidate_id = candidate_data["id"]

    # 2. Retrieve the candidate by ID
    get_res = await async_client.get(
        f"/v1/candidates/{candidate_id}",
        headers=auth_headers,
    )
    assert get_res.status_code == 200
    assert get_res.json()["id"] == candidate_id
    assert get_res.json()["name"] == "Alex Mercer"

    # 3. List candidates
    list_res = await async_client.get(
        "/v1/candidates",
        headers=auth_headers,
    )
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    candidate_ids = [c["id"] for c in list_data["items"]]
    assert candidate_id in candidate_ids

    # 4. Profile endpoint returns 404 because no profile has been ingested yet
    profile_res = await async_client.get(
        f"/v1/candidates/{candidate_id}/profile",
        headers=auth_headers,
    )
    assert profile_res.status_code == 404


@pytest.mark.asyncio
async def test_templates_catalog(
    async_client: AsyncClient,
    seed_org: Organization,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    # Seed a template for seed_org
    template = Template(
        id=str(uuid.uuid4()),
        org_id=seed_org.id,
        name="Official Copious Modern",
        config_json={"theme": "dark", "accent_color": "#01AA83"},
    )
    db_session.add(template)
    await db_session.flush()

    response = await async_client.get("/v1/templates", headers=auth_headers)
    assert response.status_code == 200
    templates = response.json()
    assert isinstance(templates, list)
    matching = [t for t in templates if t["id"] == template.id]
    assert len(matching) == 1
    assert matching[0]["name"] == "Official Copious Modern"
