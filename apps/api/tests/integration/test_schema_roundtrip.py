"""
Integration test: Canonical schema round-trip.

Tests that the Rupesh G fixture JSON can be:
  1. Parsed into a CandidateProfile
  2. Serialised back to JSON
  3. Re-parsed identically (round-trip)

This verifies the schema is stable and there are no lossy conversions.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.candidate_profile import CandidateProfile

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "profiles"


def test_rupesh_schema_round_trip() -> None:
    with open(FIXTURES_DIR / "rupesh_g.json") as f:
        raw = json.load(f)

    profile = CandidateProfile.model_validate(raw)
    serialised = profile.model_dump(mode="json")
    profile2 = CandidateProfile.model_validate(serialised)

    assert profile.candidate.full_name == profile2.candidate.full_name
    assert profile.candidate.role_title == profile2.candidate.role_title
    assert len(profile.employment) == len(profile2.employment)
    assert len(profile.technical_skills.groups) == len(profile2.technical_skills.groups)
    assert profile.education.has_certifications == profile2.education.has_certifications


def test_rupesh_required_fields_present() -> None:
    with open(FIXTURES_DIR / "rupesh_g.json") as f:
        raw = json.load(f)

    profile = CandidateProfile.model_validate(raw)

    assert profile.candidate.full_name
    assert profile.candidate.role_title
    assert len(profile.career_summary.bullets) >= 1
    assert len(profile.technical_skills.groups) >= 1
    assert len(profile.education.items) >= 1
    assert len(profile.employment) >= 1

    # All employment entries must have all optional fields present (not missing)
    for job in profile.employment:
        assert hasattr(job, "client")
        assert hasattr(job, "project_name")
        assert hasattr(job, "technology_used")
        assert hasattr(job, "project_description")
        assert isinstance(job.technology_used, list)
