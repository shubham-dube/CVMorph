"""
Unit tests for the post-extraction validator (services/extraction/validator.py).

Epic 3.5 — these should all pass once validator.py is implemented.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.candidate_profile import CandidateProfile
from app.services.extraction.validator import validate, REVIEW_CONFIDENCE_THRESHOLD

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "profiles"


def load_fixture(name: str) -> CandidateProfile:
    with open(FIXTURES_DIR / name) as f:
        return CandidateProfile.model_validate(json.load(f))


class TestValidatorOnRupeshFixture:
    def test_rupesh_profile_is_valid(self) -> None:
        profile = load_fixture("rupesh_g.json")
        result = validate(profile)
        assert result.is_valid, f"Validation errors: {result.errors}"

    def test_rupesh_has_no_certifications(self) -> None:
        profile = load_fixture("rupesh_g.json")
        assert profile.education.has_certifications is False

    def test_rupesh_current_job_has_no_end_date(self) -> None:
        profile = load_fixture("rupesh_g.json")
        current_jobs = [j for j in profile.employment if j.is_current]
        assert len(current_jobs) >= 1
        for job in current_jobs:
            assert job.end_date is None


class TestValidatorEdgeCases:
    def test_invalid_has_certifications_flag_fails(self) -> None:
        profile = load_fixture("rupesh_g.json")
        # Manually flip the flag to create an inconsistency
        profile.education.has_certifications = True
        result = validate(profile)
        assert not result.is_valid
        assert any("has_certifications" in e for e in result.errors)

    def test_current_job_with_end_date_fails(self) -> None:
        profile = load_fixture("rupesh_g.json")
        profile.employment[0].is_current = True
        profile.employment[0].end_date = "2024-12"
        result = validate(profile)
        assert not result.is_valid
        assert any("end_date" in e for e in result.errors)

    def test_missing_evidence_for_source_type_fails(self) -> None:
        profile = load_fixture("rupesh_g.json")
        # Remove evidence from a source-type bullet
        profile.career_summary.bullets[0].evidence = None
        profile.career_summary.bullets[0].source_type = "source"  # type: ignore
        result = validate(profile)
        assert not result.is_valid
        assert any("evidence" in e for e in result.errors)
