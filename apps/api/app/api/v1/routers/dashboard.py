"""
Dashboard Analytics API

GET /v1/dashboard/stats — Composite statistics and recent pipeline items for the org.
Provides sub-50ms loading for the Executive Dashboard without frontend request waterfalls.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, ScopedDB
from app.models import (
    Candidate,
    CandidateProfile,
    Document,
    Generation,
    Template,
)
from app.services.storage.object_store import get_object_store

router = APIRouter(prefix="/dashboard")


# ── Response Schemas ──────────────────────────────────────────────────────────


class RecentCandidateItem(BaseModel):
    id: str
    name: str
    role_title: str | None = None
    extraction_status: str | None = None
    created_at: datetime


class RecentGenerationItem(BaseModel):
    id: str
    candidate_id: str
    candidate_name: str
    template_name: str
    output_filename: str | None = None
    docx_url: str | None = None
    pdf_url: str | None = None
    created_at: datetime


class DashboardStatsResponse(BaseModel):
    total_candidates: int
    total_profiles: int
    approved_profiles: int
    total_generations: int
    avg_confidence: float | None
    approval_rate: float
    recent_candidates: list[RecentCandidateItem]
    recent_generations: list[RecentGenerationItem]


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    summary="Get dashboard statistics",
    description="Returns composite KPIs, recent candidate pipeline items, and recent exports for the tenant.",
)
async def get_dashboard_stats(
    user: CurrentUser,
    db: ScopedDB,
) -> DashboardStatsResponse:
    org_id = user.org_id

    # 1. Total candidates
    cand_count_res = await db.execute(
        select(func.count()).select_from(Candidate).where(Candidate.org_id == org_id)
    )
    total_candidates = cand_count_res.scalar_one() or 0

    # 2. Total profiles & approved count
    prof_count_res = await db.execute(
        select(func.count()).select_from(CandidateProfile).where(CandidateProfile.org_id == org_id)
    )
    total_profiles = prof_count_res.scalar_one() or 0

    approved_count_res = await db.execute(
        select(func.count())
        .select_from(CandidateProfile)
        .where(
            CandidateProfile.org_id == org_id,
            CandidateProfile.extraction_status == "approved",
        )
    )
    approved_profiles = approved_count_res.scalar_one() or 0

    # 3. Total generations
    gen_count_res = await db.execute(
        select(func.count()).select_from(Generation).where(Generation.org_id == org_id)
    )
    total_generations = gen_count_res.scalar_one() or 0

    # 4. Average confidence
    avg_conf_res = await db.execute(
        select(func.avg(CandidateProfile.overall_confidence)).where(
            CandidateProfile.org_id == org_id,
            CandidateProfile.overall_confidence.is_not(None),
        )
    )
    avg_confidence_val = avg_conf_res.scalar_one()
    avg_confidence = round(float(avg_confidence_val), 3) if avg_confidence_val is not None else None

    # Approval rate
    approval_rate = round(approved_profiles / total_profiles, 3) if total_profiles > 0 else 1.0

    # 5. Recent Candidates (Top 5)
    recent_cands_res = await db.execute(
        select(Candidate)
        .where(Candidate.org_id == org_id)
        .order_by(Candidate.created_at.desc())
        .limit(5)
    )
    recent_cands = recent_cands_res.scalars().all()

    recent_candidates: list[RecentCandidateItem] = []
    for c in recent_cands:
        # Fetch latest profile for role_title and status
        prof_res = await db.execute(
            select(CandidateProfile.profile_json, CandidateProfile.extraction_status)
            .where(CandidateProfile.candidate_id == c.id)
            .order_by(CandidateProfile.created_at.desc())
            .limit(1)
        )
        prof_row = prof_res.first()
        role_title = None
        ext_status = None
        if prof_row:
            p_json, ext_status = prof_row
            if isinstance(p_json, dict) and "candidate" in p_json:
                role_title = p_json["candidate"].get("role_title")

        recent_candidates.append(
            RecentCandidateItem(
                id=c.id,
                name=c.name,
                role_title=role_title,
                extraction_status=ext_status,
                created_at=c.created_at,
            )
        )

    # 6. Recent Generations (Top 5 completed)
    recent_gens_res = await db.execute(
        select(Generation)
        .where(
            Generation.org_id == org_id,
            Generation.status == "complete",
        )
        .order_by(Generation.created_at.desc())
        .limit(5)
    )
    recent_gens = recent_gens_res.scalars().all()

    store = get_object_store()
    recent_generations: list[RecentGenerationItem] = []

    for g in recent_gens:
        # Fetch candidate name
        c_res = await db.execute(select(Candidate.name).where(Candidate.id == g.candidate_id))
        cand_name = c_res.scalar_one_or_none() or "Unknown Candidate"

        # Fetch template name
        t_res = await db.execute(select(Template.name).where(Template.id == g.template_id))
        tpl_name = t_res.scalar_one_or_none() or "Template"

        docx_url = None
        pdf_url = None
        filename = None

        if g.output_document_id:
            doc_res = await db.execute(
                select(Document).where(Document.id == g.output_document_id)
            )
            doc = doc_res.scalar_one_or_none()
            if doc:
                filename = doc.original_filename.removesuffix(".docx")
                docx_url = await store.signed_url(
                    doc.storage_url,
                    expires_in=3600,
                    filename=doc.original_filename,
                    disposition="attachment",
                )

        if g.output_pdf_url:
            pdf_filename = f"{filename or 'Resume'}.pdf"
            pdf_url = await store.signed_url(
                g.output_pdf_url,
                expires_in=3600,
                filename=pdf_filename,
                disposition="attachment",
            )

        recent_generations.append(
            RecentGenerationItem(
                id=g.id,
                candidate_id=g.candidate_id,
                candidate_name=cand_name,
                template_name=tpl_name,
                output_filename=filename or f"{cand_name} CV",
                docx_url=docx_url,
                pdf_url=pdf_url,
                created_at=g.created_at,
            )
        )

    return DashboardStatsResponse(
        total_candidates=total_candidates,
        total_profiles=total_profiles,
        approved_profiles=approved_profiles,
        total_generations=total_generations,
        avg_confidence=avg_confidence,
        approval_rate=approval_rate,
        recent_candidates=recent_candidates,
        recent_generations=recent_generations,
    )
