"""
Claude (Anthropic) AI provider implementation.

Uses the `tool_use` / structured-output feature of the Claude API to force
the model to return JSON matching the CandidateProfile schema.

Retry logic: if the model returns invalid JSON, retry once with an error
correction prompt before raising ExtractionError.

Epic 3.3 implementation.
"""

from __future__ import annotations

import json
import logging

import anthropic

from app.core.config import settings
from app.schemas.candidate_profile import CandidateProfile
from app.services.extraction.provider import AIProvider, ExtractionError

logger = logging.getLogger(__name__)

# Inject this at call time (loaded from file at import is fine — it's a static asset)
_SYSTEM_PROMPT_PATH = (
    "app/services/extraction/prompts/extraction_system_prompt.md"
)


def _load_system_prompt() -> str:
    try:
        with open(_SYSTEM_PROMPT_PATH, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        logger.warning(
            "Extraction system prompt file not found at %s — using fallback.", _SYSTEM_PROMPT_PATH
        )
        return "You are an expert CV data extractor. Extract structured data from the CV text."


class ClaudeProvider(AIProvider):
    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._model = settings.AI_DEFAULT_MODEL
        self._system_prompt = _load_system_prompt()

    async def extract(
        self,
        raw_text: str,
        org_id: str,
        candidate_id: str,
        source_document_id: str,
        instructions: str | None = None,
    ) -> CandidateProfile:
        """
        Extract a CandidateProfile using Claude structured output.

        Strategy:
          1. Build user message: CV text + optional recruiter instructions.
          2. Call Claude with tool_use to force JSON schema adherence.
          3. Parse + validate the response.
          4. On validation failure: retry once with the error appended.
          5. On second failure: raise ExtractionError.
        """
        schema = CandidateProfile.model_json_schema()

        tools = [
            {
                "name": "extract_candidate_profile",
                "description": "Extract the canonical candidate profile from the CV text.",
                "input_schema": schema,
            }
        ]

        meta_prefix = {
            "org_id": org_id,
            "candidate_id": candidate_id,
            "source_document_id": source_document_id,
            "extraction_model": self._model,
            "extraction_version": settings.AI_EXTRACTION_VERSION,
            "extraction_instructions": instructions,
            "overall_confidence": 0.0,  # placeholder; model fills this
        }

        user_content = self._build_user_message(raw_text, instructions)

        for attempt in range(2):
            try:
                response = self._client.messages.create(
                    model=self._model,
                    max_tokens=8192,
                    system=self._system_prompt,
                    tools=tools,  # type: ignore[arg-type]
                    tool_choice={"type": "tool", "name": "extract_candidate_profile"},
                    messages=[{"role": "user", "content": user_content}],
                )

                # Extract the tool_use block
                tool_block = next(
                    (b for b in response.content if b.type == "tool_use"), None
                )
                if not tool_block:
                    raise ExtractionError("Claude did not call the extraction tool.")

                raw_json: dict = tool_block.input  # type: ignore[attr-defined]

                # Inject meta fields the model can't know
                raw_json.setdefault("meta", {})
                raw_json["meta"].update(meta_prefix)

                profile = CandidateProfile.model_validate(raw_json)
                logger.info(
                    "Extraction succeeded (attempt %d) for candidate %s",
                    attempt + 1,
                    candidate_id,
                )
                return profile

            except Exception as exc:
                if attempt == 0:
                    logger.warning(
                        "Extraction attempt 1 failed for candidate %s: %s — retrying.",
                        candidate_id,
                        exc,
                    )
                    user_content = self._build_retry_message(user_content, str(exc))
                else:
                    raise ExtractionError(
                        f"Extraction failed after 2 attempts for candidate {candidate_id}: {exc}"
                    ) from exc

        raise ExtractionError("Unreachable")  # satisfy type checker

    def _build_user_message(self, raw_text: str, instructions: str | None) -> str:
        parts = ["<cv_text>\n", raw_text, "\n</cv_text>"]
        if instructions:
            parts += [
                "\n\n<recruiter_instructions>\n",
                instructions,
                "\n</recruiter_instructions>",
            ]
        return "".join(parts)

    def _build_retry_message(self, original: str, error: str) -> str:
        return (
            f"{original}\n\n"
            f"<correction_request>\n"
            f"Your previous response was invalid: {error}\n"
            f"Please correct the output and try again, ensuring it matches the schema exactly.\n"
            f"</correction_request>"
        )
