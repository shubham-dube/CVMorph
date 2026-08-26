"""
POST /v1/cv/extract — upload a PDF or DOCX CV and receive a Canonical Candidate Profile.

Synchronous extraction (parse + Gemini in one request). No DB persistence.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.schemas.candidate_profile import CandidateProfile
from app.services.extraction.provider import (
    ExtractionAuthError,
    ExtractionError,
    get_provider,
)
from app.services.parsing.text_extractor import ParseError, SUPPORTED_SUFFIXES, extract_text

router = APIRouter(prefix="/cv")

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class ExtractResponse(BaseModel):
    success: bool = True
    filename: str
    profile: CandidateProfile


@router.post("/extract", response_model=ExtractResponse)
async def extract_cv(
    file: UploadFile = File(...),
    org_id: str = Form(""),
    candidate_id: str = Form(""),
    source_document_id: str = Form(""),
    extraction_instructions: str = Form(""),
) -> ExtractResponse:
    """
    Extract a structured Canonical Candidate Profile from a PDF or DOCX CV.

    Parses the file to text, then runs Gemini structured extraction.
    Optional form fields (org_id, candidate_id, source_document_id) are
    echoed into profile.meta; UUIDs are generated when they are omitted.
    """
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .pdf and .docx files are currently supported.",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 10 MB size limit.",
        )

    try:
        text = extract_text(filename, contents)
    except ParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No readable text found in CV. Scanned/image PDFs are not supported yet.",
        )

    try:
        provider = get_provider("gemini")
        profile = await provider.extract(
            raw_text=text,
            org_id=org_id,
            candidate_id=candidate_id,
            source_document_id=source_document_id,
            instructions=extraction_instructions or None,
        )
    except ExtractionAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except ExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return ExtractResponse(success=True, filename=filename, profile=profile)
