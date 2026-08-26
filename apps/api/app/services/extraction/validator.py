"""
Post-extraction validator — enforces the "never invent" guarantee.

Called by extract_task.py after the AI returns a CandidateProfile.
If validation fails, the task retries extraction once, then marks the job as failed.

Epic 3.5 implementation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.schemas.candidate_profile import CandidateProfile, SourceType

logger = logging.getLogger(__name__)

REVIEW_CONFIDENCE_THRESHOLD = 0.85  # fields below this need recruiter review


@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[str]
    warnings: list[str]


def validate(profile: CandidateProfile) -> ValidationResult:
    """
    Run post-extraction validation checks.

    Checks:
      1. overall_confidence in [0, 1].
      2. Any field with source_type != ai_generated must have non-null evidence.
      3. has_certifications is consistent with the items list.
      4. Employment entries with is_current=True have end_date=None.
      5. No employment entry has all responsibilities at confidence < 0.3 (likely hallucinated).
      6. Warns (does not fail) on any bullet with confidence < REVIEW_CONFIDENCE_THRESHOLD.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # 1 — overall_confidence range
    conf = profile.meta.overall_confidence
    if not (0.0 <= conf <= 1.0):
        errors.append(f"overall_confidence {conf} is out of range [0, 1]")

    # 2 — evidence required for non-ai_generated fields
    for i, bullet in enumerate(profile.career_summary.bullets):
        if bullet.source_type != SourceType.ai_generated and not bullet.evidence:
            errors.append(
                f"career_summary.bullets[{i}]: evidence is required for source_type={bullet.source_type}"
            )

    for gi, group in enumerate(profile.technical_skills.groups):
        if group.source_type != SourceType.ai_generated and not group.evidence:
            errors.append(
                f"technical_skills.groups[{gi}]: evidence required for source_type={group.source_type}"
            )

    for ei, edu in enumerate(profile.education.items):
        if edu.source_type != SourceType.ai_generated and not edu.evidence:
            errors.append(
                f"education.items[{ei}]: evidence required for source_type={edu.source_type}"
            )

    for ji, job in enumerate(profile.employment):
        for ri, resp in enumerate(job.responsibilities):
            if resp.source_type != SourceType.ai_generated and not resp.evidence:
                errors.append(
                    f"employment[{ji}].responsibilities[{ri}]: evidence required"
                )

    # 3 — has_certifications consistency
    actual_has_certs = any(
        item.type.value == "certification" for item in profile.education.items
    )
    if profile.education.has_certifications != actual_has_certs:
        errors.append(
            f"education.has_certifications={profile.education.has_certifications} "
            f"is inconsistent with items list (actual: {actual_has_certs})"
        )

    # 4 — current jobs should have no end_date
    for ji, job in enumerate(profile.employment):
        if job.is_current and job.end_date is not None:
            errors.append(
                f"employment[{ji}]: is_current=True but end_date={job.end_date!r} is set"
            )

    # 5 — all responsibilities very low confidence → likely hallucination
    for ji, job in enumerate(profile.employment):
        if job.responsibilities:
            avg = sum(r.confidence for r in job.responsibilities) / len(job.responsibilities)
            if avg < 0.3:
                errors.append(
                    f"employment[{ji}]: all responsibilities have very low avg confidence "
                    f"({avg:.2f}) — possible hallucination, reject and retry."
                )

    # 6 — warnings for fields needing review
    for i, bullet in enumerate(profile.career_summary.bullets):
        if bullet.confidence < REVIEW_CONFIDENCE_THRESHOLD:
            warnings.append(f"career_summary.bullets[{i}] below review threshold ({bullet.confidence:.2f})")

    for ji, job in enumerate(profile.employment):
        if job.confidence < REVIEW_CONFIDENCE_THRESHOLD:
            warnings.append(f"employment[{ji}] (roll-up confidence {job.confidence:.2f}) needs review")

    is_valid = len(errors) == 0
    if not is_valid:
        logger.error("Profile validation failed with %d error(s): %s", len(errors), errors)
    if warnings:
        logger.info("Profile has %d warning(s) requiring recruiter review: %s", len(warnings), warnings)

    return ValidationResult(is_valid=is_valid, errors=errors, warnings=warnings)
