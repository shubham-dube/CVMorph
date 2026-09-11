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
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import AdminUser, CurrentUser, ScopedDB
from app.models import (
    Candidate,
    CandidateProfile as CandidateProfileModel,
    ReviewEvent,
    User,
)
from app.schemas.candidate_profile import CandidateProfile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/candidates")

REVIEW_CONFIDENCE_THRESHOLD = 0.85


# ── Response schemas ──────────────────────────────────────────────────────────


class CandidateResponse(BaseModel):
    id: str
    org_id: str
    name: str
    role_title: str | None = None
    extraction_status: str | None = None
    profiles_count: int = 1
    master_profile_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CandidateProfileSummary(BaseModel):
    id: str
    candidate_id: str
    title: str
    target_role: str | None = None
    bluff_level: str | None = "none"
    extraction_status: str
    overall_confidence: float | None = None
    parent_profile_id: str | None = None
    is_master: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CandidateProfilesListResponse(BaseModel):
    items: list[CandidateProfileSummary]
    total: int


class UpdateProfileTitleRequest(BaseModel):
    title: str


class CloneProfileRequest(BaseModel):
    title: str
    base_profile_id: str | None = None
    target_role: str | None = None
    job_description: str | None = None
    custom_prompt: str | None = None
    bluff_level: str | None = "none"


class TailorProfileRequest(BaseModel):
    title: str
    target_role: str | None = None
    job_description: str
    custom_prompt: str | None = None
    bluff_level: str = "medium"  # none | low | medium | high
    base_profile_id: str | None = None


class CreateCandidateFromTextRequest(BaseModel):
    name: str | None = None
    full_name: str | None = None
    role_title: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    raw_text: str
    instructions: str | None = None
    target_role: str | None = None
    job_description: str | None = None
    bluff_level: str | None = "none"
    custom_prompt: str | None = None


class CandidateListResponse(BaseModel):
    items: list[CandidateResponse]
    total: int
    page: int
    page_size: int


class CreateCandidateRequest(BaseModel):
    name: str | None = None
    full_name: str | None = None


class ProfileResponse(BaseModel):
    profile_id: str
    candidate_id: str
    title: str = "Primary Profile"
    target_role: str | None = None
    bluff_level: str | None = "none"
    extraction_status: str
    overall_confidence: float | None
    extraction_model: str | None
    approved_at: datetime | None
    parent_profile_id: str | None = None
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


class AgentEditRequest(BaseModel):
    prompt: str
    conversation_history: list[dict[str, Any]] = []


class AgentEditResponse(BaseModel):
    reply: str
    changes_summary: list[str] = []
    profile_id: str
    candidate_id: str
    profile: CandidateProfile


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


async def _get_profile_by_id_or_404(
    candidate_id: str, profile_id: str, org_id: str, db: AsyncSession
) -> CandidateProfileModel:
    result = await db.execute(
        select(CandidateProfileModel).where(
            CandidateProfileModel.id == profile_id,
            CandidateProfileModel.candidate_id == candidate_id,
            CandidateProfileModel.org_id == org_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile {profile_id} not found for this candidate",
        )
    return profile


def _build_profile_response(
    profile_row: CandidateProfileModel,
    candidate_id: str,
    profile_obj: CandidateProfile | None = None,
) -> ProfileResponse:
    obj = profile_obj or CandidateProfile.model_validate(profile_row.profile_json)
    return ProfileResponse(
        profile_id=profile_row.id,
        candidate_id=candidate_id,
        title=getattr(profile_row, "title", None) or "Primary Profile",
        target_role=getattr(profile_row, "target_role", None),
        bluff_level=getattr(profile_row, "bluff_level", None) or "none",
        extraction_status=profile_row.extraction_status,
        overall_confidence=float(profile_row.overall_confidence) if profile_row.overall_confidence else None,
        extraction_model=profile_row.extraction_model,
        approved_at=profile_row.approved_at,
        parent_profile_id=getattr(profile_row, "parent_profile_id", None),
        profile=obj,
    )


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

    items: list[CandidateResponse] = []
    for c in candidates:
        cr = CandidateResponse.model_validate(c)
        prof_res = await db.execute(
            select(CandidateProfileModel.profile_json, CandidateProfileModel.extraction_status)
            .where(CandidateProfileModel.candidate_id == c.id)
            .order_by(CandidateProfileModel.created_at.desc())
            .limit(1)
        )
        prof_row = prof_res.first()
        if prof_row:
            p_json, ext_status = prof_row
            cr.extraction_status = ext_status
            if isinstance(p_json, dict) and "candidate" in p_json:
                cr.role_title = p_json["candidate"].get("role_title")

        # Profile count for candidate
        cnt_res = await db.execute(
            select(func.count(CandidateProfileModel.id)).where(
                CandidateProfileModel.candidate_id == c.id,
                CandidateProfileModel.org_id == user.org_id,
            )
        )
        cr.profiles_count = cnt_res.scalar_one() or 1
        items.append(cr)

    return CandidateListResponse(
        items=items,
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
    candidate_name = (body.full_name or body.name or "").strip()
    if not candidate_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Candidate name is required",
        )
    candidate = Candidate(
        org_id=user.org_id,
        name=candidate_name,
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
        "Returns the canonical profile (optionally by profile_id). If not specified, returns the latest."
    ),
)
async def get_profile(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
    profile_id: str | None = Query(None, description="Optional specific profile ID"),
) -> ProfileResponse:
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    if profile_id:
        profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)
    else:
        profile_row = None
        if candidate.master_profile_id:
            res = await db.execute(
                select(CandidateProfileModel).where(
                    CandidateProfileModel.id == candidate.master_profile_id,
                    CandidateProfileModel.candidate_id == candidate_id,
                    CandidateProfileModel.org_id == user.org_id,
                )
            )
            profile_row = res.scalar_one_or_none()
        if not profile_row:
            profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    return _build_profile_response(profile_row, candidate_id)


