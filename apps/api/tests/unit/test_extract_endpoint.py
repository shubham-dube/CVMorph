"""Unit tests for POST /v1/cv/extract."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.routers.extract import router
from app.schemas.candidate_profile import (
    Candidate,
    CandidateProfile,
    CareerSummary,
    Education,
    EducationItem,
    EducationType,
    EmploymentEntry,
    Meta,
    SourceType,
    SummaryBullet,
    TechnicalSkills,
)

app = FastAPI()
app.include_router(router, prefix="/v1")
client = TestClient(app)


def _pdf_bytes(text: str) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _sample_profile() -> CandidateProfile:
    return CandidateProfile(
        meta=Meta(
            org_id="org-1",
            candidate_id="cand-1",
            source_document_id="doc-1",
            extraction_model="gemini-2.5-flash",
            extraction_version="v1",
            extraction_instructions=None,
            overall_confidence=0.9,
        ),
        candidate=Candidate(full_name="Jane Doe", role_title="Engineer"),
        career_summary=CareerSummary(
            bullets=[
                SummaryBullet(
                    text="Engineer with **10+ years** experience.",
                    confidence=0.9,
                    source_type=SourceType.verified_transformation,
                    evidence="10+ years experience",
                )
            ]
        ),
        technical_skills=TechnicalSkills(groups=[]),
        education=Education(
            has_certifications=False,
            items=[
                EducationItem(
                    type=EducationType.degree,
                    text="B.E. Computer Science",
                    confidence=0.95,
                    source_type=SourceType.source,
                    evidence="B.E. Computer Science",
                )
            ],
        ),
        employment=[
            EmploymentEntry(
                company="Acme",
                role="Engineer",
                duration_display="Jan/2020 - Present",
                is_current=True,
                responsibilities=[],
                confidence=0.9,
            )
        ],
    )


def test_rejects_txt_upload() -> None:
    response = client.post(
        "/v1/cv/extract",
        files={"file": ("cv.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert "pdf" in response.json()["detail"].lower()


def test_rejects_empty_file() -> None:
    response = client.post(
        "/v1/cv/extract",
        files={"file": ("cv.pdf", b"", "application/pdf")},
    )
    assert response.status_code == 400


def test_extract_returns_profile() -> None:
    profile = _sample_profile()
    mock_provider = AsyncMock()
    mock_provider.extract.return_value = profile

    with patch(
        "app.api.v1.routers.extract.get_provider", return_value=mock_provider
    ):
        response = client.post(
            "/v1/cv/extract",
            files={"file": ("cv.pdf", _pdf_bytes("Jane Doe Engineer"), "application/pdf")},
            data={"org_id": "org-1", "candidate_id": "cand-1"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["filename"] == "cv.pdf"
    assert body["profile"]["candidate"]["full_name"] == "Jane Doe"
    mock_provider.extract.assert_awaited_once()
