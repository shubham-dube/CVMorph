"""
POST   /v1/documents      — upload a CV (PDF or DOCX)
GET    /v1/documents/{id} — get document metadata + parse status

Epic 2 implementation lives here.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.api.v1.deps import CurrentUser, DBSession

router = APIRouter(prefix="/documents")

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class DocumentUploadResponse(BaseModel):
    document_id: str
    job_id: str
    status: str = "queued"


class DocumentResponse(BaseModel):
    id: str
    candidate_id: str
    original_filename: str
    parse_status: str
    extraction_instructions: str | None


@router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile,
    db: DBSession,
    user: CurrentUser,
    candidate_id: str | None = None,
    extraction_instructions: str | None = None,
) -> DocumentUploadResponse:
    """
    Upload a CV file (PDF or DOCX).

    Steps (Epic 2):
      1. Validate MIME type and file size.
      2. [TODO] Virus-scan the upload.
      3. [TODO] Store in object storage.
      4. [TODO] Create Document row in DB.
      5. [TODO] Enqueue parse_task Celery job.

    Returns document_id + job_id for polling via GET /v1/jobs/{job_id}.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}. Only PDF and DOCX are accepted.",
        )

    # TODO (Epic 2.1): read file, size-check, virus-scan, store, create DB row, enqueue job
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Document upload pipeline not yet implemented (Epic 2).",
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: DBSession,
    user: CurrentUser,
) -> DocumentResponse:
    """Get document metadata and current parse status."""
    # TODO (Epic 2.1): fetch from DB, assert org_id matches user.org_id
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Not yet implemented (Epic 2).",
    )