@router.get(
    "/{candidate_id}/profiles",
    response_model=CandidateProfilesListResponse,
    summary="List all profiles for a candidate",
)
async def list_candidate_profiles(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> CandidateProfilesListResponse:
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    result = await db.execute(
        select(CandidateProfileModel)
        .where(
            CandidateProfileModel.candidate_id == candidate_id,
            CandidateProfileModel.org_id == user.org_id,
        )
        .order_by(CandidateProfileModel.created_at.asc())
    )
    profiles = result.scalars().all()
    items: list[CandidateProfileSummary] = []
    for i, p in enumerate(profiles):
        is_master = (candidate.master_profile_id == p.id) or (candidate.master_profile_id is None and i == 0)
        items.append(
            CandidateProfileSummary(
                id=p.id,
                candidate_id=p.candidate_id,
                title=getattr(p, "title", None) or "Primary Profile",
                target_role=getattr(p, "target_role", None),
                bluff_level=getattr(p, "bluff_level", None) or "none",
                extraction_status=p.extraction_status,
                overall_confidence=float(p.overall_confidence) if p.overall_confidence else None,
                parent_profile_id=getattr(p, "parent_profile_id", None),
                is_master=is_master,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return CandidateProfilesListResponse(items=items, total=len(items))


@router.get(
    "/{candidate_id}/profiles/{profile_id}",
    response_model=ProfileResponse,
    summary="Get a specific profile",
)
async def get_profile_by_id(
    candidate_id: str,
    profile_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> ProfileResponse:
    await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)
    return _build_profile_response(profile_row, candidate_id)


@router.patch(
    "/{candidate_id}/profiles/{profile_id}/title",
    response_model=CandidateProfileSummary,
    summary="Update profile title",
)
async def update_profile_title(
    candidate_id: str,
    profile_id: str,
    body: UpdateProfileTitleRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> CandidateProfileSummary:
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)
    new_title = body.title.strip()
    if not new_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Profile title cannot be empty",
        )

    profile_row.title = new_title
    await db.commit()

    return CandidateProfileSummary(
        id=profile_row.id,
        candidate_id=profile_row.candidate_id,
        title=profile_row.title,
        target_role=getattr(profile_row, "target_role", None),
        bluff_level=getattr(profile_row, "bluff_level", None) or "none",
        extraction_status=profile_row.extraction_status,
        overall_confidence=float(profile_row.overall_confidence) if profile_row.overall_confidence else None,
        parent_profile_id=getattr(profile_row, "parent_profile_id", None),
        is_master=(candidate.master_profile_id == profile_row.id),
        created_at=profile_row.created_at,
        updated_at=profile_row.updated_at,
    )


@router.patch(
    "/{candidate_id}/profiles/{profile_id}/set-master",
    response_model=CandidateProfileSummary,
    summary="Set profile as master/default profile",
)
async def set_master_profile(
    candidate_id: str,
    profile_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> CandidateProfileSummary:
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)

    candidate.master_profile_id = profile_row.id
    await db.commit()

    return CandidateProfileSummary(
        id=profile_row.id,
        candidate_id=profile_row.candidate_id,
        title=getattr(profile_row, "title", None) or "Primary Profile",
        target_role=getattr(profile_row, "target_role", None),
        bluff_level=getattr(profile_row, "bluff_level", None) or "none",
        extraction_status=profile_row.extraction_status,
        overall_confidence=float(profile_row.overall_confidence) if profile_row.overall_confidence else None,
        parent_profile_id=getattr(profile_row, "parent_profile_id", None),
        is_master=True,
        created_at=profile_row.created_at,
        updated_at=profile_row.updated_at,
    )


@router.post(
    "/{candidate_id}/profiles/clone",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Clone profile into a new titled version",
)
async def clone_profile(
    candidate_id: str,
    body: CloneProfileRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> ProfileResponse:
    import copy

    await _get_candidate_or_404(candidate_id, user.org_id, db)
    base_profile = None
    if body.base_profile_id:
        base_profile = await _get_profile_by_id_or_404(candidate_id, body.base_profile_id, user.org_id, db)
    else:
        base_profile = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    cloned_json = copy.deepcopy(base_profile.profile_json)
    new_title = body.title.strip() or f"{getattr(base_profile, 'title', 'Profile')} (Copy)"
    target_role = body.target_role or getattr(base_profile, "target_role", None)

    if target_role and isinstance(cloned_json, dict) and "candidate" in cloned_json:
        cloned_json["candidate"]["role_title"] = target_role

    new_profile = CandidateProfileModel(
        org_id=user.org_id,
        candidate_id=candidate_id,
        source_document_id=base_profile.source_document_id,
        parent_profile_id=base_profile.id,
        title=new_title,
        target_role=target_role,
        job_description=body.job_description,
        custom_prompt=body.custom_prompt,
        bluff_level=body.bluff_level or "none",
        profile_json=cloned_json,
        extraction_status="ready_for_review",
        extraction_model=base_profile.extraction_model,
        extraction_version=base_profile.extraction_version,
        overall_confidence=base_profile.overall_confidence,
    )
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_profile)

    return _build_profile_response(new_profile, candidate_id)


@router.post(
    "/{candidate_id}/profiles/tailor",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tailor profile against a Job Description",
    description="Uses Gemini to generate a tailored profile matching the JD with controlled bluff level.",
)
async def tailor_candidate_profile(
    candidate_id: str,
    body: TailorProfileRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> ProfileResponse:
    from app.services.extraction.tailoring_service import ProfileTailoringService

    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    base_profile_row = None
    if body.base_profile_id:
        base_profile_row = await _get_profile_by_id_or_404(candidate_id, body.base_profile_id, user.org_id, db)
    else:
        base_profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    base_candidate_profile = CandidateProfile.model_validate(base_profile_row.profile_json)

    service = ProfileTailoringService()
    tailored_candidate_profile = await service.tailor(
        base_profile=base_candidate_profile,
        job_description=body.job_description,
        custom_prompt=body.custom_prompt,
        bluff_level=body.bluff_level,
        target_role=body.target_role,
        org_id=user.org_id,
        candidate_id=candidate_id,
        source_document_id=base_profile_row.source_document_id,
    )

    new_title = body.title.strip() or f"{getattr(base_profile_row, 'title', 'Profile')} (Tailored)"
    tailored_json = tailored_candidate_profile.model_dump(mode="json")

    new_profile = CandidateProfileModel(
        org_id=user.org_id,
        candidate_id=candidate_id,
        source_document_id=base_profile_row.source_document_id,
        parent_profile_id=base_profile_row.id,
        title=new_title,
        target_role=body.target_role or getattr(base_profile_row, "target_role", None),
        job_description=body.job_description,
        custom_prompt=body.custom_prompt,
        bluff_level=body.bluff_level,
        profile_json=tailored_json,
        extraction_status="ready_for_review",
        extraction_model=tailored_candidate_profile.meta.extraction_model,
        extraction_version=tailored_candidate_profile.meta.extraction_version,
        overall_confidence=tailored_candidate_profile.meta.overall_confidence,
    )
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_profile)

    return _build_profile_response(new_profile, candidate_id, tailored_candidate_profile)


@router.post(
    "/from-text",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create candidate and profile from text",
    description="Creates candidate and generates their initial profile from raw text without file upload.",
)
async def create_candidate_from_text(
    body: CreateCandidateFromTextRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> ProfileResponse:
    from app.services.extraction.provider_factory import get_provider

    candidate_name = (body.full_name or body.name or "").strip()
    if not candidate_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Candidate name is required",
        )
    if not body.raw_text or not body.raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CV text content is required",
        )

    # 1. Create candidate record
    candidate = Candidate(
        org_id=user.org_id,
        name=candidate_name,
    )
    db.add(candidate)
    await db.flush()

    # 2. Build extraction instructions
    effective_role = (body.target_role or body.role_title or "").strip() or None
    instructions_parts: list[str] = []
    if effective_role:
        instructions_parts.append(f"Target Role: {effective_role}")
    if body.email and body.email.strip():
        instructions_parts.append(f"Candidate Email: {body.email.strip()}")
    if body.phone and body.phone.strip():
        instructions_parts.append(f"Candidate Phone: {body.phone.strip()}")
    if body.location and body.location.strip():
        instructions_parts.append(f"Candidate Location: {body.location.strip()}")
    if body.instructions and body.instructions.strip():
        instructions_parts.append(body.instructions.strip())
    if body.custom_prompt and body.custom_prompt.strip():
        instructions_parts.append(body.custom_prompt.strip())

    instructions = "\n".join(instructions_parts) if instructions_parts else None

    # Run extraction via AI provider
    provider = get_provider()
    extracted_profile = await provider.extract(
        raw_text=body.raw_text.strip(),
        org_id=user.org_id,
        candidate_id=candidate.id,
        source_document_id="text_input",
        instructions=instructions,
    )

    # Ensure explicitly provided basic candidate info overrides or backfills extracted data
    extracted_profile.candidate.full_name = candidate_name
    if effective_role:
        extracted_profile.candidate.role_title = effective_role
    if body.email and body.email.strip():
        extracted_profile.candidate.email = body.email.strip()
    if body.phone and body.phone.strip():
        extracted_profile.candidate.phone = body.phone.strip()
    if body.location and body.location.strip():
        extracted_profile.candidate.location = body.location.strip()

    # Optional JD Tailoring at creation time
    effective_bluff = body.bluff_level or "none"
    if body.job_description and body.job_description.strip():
        try:
            from app.services.extraction.tailoring_service import ProfileTailoringService
            tailor_service = ProfileTailoringService()
            extracted_profile = await tailor_service.tailor(
                base_profile=extracted_profile,
                job_description=body.job_description.strip(),
                custom_prompt=body.custom_prompt,
                bluff_level=effective_bluff,
                target_role=effective_role,
                org_id=user.org_id,
                candidate_id=candidate.id,
                source_document_id=None,
            )
            # Re-ensure explicit fields persist
            extracted_profile.candidate.full_name = candidate_name
            if effective_role:
                extracted_profile.candidate.role_title = effective_role
            if body.email and body.email.strip():
                extracted_profile.candidate.email = body.email.strip()
            if body.phone and body.phone.strip():
                extracted_profile.candidate.phone = body.phone.strip()
            if body.location and body.location.strip():
                extracted_profile.candidate.location = body.location.strip()
        except Exception as te:
            logger.warning("Tailoring failed during from-text creation: %s", te)

    profile_json = extracted_profile.model_dump(mode="json")

    # 3. Create CandidateProfile row (source_document_id is None)
    profile_row = CandidateProfileModel(
        org_id=user.org_id,
        candidate_id=candidate.id,
        source_document_id=None,
        title="Primary Profile",
        target_role=effective_role or extracted_profile.candidate.role_title,
        job_description=body.job_description.strip() if body.job_description else None,
        custom_prompt=body.custom_prompt.strip() if body.custom_prompt else None,
        bluff_level=effective_bluff,
        profile_json=profile_json,
        extraction_status="ready_for_review",
        extraction_model=extracted_profile.meta.extraction_model,
        extraction_version=extracted_profile.meta.extraction_version,
        overall_confidence=extracted_profile.meta.overall_confidence,
    )
    db.add(profile_row)
    await db.flush()

    candidate.master_profile_id = profile_row.id
    await db.commit()
    await db.refresh(profile_row)

    return _build_profile_response(profile_row, candidate.id, extracted_profile)


@router.delete(
    "/{candidate_id}/profiles/{profile_id}",
    summary="Delete a candidate profile",
)
async def delete_profile(
    candidate_id: str,
    profile_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> dict[str, str]:
    await _get_candidate_or_404(candidate_id, user.org_id, db)
    count_res = await db.execute(
        select(func.count(CandidateProfileModel.id)).where(
            CandidateProfileModel.candidate_id == candidate_id,
            CandidateProfileModel.org_id == user.org_id,
        )
    )
    count = count_res.scalar_one() or 0
    if count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the candidate's only profile. Each candidate must retain at least one profile.",
        )

    profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)
    await db.delete(profile_row)
    await db.commit()
    return {"status": "success", "message": "Profile deleted successfully"}


