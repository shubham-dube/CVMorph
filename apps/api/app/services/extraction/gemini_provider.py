"""
Gemini AI provider — structured JSON extraction via google-genai.

Uses response_json_schema so the model is constrained to ExtractedProfile.
Backend-owned identifiers (org/candidate/document IDs) are attached after
the model returns, matching the demo extractor.

RULE: this is the only module outside google.genai that talks to Gemini.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path

from app.core.config import settings
from app.schemas.candidate_profile import CandidateProfile, ExtractedProfile, Meta
from app.services.extraction.provider import (
    AIProvider,
    ExtractionAuthError,
    ExtractionError,
)

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_PATH = (
    Path(__file__).parent / "prompts" / "gemini_system_prompt.md"
)
_PLACEHOLDER_KEYS = {"", "your_api_key_here", "sk-your-key", "REPLACE_ME"}


def _load_system_prompt() -> str:
    try:
        return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning(
            "Gemini system prompt not found at %s — using fallback.", _SYSTEM_PROMPT_PATH
        )
        return "You are a CV extraction engine. Convert the CV text into the provided JSON model. Do not invent facts."


def _gemini_api_key() -> str:
    value = (settings.GEMINI_API_KEY or "").strip()
    if value and value not in _PLACEHOLDER_KEYS:
        return value
    raise ExtractionError(
        "GEMINI_API_KEY is not configured. Add your Gemini API key to apps/api/.env."
    )


class GeminiProvider(AIProvider):
    def __init__(self) -> None:
        try:
            from google import genai
        except ImportError as exc:
            raise ExtractionError(
                "google-genai is not installed. Run: pip install google-genai"
            ) from exc

        self._client = genai.Client(api_key=_gemini_api_key())
        self._model = settings.GEMINI_MODEL
        self._system_prompt = _load_system_prompt()

    async def extract(
        self,
        raw_text: str,
        org_id: str,
        candidate_id: str,
        source_document_id: str,
        instructions: str | None = None,
    ) -> CandidateProfile:
        """Extract a CandidateProfile using Gemini structured JSON output."""
        from google.genai import types
        from google.genai.errors import APIError, ClientError

        extra = (instructions or "").strip()
        user_prompt = f"Extract this CV into the JSON schema.\n\nCV TEXT:\n{raw_text}"
        if extra:
            user_prompt = (
                f"Additional extraction instructions:\n{extra}\n\n{user_prompt}"
            )

        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=self._model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    temperature=0,
                    system_instruction=self._system_prompt,
                    response_mime_type="application/json",
                    response_json_schema=ExtractedProfile.model_json_schema(),
                ),
            )
        except ClientError as exc:
            if getattr(exc, "code", None) in {400, 401, 403}:
                raise ExtractionAuthError(
                    "Gemini rejected the API key. Put a valid key from "
                    "https://aistudio.google.com/apikey into .env as GEMINI_API_KEY."
                ) from exc
            raise ExtractionError(getattr(exc, "message", None) or str(exc)) from exc
        except APIError as exc:
            raise ExtractionError(getattr(exc, "message", None) or str(exc)) from exc

        if not response.text:
            raise ExtractionError("Gemini returned no extractable content.")

        try:
            extracted = ExtractedProfile.model_validate(json.loads(response.text))
        except (json.JSONDecodeError, ValueError) as exc:
            raise ExtractionError(f"Gemini returned invalid JSON: {exc}") from exc

        profile = CandidateProfile(
            meta=Meta(
                org_id=org_id or str(uuid.uuid4()),
                candidate_id=candidate_id or str(uuid.uuid4()),
                source_document_id=source_document_id or str(uuid.uuid4()),
                extraction_model=self._model,
                extraction_version=settings.AI_EXTRACTION_VERSION,
                extraction_instructions=extra or None,
                overall_confidence=extracted.overall_confidence,
            ),
            candidate=extracted.candidate,
            career_summary=extracted.career_summary,
            technical_skills=extracted.technical_skills,
            education=extracted.education,
            employment=extracted.employment,
        )
        logger.info(
            "Gemini extraction succeeded for candidate %s (model=%s)",
            profile.meta.candidate_id,
            self._model,
        )
        return profile
