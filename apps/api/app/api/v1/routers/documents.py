"""
Documents API

POST   /v1/documents        — upload a CV (PDF or DOCX), enqueue parse + extract
GET    /v1/documents/{id}   — get document metadata + parse status

The upload endpoint is the entry point for the full pipeline:
  upload → parse_task (text extraction) → extract_task (Gemini AI) →
  CandidateProfile row created → recruiter review → approval → render_task → .docx output

All uploads are tenant-scoped via org_id from the JWT. The parse + extract jobs
run asynchronously — poll GET /v1/jobs/{job_id} for status, or watch
GET /v1/candidates/{id}/profile until extraction_status = 'ready_for_review'.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, ScopedDB
from app.models import Candidate, Document, UsageEvent
from app.services.storage.object_store import get_object_store
from app.workers.tasks.parse_task import run as parse_run

router = APIRouter(prefix="/documents")

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


# ── Response schemas ──────────────────────────────────────────────────────────


class DocumentUploadResponse(BaseModel):
    document_id: str
    candidate_id: str
    job_id: str
    status: str = "queued"
    message: str


class DocumentResponse(BaseModel):
    id: str
    org_id: str
    candidate_id: str
    type: str
    original_filename: str
    mime_type: str
    file_size_bytes: int | None
    parse_status: str
    extraction_instructions: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a CV",
    description=(
        "Upload a PDF or DOCX CV file. Returns a `document_id` and `job_id` immediately. "
        "The file is stored in object storage and a background job (parse → extract) is queued.\n\n"
        "**Polling:**\n"
        "- `GET /v1/jobs/{job_id}` for parse job status\n"
        "- `GET /v1/candidates/{candidate_id}/profile` — poll `extraction_status` until "
        "`ready_for_review`\n\n"
        "**Optional params:**\n"
        "- `candidate_id` — link to existing candidate, or a new one is auto-created\n"
        "- `extraction_instructions` — PRD §9.6 custom instructions for the AI (e.g. "
        "'treat company X as client', 'focus on Python skills')"
    ),
)
async def upload_document(
    file: UploadFile,
    user: CurrentUser,
    db: ScopedDB,
    candidate_id: str | None = Query(None, description="Existing candidate UUID to attach to"),
    extraction_instructions: str | None = Query(
        None,
        description="Recruiter instructions for the AI extraction step",
    ),
) -> DocumentUploadResponse:
    # ── Validate MIME type ────────────────────────────────────────────────────
    content_type = file.content_type or ""
    filename = file.filename or "upload"

    # Accept DOCX even if browser sends as octet-stream
    if content_type not in ALLOWED_MIME_TYPES:
        if filename.endswith(".docx"):
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif filename.endswith(".pdf"):
            content_type = "application/pdf"
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    f"Unsupported file type: {file.content_type!r}. "
                    "Only PDF and DOCX files are accepted."
                ),
            )

    # ── Read + size check ─────────────────────────────────────────────────────
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size {len(file_bytes):,} bytes exceeds the 10 MB limit.",
        )

    # ── Create or reuse candidate ─────────────────────────────────────────────
    if candidate_id:
        cand_result = await db.execute(
            select(Candidate).where(
                Candidate.id == candidate_id,
                Candidate.org_id == user.org_id,
            )
        )
        candidate = cand_result.scalar_one_or_none()
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate {candidate_id!r} not found in this org.",
            )
    else:
        # Auto-create candidate from filename (recruiter can rename later)
        candidate_name = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
        candidate = Candidate(
            id=str(uuid.uuid4()),
            org_id=user.org_id,
            name=candidate_name or "New Candidate",
        )
        db.add(candidate)
        await db.flush()

    # ── Store file in object storage ──────────────────────────────────────────
    doc_id = str(uuid.uuid4())
    storage_key = f"{user.org_id}/raw/{doc_id}/{filename}"
    store = get_object_store()
    await store.put(storage_key, file_bytes, content_type=content_type)

    # ── Create Document row ───────────────────────────────────────────────────
    doc = Document(
        id=doc_id,
        org_id=user.org_id,
        candidate_id=candidate.id,
        type="original",
        original_filename=filename,
        mime_type=content_type,
        storage_url=storage_key,
        file_size_bytes=len(file_bytes),
        extraction_instructions=extraction_instructions,
        parse_status="queued",
        uploaded_by=user.user_id,
    )
    db.add(doc)

    # ── Log upload usage event ────────────────────────────────────────────────
    db.add(
        UsageEvent(
            org_id=user.org_id,
            event_type="cv_uploaded",
            quantity=1,
            reference_id=doc_id,
        )
    )
    await db.flush()

    # ── Enqueue parse task (non-blocking) ─────────────────────────────────────
    job = parse_run.delay(doc_id, user.org_id)

    return DocumentUploadResponse(
        document_id=doc_id,
        candidate_id=candidate.id,
        job_id=job.id,
        status="queued",
        message=(
            f"CV '{filename}' uploaded successfully. "
            f"Parsing started. Poll GET /v1/jobs/{job.id} for status, "
            f"then GET /v1/candidates/{candidate.id}/profile when complete."
        ),
    )


@router.get(
    "",
    response_model=DocumentListResponse,
    summary="List documents",
    description="List all documents for the org or a specific candidate.",
)
async def list_documents(
    user: CurrentUser,
    db: ScopedDB,
    candidate_id: str | None = Query(None),
) -> DocumentListResponse:
    query = select(Document).where(Document.org_id == user.org_id)
    if candidate_id:
        query = query.where(Document.candidate_id == candidate_id)

    result = await db.execute(query.order_by(Document.created_at.desc()))
    docs = result.scalars().all()
    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in docs],
        total=len(docs),
    )


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document",
    description=(
        "Get document metadata and current parse status. "
        "Use this to check `parse_status` after uploading.\n\n"
        "**Parse status values:**\n"
        "`queued` → `parsing` → `parsed` → `extracting` → `extracted` | `failed`"
    ),
)
async def get_document(
    document_id: str,
    user: CurrentUser,
    db: ScopedDB,
) -> DocumentResponse:
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.org_id == user.org_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse.model_validate(doc)