@router.patch(
    "/{candidate_id}/profiles/{profile_id}",
    response_model=ProfileResponse,
    summary="Edit a specific profile field",
)
async def patch_profile_by_id(
    candidate_id: str,
    profile_id: str,
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
    profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)

    # Write review event
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

    updated_json = body.profile.model_dump(mode="json")
    profile_row.profile_json = updated_json

    if body.profile.candidate and body.profile.candidate.full_name:
        cand_res = await db.execute(
            select(Candidate).where(Candidate.id == candidate_id, Candidate.org_id == user.org_id)
        )
        cand_obj = cand_res.scalar_one_or_none()
        if cand_obj:
            cand_obj.name = body.profile.candidate.full_name.strip()

    await db.commit()
    return _build_profile_response(profile_row, candidate_id, body.profile)


@router.post(
    "/{candidate_id}/profiles/{profile_id}/agent-edit",
    response_model=AgentEditResponse,
    summary="Ask in-studio AI Agent to edit/modify the profile",
    description="Processes natural language prompt via Gemini, updates canonical profile JSON in database, and returns updated profile with conversational explanation.",
)
async def agent_edit_candidate_profile(
    candidate_id: str,
    profile_id: str,
    body: AgentEditRequest,
    user: CurrentUser,
    db: ScopedDB,
) -> AgentEditResponse:
    from app.services.ai_agent.editing_agent import ProfileEditingAgentService
    from app.services.extraction.provider import ExtractionError

    prompt_text = body.prompt.strip()
    if not prompt_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Prompt cannot be empty",
        )

    await _get_candidate_or_404(candidate_id, user.org_id, db)
    profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)

    try:
        current_candidate_profile = CandidateProfile.model_validate(profile_row.profile_json)
    except Exception as exc:
        logger.error("Failed to parse candidate profile JSON for profile %s: %s", profile_id, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Stored profile data is invalid: {exc}",
        )

    try:
        service = ProfileEditingAgentService()
        updated_candidate_profile, reply, changes_summary = await service.execute_edit(
            current_profile=current_candidate_profile,
            prompt=prompt_text,
            conversation_history=body.conversation_history,
        )
    except ExtractionError as exc:
        logger.error("AI Agent extraction error for profile %s: %s", profile_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error during AI agent edit for profile %s: %s", profile_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI agent edit failed: {str(exc)}",
        )

    # Persist updated profile JSON
    profile_row.profile_json = updated_candidate_profile.model_dump(mode="json")
    if updated_candidate_profile.candidate and updated_candidate_profile.candidate.role_title:
        profile_row.target_role = updated_candidate_profile.candidate.role_title

    # If candidate name was changed, sync Candidate model
    if updated_candidate_profile.candidate and updated_candidate_profile.candidate.full_name:
        cand_res = await db.execute(
            select(Candidate).where(Candidate.id == candidate_id, Candidate.org_id == user.org_id)
        )
        cand_obj = cand_res.scalar_one_or_none()
        if cand_obj:
            cand_obj.name = updated_candidate_profile.candidate.full_name.strip()

    # Safely associate user_id if valid in DB
    event_user_id = None
    if user and getattr(user, "user_id", None):
        user_res = await db.execute(select(User.id).where(User.id == user.user_id))
        if user_res.scalar_one_or_none():
            event_user_id = user.user_id

    # Record ReviewEvent for audit trail
    event = ReviewEvent(
        org_id=user.org_id,
        profile_id=profile_row.id,
        field_path="ai_agent_edit",
        action="edit",
        old_value={"summary": f"Prior to edit: {prompt_text[:80]}"},
        new_value={"summary": reply, "changes": changes_summary},
        user_id=event_user_id,
    )
    db.add(event)

    await db.commit()
    await db.refresh(profile_row)

    return AgentEditResponse(
        reply=reply,
        changes_summary=changes_summary,
        profile_id=profile_row.id,
        candidate_id=candidate_id,
        profile=updated_candidate_profile,
    )


