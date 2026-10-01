"""
Candidate and CandidateProfile data access repository.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Candidate, CandidateProfile
from app.repositories.base import BaseRepository


class CandidateRepository(BaseRepository[Candidate]):
    """Data access repository for Candidate entities and their nested profiles."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Candidate, session)

    async def get_candidate(self, candidate_id: str, org_id: str) -> Candidate | None:
        return await self.get_by_id(candidate_id, org_id)

    async def list_candidates(
        self, org_id: str, skip: int = 0, limit: int = 50
    ) -> Sequence[Candidate]:
        return await self.list(org_id, skip=skip, limit=limit)

    async def count_candidates(self, org_id: str) -> int:
        return await self.count(org_id)

    async def create_candidate(self, org_id: str, name: str) -> Candidate:
        candidate = Candidate(
            id=str(uuid4()),
            org_id=org_id,
            name=name,
        )
        self.session.add(candidate)
        await self.session.flush()
        return candidate

    async def get_latest_profile(
        self, candidate_id: str, org_id: str
    ) -> CandidateProfile | None:
        stmt = (
            select(CandidateProfile)
            .where(
                CandidateProfile.candidate_id == candidate_id,
                CandidateProfile.org_id == org_id,
            )
            .order_by(CandidateProfile.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_profile_by_id(
        self, candidate_id: str, profile_id: str, org_id: str
    ) -> CandidateProfile | None:
        stmt = select(CandidateProfile).where(
            CandidateProfile.id == profile_id,
            CandidateProfile.candidate_id == candidate_id,
            CandidateProfile.org_id == org_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def count_profiles(self, candidate_id: str, org_id: str) -> int:
        stmt = select(func.count(CandidateProfile.id)).where(
            CandidateProfile.candidate_id == candidate_id,
            CandidateProfile.org_id == org_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() or 0

    async def create_profile(
        self,
        candidate_id: str,
        org_id: str,
        profile_json: dict[str, Any],
        title: str = "Primary Profile",
        target_role: str | None = None,
        job_description: str | None = None,
        custom_prompt: str | None = None,
        bluff_level: str | None = "none",
        parent_profile_id: str | None = None,
        extraction_status: str = "ready_for_review",
        extraction_model: str | None = None,
        overall_confidence: float | None = None,
    ) -> CandidateProfile:
        profile = CandidateProfile(
            id=str(uuid4()),
            candidate_id=candidate_id,
            org_id=org_id,
            profile_json=profile_json,
            title=title,
            target_role=target_role,
            job_description=job_description,
            custom_prompt=custom_prompt,
            bluff_level=bluff_level,
            parent_profile_id=parent_profile_id,
            extraction_status=extraction_status,
            extraction_model=extraction_model,
            overall_confidence=overall_confidence,
        )
        self.session.add(profile)
        await self.session.flush()
        return profile
