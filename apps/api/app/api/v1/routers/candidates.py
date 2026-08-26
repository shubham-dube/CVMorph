"""
Candidates + Profile Review API

GET    /v1/candidates              — list candidates for the org (paginated)
POST   /v1/candidates              — create a new candidate
GET    /v1/candidates/{id}         — get a candidate record
GET    /v1/candidates/{id}/profile — get the current canonical profile
PATCH  /v1/candidates/{id}/profile — recruiter edits (writes review_events)
POST   /v1/candidates/{id}/profile/approve — approve, unlock generation
GET    /v1/candidates/{id}/profile/review-events — audit log for the review session

Design notes:
  - Profile is stored as a JSON blob — the PATCH endpoint accepts the full updated
    CandidateProfile and diffs against the stored version to create ReviewEvent records.
  - Approval gate: all fields with confidence < 0.85 must have at least one ReviewEvent
    before approval is allowed. Returns 422 with the list of unapproved paths if not.
  - All operations are scoped to user.org_id at both the application layer AND via RLS.
"""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import AdminUser, CurrentUser, ScopedDB
from app.models import (
    Candidate,
    CandidateProfile as CandidateProfileModel,
    ReviewEvent,
)
from app.schemas.candidate_profile import CandidateProfile

router = APIRouter(prefix="/candidates")

REVIEW_CONFIDENCE_THRESHOLD = 0.85


# ── Response schemas ──────────────────────────────────────────────────────────


class CandidateResponse(BaseModel):
    id: str
    org_id: str
    name: str
    master_profile_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CandidateListResponse(BaseModel):
    items: list[CandidateResponse]
    total: int
    page: int
    page_size: int


class CreateCandidateRequest(BaseModel):
    name: str


class ProfileResponse(BaseModel):
    profile_id: str
    candidate_id: str
    extraction_status: str
    overall_confidence: float | None
    extraction_model: str | None
    approved_at: datetime | None
    profile: CandidateProfile


class PatchProfileRequest(BaseModel):
    """
    Field-level edit from the review UI.
    `field_path` uses dot notation: e.g. "career_summary.bullets.0.text"
    `action`: confirm | edit | remove
    `new_value`: the new field value (any JSON-serialisable type), required for 'edit'
    `profile`: the full updated CandidateProfile after the edit

    We store the full profile blob post-edit AND the individual field event for the audit trail.
    """

    field_path: str
    action: str  # confirm | edit | remove
    old_value: object | None = None
    new_value: object | None = None
    profile: CandidateProfile


class ReviewEventResponse(BaseModel):
    id: str
    field_path: str
    action: str
    old_value: object | None
    new_value: object | None
    user_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApproveResponse(BaseModel):
    status: str
    profile_id: str
    approved_at: str
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _get_candidate_or_404(
    candidate_id: str, org_id: str, db: AsyncSession
) -> Candidate:
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id,
            Candidate.org_id == org_id,
        )
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return candidate


async def _get_latest_profile_or_404(
    candidate_id: str, org_id: str, db: AsyncSession
) -> CandidateProfileModel:
    result = await db.execute(
        select(CandidateProfileModel)
        .where(
            CandidateProfileModel.candidate_id == candidate_id,
            CandidateProfileModel.org_id == org_id,
        )
        .order_by(CandidateProfileModel.created_at.desc())
        .limit(1)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found for this candidate. Upload a CV to create one.",
        )
    return profile


