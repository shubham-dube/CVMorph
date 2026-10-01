"""
Candidate domain service encapsulating business rules, review workflows, and approval gates.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import HTTPException, status

from app.models import Candidate, CandidateProfile, ReviewEvent
from app.repositories.candidate import CandidateRepository
from app.schemas.candidate_profile import CandidateProfile as CandidateProfileSchema

REVIEW_CONFIDENCE_THRESHOLD = 0.85


def collect_low_confidence_paths(profile: CandidateProfileSchema) -> list[str]:
    """Collect all field paths in the profile below review confidence threshold."""
    flagged: list[str] = []

    for i, bullet in enumerate(profile.career_summary.bullets):
        if bullet.confidence < REVIEW_CONFIDENCE_THRESHOLD:
            flagged.append(f"career_summary.bullets.{i}")

    for gi, group in enumerate(profile.technical_skills.groups):
        if group.confidence < REVIEW_CONFIDENCE_THRESHOLD:
            flagged.append(f"technical_skills.groups.{gi}")

    for ei, item in enumerate(profile.education.items):
        if item.confidence < REVIEW_CONFIDENCE_THRESHOLD:
            flagged.append(f"education.items.{ei}")

    for ji, job in enumerate(profile.employment):
        if job.confidence < REVIEW_CONFIDENCE_THRESHOLD:
            flagged.append(f"employment.{ji}")
        for ri, resp in enumerate(job.responsibilities):
            if resp.confidence < REVIEW_CONFIDENCE_THRESHOLD:
                flagged.append(f"employment.{ji}.responsibilities.{ri}")

    return flagged


class CandidateService:
    """Orchestrates candidate profile lifecycle, verification gates, and audit trails."""

    def __init__(self, repo: CandidateRepository) -> None:
        self.repo = repo

    async def list_candidates(
        self, org_id: str, page: int = 1, page_size: int = 20
    ) -> tuple[Sequence[Candidate], int]:
        skip = (page - 1) * page_size
        candidates = await self.repo.list_candidates(org_id, skip=skip, limit=page_size)
        total = await self.repo.count_candidates(org_id)
        return candidates, total

    async def get_candidate_or_404(self, candidate_id: str, org_id: str) -> Candidate:
        candidate = await self.repo.get_candidate(candidate_id, org_id)
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found",
            )
        return candidate

    async def create_candidate(self, org_id: str, name: str) -> Candidate:
        cleaned_name = name.strip()
        if not cleaned_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Candidate name is required",
            )
        candidate = await self.repo.create_candidate(org_id, cleaned_name)
        await self.repo.session.commit()
        await self.repo.session.refresh(candidate)
        return candidate

    async def get_latest_profile_or_404(
        self, candidate_id: str, org_id: str
    ) -> CandidateProfile:
        await self.get_candidate_or_404(candidate_id, org_id)
        profile = await self.repo.get_latest_profile(candidate_id, org_id)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No profile found for this candidate. Upload a CV to create one.",
            )
        return profile

    async def get_profile_by_id_or_404(
        self, candidate_id: str, profile_id: str, org_id: str
    ) -> CandidateProfile:
        await self.get_candidate_or_404(candidate_id, org_id)
        profile = await self.repo.get_profile_by_id(candidate_id, profile_id, org_id)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Profile {profile_id} not found for candidate {candidate_id}.",
            )
        return profile

    async def approve_profile(
        self,
        candidate_id: str,
        profile_id: str,
        org_id: str,
        user_id: str,
    ) -> CandidateProfile:
        candidate = await self.get_candidate_or_404(candidate_id, org_id)
        profile_row = await self.get_profile_by_id_or_404(candidate_id, profile_id, org_id)

        parsed_profile = CandidateProfileSchema.model_validate(profile_row.profile_json)
        flagged_paths = collect_low_confidence_paths(parsed_profile)

        # Check that flagged items have at least one review event recorded
        if flagged_paths:
            # Check review events in DB
            from sqlalchemy import select

            stmt = select(ReviewEvent.field_path).where(
                ReviewEvent.profile_id == profile_id,
                ReviewEvent.org_id == org_id,
            )
            res = await self.repo.session.execute(stmt)
            reviewed_paths = set(res.scalars().all())
            unreviewed = [p for p in flagged_paths if p not in reviewed_paths]

            if unreviewed:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "message": (
                            f"{len(unreviewed)} field(s) have confidence below "
                            f"{REVIEW_CONFIDENCE_THRESHOLD} and have not been reviewed."
                        ),
                        "unreviewed_paths": unreviewed,
                    },
                )

        now = datetime.now(UTC)
        profile_row.extraction_status = "approved"
        profile_row.reviewed_by = user_id
        profile_row.approved_at = now
        candidate.master_profile_id = profile_row.id

        await self.repo.session.commit()
        await self.repo.session.refresh(profile_row)
        return profile_row