@router.patch(
    "/{candidate_id}/profile",
    response_model=ProfileResponse,
    summary="Edit a profile field (latest profile)",
)
async def patch_profile(
    candidate_id: str,
    body: PatchProfileRequest,
    user: CurrentUser,
    db: ScopedDB,
    profile_id: str | None = Query(None, description="Optional profile ID to patch"),
) -> ProfileResponse:
    if body.action not in ("confirm", "edit", "remove"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action '{body.action}'. Must be one of: confirm, edit, remove",
        )

    await _get_candidate_or_404(candidate_id, user.org_id, db)
    if profile_id:
        profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)
    else:
        profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

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

    # Also update candidate's name if edited in the profile
    if body.profile.candidate and body.profile.candidate.full_name:
        cand_res = await db.execute(
            select(Candidate).where(Candidate.id == candidate_id, Candidate.org_id == user.org_id)
        )
        cand_obj = cand_res.scalar_one_or_none()
        if cand_obj:
            cand_obj.name = body.profile.candidate.full_name.strip()

    await db.commit()

    return _build_profile_response(profile_row, candidate_id, body.profile)


async def _execute_profile_approval(
    candidate_id: str,
    profile_id: str | None,
    user: CurrentUser,
    db: AsyncSession,
) -> ApproveResponse:
    candidate = await _get_candidate_or_404(candidate_id, user.org_id, db)
    if profile_id:
        profile_row = await _get_profile_by_id_or_404(candidate_id, profile_id, user.org_id, db)
    else:
        profile_row = None
        if candidate.master_profile_id:
            res = await db.execute(
                select(CandidateProfileModel).where(
                    CandidateProfileModel.id == candidate.master_profile_id,
                    CandidateProfileModel.candidate_id == candidate_id,
                    CandidateProfileModel.org_id == user.org_id,
                )
            )
            profile_row = res.scalar_one_or_none()
        if not profile_row:
            profile_row = await _get_latest_profile_or_404(candidate_id, user.org_id, db)

    from datetime import datetime, timezone

    if profile_row.extraction_status == "approved":
        return ApproveResponse(
            status="approved",
            profile_id=profile_row.id,
            approved_at=profile_row.approved_at.isoformat() if profile_row.approved_at else datetime.now(tz=timezone.utc).isoformat(),
            message="This profile is already approved.",
        )

    # Get all low-confidence field paths
    profile = CandidateProfile.model_validate(profile_row.profile_json)
    flagged_paths = _collect_low_confidence_paths(profile)

    # Check low-confidence paths for warning message (do not block)
    warning_note = ""
    if flagged_paths:
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
            warning_note = f" Approved with {len(unreviewed)} low-confidence item(s) unreviewed."

    now = datetime.now(tz=timezone.utc)
    profile_row.extraction_status = "approved"
    profile_row.approved_at = now
    profile_row.reviewed_by = user.user_id

    # If candidate does not have a master profile yet, default to this approved one
    if not candidate.master_profile_id:
        candidate.master_profile_id = profile_row.id

    await db.commit()

    return ApproveResponse(
        status="approved",
        profile_id=profile_row.id,
        approved_at=now.isoformat(),
        message=f"Profile approved.{warning_note}",
    )


@router.post(
    "/{candidate_id}/profiles/{profile_id}/approve",
    response_model=ApproveResponse,
    summary="Approve a specific candidate profile",
    description="Marks the specific profile as approved, enabling CV generation.",
)
async def approve_specific_profile(
    candidate_id: str,
    profile_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> ApproveResponse:
    return await _execute_profile_approval(candidate_id, profile_id, user, db)


@router.post(
    "/{candidate_id}/profile/approve",
    response_model=ApproveResponse,
    summary="Approve the candidate profile",
    description=(
        "Marks the profile as approved, enabling CV generation.\n\n"
        "Optionally accepts profile_id query parameter to approve a specific profile version."
    ),
)
async def approve_profile(
    candidate_id: str,
    user: CurrentUser,
    db: ScopedDB,
    profile_id: str | None = Query(None, description="Optional profile ID to approve"),
) -> ApproveResponse:
    return await _execute_profile_approval(candidate_id, profile_id, user, db)


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
