"""
Profile Tailoring Service — transforms a base CandidateProfile to align with a target Job Description
under a controlled Bluff Level slider (none, low, medium, high).

Uses Gemini with response_json_schema=ExtractedProfile so the output strictly adheres
to the canonical schema while marking any embellished/added bullet with source_type='extrapolated_bluff'.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from app.core.config import settings
from app.schemas.candidate_profile import (
    CandidateProfile,
    ExtractedProfile,
    Meta,
    SourceType,
)
from app.services.extraction.gemini_provider import _gemini_api_key
from app.services.extraction.provider import ExtractionError

logger = logging.getLogger(__name__)

BLUFF_GUIDELINES: dict[str, str] = {
    "none": (
        "BLUFF LEVEL: NONE (CONSERVATIVE / 0% BLUFF).\n"
        "- Ground ALL career summary bullets, skill groups, and employment responsibilities strictly to the candidate's existing factual history.\n"
        "- Do NOT invent or add any new tools, technologies, responsibilities, or impact metrics that are not already present in the base profile.\n"
        "- Reorder, re-prioritize, and rephrase existing points to emphasize relevance to the target job description.\n"
        "- Set source_type = 'tailored_enhancement' for reworded items, or keep 'source'.\n"
    ),
    "low": (
        "BLUFF LEVEL: LOW (REFINED / 15% BLUFF).\n"
        "- Rephrase existing achievements using terminology and keywords from the target job description.\n"
        "- Surface transferable skills and adjacent domain knowledge without fabricating major claims.\n"
        "- For any newly reworded bullet, set source_type = 'tailored_enhancement'.\n"
        "- If you subtly introduce a standard adjacent concept, set source_type = 'extrapolated_bluff' with evidence explaining the keyword alignment.\n"
    ),
    "medium": (
        "BLUFF LEVEL: MEDIUM (BALANCED / 35% BLUFF).\n"
        "- Strategically enhance bullet points to demonstrate stronger alignment with the job description.\n"
        "- You may expand the scope of candidate's past projects, suggest plausible impact metrics (e.g. latency, throughput, scale, cost efficiency), and bridge adjacent technologies common to their stack.\n"
        "- CRITICAL RULE: For EVERY single newly introduced claim, embellished metric, or adjacent skill, you MUST set source_type = 'extrapolated_bluff' and provide clear evidence detailing: 'Extrapolated based on JD requirement [X] at Medium bluff level.'\n"
    ),
    "high": (
        "BLUFF LEVEL: HIGH (AGGRESSIVE / 60% BLUFF).\n"
        "- Confidently reframe the candidate as an ideal senior/lead fit for the target role.\n"
        "- Fill technology stack gaps demanded by the job description that reasonably align with the candidate's engineering background.\n"
        "- Amplify ownership, architecture, and leadership impact across responsibilities.\n"
        "- CRITICAL RULE: For EVERY embellished point or newly bridged technology, you MUST set source_type = 'extrapolated_bluff' and provide explicit evidence explaining what was extrapolated and why. Recruiters rely on this to maintain review transparency.\n"
    ),
}


class ProfileTailoringService:
    def __init__(self) -> None:
        try:
            from google import genai
        except ImportError as exc:
            raise ExtractionError("google-genai is not installed. Run: pip install google-genai") from exc

        self._client = genai.Client(api_key=_gemini_api_key())
        self._model = settings.GEMINI_MODEL

    async def tailor(
        self,
        base_profile: CandidateProfile,
        job_description: str,
        custom_prompt: str | None = None,
        bluff_level: str = "medium",
        target_role: str | None = None,
        org_id: str | None = None,
        candidate_id: str | None = None,
        source_document_id: str | None = None,
    ) -> CandidateProfile:
        """
        Tailors a base CandidateProfile to align with a target Job Description
        under the requested bluff level.
        """
        from google.genai import types
        from google.genai.errors import APIError, ClientError

        bluff_key = bluff_level.lower().strip()
        if bluff_key not in BLUFF_GUIDELINES:
            bluff_key = "medium"

        bluff_instruction = BLUFF_GUIDELINES[bluff_key]
        role_instruction = f"TARGET ROLE: {target_role}\n" if target_role else ""
        custom_instruction = f"CUSTOM RECRUITER INSTRUCTIONS:\n{custom_prompt}\n" if custom_prompt else ""

        system_instruction = (
            "You are an expert executive resume tailoring engine. Your goal is to optimize a candidate's "
            "canonical CV profile to align with a target Job Description while strictly honoring the specified Bluff Level.\n\n"
            "PROVENANCE RULES:\n"
            "- source_type must be one of: 'source', 'verified_transformation', 'ai_generated', 'tailored_enhancement', 'extrapolated_bluff'.\n"
            "- If a bullet point is preserved directly: source_type = 'source'.\n"
            "- If a bullet point is reworded to match JD keywords while keeping original facts: source_type = 'tailored_enhancement'.\n"
            "- If a bullet point or skill introduces new tools, exaggerated scope, or synthesized metrics per the bluff level: "
            "source_type MUST BE 'extrapolated_bluff', and 'evidence' MUST explicitly state what was extrapolated and why.\n"
            "Never omit required fields from the output schema."
        )

        base_profile_json = base_profile.model_dump_json(indent=2)

        prompt = (
            f"{role_instruction}"
            f"{bluff_instruction}\n"
            f"{custom_instruction}\n"
            f"TARGET JOB DESCRIPTION:\n{job_description}\n\n"
            f"BASE CANDIDATE PROFILE JSON:\n{base_profile_json}\n\n"
            "Tailor the profile for this job description now according to the bluff level and instructions above."
        )

        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2 if bluff_key in ("none", "low") else 0.4,
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_json_schema=ExtractedProfile.model_json_schema(),
                ),
            )
        except ClientError as exc:
            raise ExtractionError(getattr(exc, "message", None) or str(exc)) from exc
        except APIError as exc:
            raise ExtractionError(getattr(exc, "message", None) or str(exc)) from exc

        if not response.text:
            raise ExtractionError("Gemini returned an empty tailoring response.")

        try:
            extracted = ExtractedProfile.model_validate(json.loads(response.text))
        except (json.JSONDecodeError, ValueError) as exc:
            raise ExtractionError(f"Gemini returned invalid JSON during tailoring: {exc}") from exc

        # If a target_role was explicitly provided, override candidate.role_title
        if target_role:
            extracted.candidate.role_title = target_role

        tailored_profile = CandidateProfile(
            meta=Meta(
                org_id=org_id or base_profile.meta.org_id,
                candidate_id=candidate_id or base_profile.meta.candidate_id,
                source_document_id=source_document_id or base_profile.meta.source_document_id,
                extraction_model=f"{self._model}-tailored-{bluff_key}",
                extraction_version=settings.AI_EXTRACTION_VERSION,
                extraction_instructions=custom_prompt or None,
                overall_confidence=extracted.overall_confidence or base_profile.meta.overall_confidence,
            ),
            candidate=extracted.candidate,
            career_summary=extracted.career_summary,
            technical_skills=extracted.technical_skills,
            education=extracted.education,
            employment=extracted.employment,
        )

        logger.info(
            "Successfully tailored profile for candidate %s at bluff level %s",
            tailored_profile.meta.candidate_id,
            bluff_key,
        )
        return tailored_profile
