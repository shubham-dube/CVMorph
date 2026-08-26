"""
POST /v1/generations        — trigger generation: { candidate_id, template_id }
GET  /v1/generations/{id}  — poll status + get download URL

Epic 5.8 (render_task) + Epic 6 (end-to-end).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.v1.deps import CurrentUser, DBSession

router = APIRouter(prefix="/generations")


class GenerationRequest(BaseModel):
    candidate_id: str
    template_id: str
    formatting_instructions: str | None = None


class GenerationResponse(BaseModel):
    id: str
    status: str
    output_document_url: str | None = None


@router.post("", response_model=GenerationResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_generation(
    body: GenerationRequest,
    db: DBSession,
    user: CurrentUser,
) -> GenerationResponse:
    """
    Trigger CV generation for an approved candidate profile.

    Pre-conditions (enforced here):
      - candidate_id belongs to user.org_id
      - candidate's active profile has extraction_status == 'approved'
      - template_id belongs to user.org_id and is active

    Then: create generations row + enqueue render_task.
    """
    # TODO (Epic 5.8 / 6.1): validate preconditions, create row, enqueue render_task
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 5/6).",
    )


@router.get("/{generation_id}", response_model=GenerationResponse)
async def get_generation(
    generation_id: str,
    db: DBSession,
    user: CurrentUser,
) -> GenerationResponse:
    """Poll generation status. Returns a signed download URL when status == 'complete'."""
    # TODO (Epic 6.2): fetch row, assert org_id, if complete generate signed URL
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 6).",
    )
