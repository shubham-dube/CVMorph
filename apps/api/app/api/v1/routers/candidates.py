"""
GET    /v1/candidates/{id}/profile  — get canonical candidate profile
PATCH  /v1/candidates/{id}/profile  — recruiter field edits (logs to review_events)
POST   /v1/candidates/{id}/profile/approve — approve profile, unlock generation

Epic 3.6 (extract_task wires extraction) + Epic 4 (review UI calls these).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.v1.deps import CurrentUser, DBSession
from app.schemas.candidate_profile import CandidateProfile

router = APIRouter(prefix="/candidates")


@router.get("/{candidate_id}/profile", response_model=CandidateProfile)
async def get_profile(
    candidate_id: str,
    db: DBSession,
    user: CurrentUser,
) -> CandidateProfile:
    """
    Return the current (most recently extracted) canonical profile for a candidate.

    Asserts org_id scoping — a user cannot fetch another org's candidate.
    """
    # TODO (Epic 3.6): fetch candidate_profiles row, assert org_id == user.org_id, return profile_json
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 3).",
    )


class ProfilePatchRequest(CandidateProfile):
    """
    Partial profile update from the review UI.
    The entire profile is re-validated on each PATCH — no partial-model trick needed
    since the profile is stored as a JSON blob anyway.
    """


@router.patch("/{candidate_id}/profile", response_model=CandidateProfile)
async def patch_profile(
    candidate_id: str,
    body: ProfilePatchRequest,
    db: DBSession,
    user: CurrentUser,
) -> CandidateProfile:
    """
    Recruiter field edit.

    For each changed field:
      1. Write a ReviewEvent row (field_path, action, old_value, new_value, user_id).
      2. Update the profile_json blob in candidate_profiles.
    """
    # TODO (Epic 4.4): diff incoming vs stored, write review_events, update profile_json
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 4).",
    )


@router.post("/{candidate_id}/profile/approve", status_code=status.HTTP_200_OK)
async def approve_profile(
    candidate_id: str,
    db: DBSession,
    user: CurrentUser,
) -> dict[str, str]:
    """
    Mark a profile as approved — sets extraction_status = 'approved', unlocks generation.

    Validation: all flagged fields (confidence < 0.85) must have at least one review_event.
    """
    # TODO (Epic 4.6): check all flagged fields reviewed, set approved_at + extraction_status
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 4).",
    )