def _collect_low_confidence_paths(profile: CandidateProfile) -> list[str]:
    """
    Collect all field paths in the profile that are below the review threshold.
    These must all have at least one ReviewEvent before approval is allowed.
    """
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


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=CandidateListResponse,
    summary="List candidates",
    description="Returns all candidates for the authenticated org, newest first. Paginated.",
)
async def list_candidates(
    user: CurrentUser,
    db: ScopedDB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, description="Filter by name (partial match)"),
) -> CandidateListResponse:
    query = select(Candidate).where(Candidate.org_id == user.org_id)

    if search:
        query = query.where(Candidate.name.ilike(f"%{search}%"))

    # Total count
    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    # Paginated results
    result = await db.execute(
        query.order_by(Candidate.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    candidates = result.scalars().all()

    return CandidateListResponse(
        items=[CandidateResponse.model_validate(c) for c in candidates],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    response_model=CandidateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create candidate",
    description=(
        "Creates a candidate record. Normally this is done automatically by the "
        "document upload endpoint. Use this endpoint to pre-register a candidate "
        "before uploading their CV."
    ),
)
async def create_candidate(
    body: CreateCandidateRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> CandidateResponse:
    candidate = Candidate(
        org_id=user.org_id,
        name=body.name,
    )
    db.add(candidate)
    await db.flush()  # get the id before commit
    return CandidateResponse.model_validate(candidate)


@router.get(
    "/{candidate_id}",
    response_model=CandidateResponse,
    summary="Get candidate",
)
async def get_candidate(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> CandidateResponse:
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    return CandidateResponse.model_validate(candidate)


@router.get(
    "/{candidate_id}/profile",
    response_model=ProfileResponse,
    summary="Get candidate profile",
    description=(
        "Returns the most recently extracted Canonical Candidate Profile. "
        "The profile is the structured JSON output of the AI extraction step. "
        "If no profile exists yet (upload not complete), returns 404."
    ),
)
async def get_profile(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> ProfileResponse:
    await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    return ProfileResponse(
        profile_id=profile_row.id,
        candidate_id=candidate_id,
        extraction_status=profile_row.extraction_status,
        overall_confidence=float(profile_row.overall_confidence) if profile_row.overall_confidence else None,
        extraction_model=profile_row.extraction_model,
        approved_at=profile_row.approved_at,
        profile=CandidateProfile.model_validate(profile_row.profile_json),
    )


@router.patch(
    "/{candidate_id}/profile",
    response_model=ProfileResponse,
    summary="Edit a profile field",
    description=(
        "Recruiter field edit. Writes a ReviewEvent to the audit log, then updates "
        "the profile JSON blob. The full updated profile must be included in the request.\n\n"
        "**field_path** uses dot notation with zero-based list indices:\n"
        "- `career_summary.bullets.0.text`\n"
        "- `employment.1.responsibilities.0.text`\n"
        "- `technical_skills.groups.2`\n\n"
        "**action**: `confirm` (no change, just acknowledged), `edit` (value changed), "
        "`remove` (field/item deleted)."
    ),
)
async def patch_profile(
    candidate_id: str,
    body: PatchProfileRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> ProfileResponse:
    if body.action not in ("confirm", "edit", "remove"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action '{body.action}'. Must be one of: confirm, edit, remove",
        )

    await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    if profile_row.extraction_status == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile is already approved. Create a new generation to make further changes.",
        )

    # Write the review event (immutable audit trail)
    event = ReviewEvent(
        org_id=user.org_id,
        profile_id=profile_row.id,
        field_path=body.field_path,
        action=body.action,
        old_value=body.old_value if isinstance(body.old_value, dict) else {"value": body.old_value},
        new_value=body.new_value if isinstance(body.new_value, dict) else {"value": body.new_value},
        user_id=user.user_id,
    )
    db.add(event)

    # Update the profile JSON blob with the recruiter's full edited version
    updated_json = body.profile.model_dump(mode="json")
    profile_row.profile_json = updated_json

    await db.flush()

    return ProfileResponse(
        profile_id=profile_row.id,
        candidate_id=candidate_id,
        extraction_status=profile_row.extraction_status,
        overall_confidence=float(profile_row.overall_confidence) if profile_row.overall_confidence else None,
        extraction_model=profile_row.extraction_model,
        approved_at=profile_row.approved_at,
        profile=body.profile,
    )


@router.post(
    "/{candidate_id}/profile/approve",
    response_model=ApproveResponse,
    summary="Approve the candidate profile",
    description=(
        "Marks the profile as approved, enabling CV generation.\n\n"
        "**Pre-conditions (enforced here):**\n"
        "- All fields with confidence < 0.85 must have been explicitly confirmed, "
        "edited, or removed (i.e. have at least one ReviewEvent record).\n"
        "- If any low-confidence fields are unreviewed, returns HTTP 422 with the "
        "list of field paths that need attention."
    ),
)
async def approve_profile(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> ApproveResponse:
    await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    if profile_row.extraction_status == "approved":
        return ApproveResponse(
            status="approved",
            profile_id=profile_row.id,
            approved_at=profile_row.approved_at.isoformat(),
            message="Profile was already approved.",
        )

    # Get all low-confidence field paths
    profile = CandidateProfile.model_validate(profile_row.profile_json)
    flagged_paths = _collect_low_confidence_paths(profile)

    if flagged_paths:
        # Check which ones have been reviewed
        reviewed_result = await db.execute(
            select(ReviewEvent.field_path)
            .where(
                ReviewEvent.profile_id == profile_row.id,
                ReviewEvent.field_path.in_(flagged_paths),
            )
            .distinct()
        )
        reviewed_paths = {row[0] for row in reviewed_result.all()}
        unreviewed = [p for p in flagged_paths if p not in reviewed_paths]

        if unreviewed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "Some low-confidence fields have not been reviewed.",
                    "unreviewed_paths": unreviewed,
                    "tip": "Confirm, edit, or remove each field listed above, then retry approval.",
                },
            )

    from datetime import datetime, timezone

    now = datetime.now(tz=timezone.utc)
    profile_row.extraction_status = "approved"
    profile_row.approved_at = now
    profile_row.reviewed_by = user.user_id

    # Update master_profile_id on the Candidate to point to this profile
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    candidate.master_profile_id = profile_row.id

    await db.flush()

    return ApproveResponse(
        status="approved",
        profile_id=profile_row.id,
        approved_at=now.isoformat(),
        message="Profile approved. You can now generate a formatted CV.",
    )


@router.get(
    "/{candidate_id}/profile/review-events",
    response_model=list[ReviewEventResponse],
    summary="Get review audit log",
    description="Returns all ReviewEvents for the candidate's current profile, in chronological order.",
)
async def get_review_events(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> list[ReviewEventResponse]:
    await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    result = await db.execute(
        select(ReviewEvent)
        .where(ReviewEvent.profile_id == profile_row.id)
        .order_by(ReviewEvent.created_at.asc())
    )
    events = result.scalars().all()
    return [ReviewEventResponse.model_validate(e) for e in events]
