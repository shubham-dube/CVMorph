"""
In-Studio Conversational AI Editing Agent Service.

Allows recruiters to talk directly with an AI Agent in Review Studio to perform
targeted or global modifications across the candidate's canonical profile
using natural language commands.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from pydantic import BaseModel, Field

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


class AgentExecutionResult(BaseModel):
    reply: str = Field(
        description="A helpful, professional, and friendly conversational response from the AI assistant explaining exactly what changes were performed."
    )
    changes_summary: list[str] = Field(
        default_factory=list,
        description="A list of 1 to 5 concise bullet points summarizing specific changes made across sections.",
    )
    updated_profile: ExtractedProfile = Field(
        description="The complete updated canonical candidate profile reflecting all user-requested edits."
    )


class ProfileEditingAgentService:
    def __init__(self) -> None:
        try:
            from google import genai
        except ImportError as exc:
            raise ExtractionError("google-genai is not installed. Run: pip install google-genai") from exc

        self._client = genai.Client(api_key=_gemini_api_key())
        self._model = settings.GEMINI_MODEL

    async def execute_edit(
        self,
        current_profile: CandidateProfile,
        prompt: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> tuple[CandidateProfile, str, list[str]]:
        """
        Executes a natural language editing instruction against the current profile.

        Returns:
            (updated_profile, agent_reply, changes_summary)
        """
        from google.genai import types
        from google.genai.errors import APIError, ClientError

        system_instruction = (
            "You are an expert executive resume editor and paired AI recruiting assistant for CVMorph.\n"
            "Your job is to assist the recruiter by executing their natural language instructions to modify, "
            "rephrase, condense, expand, restructure, or polish the candidate's CV profile.\n\n"
            "OPERATING GUIDELINES:\n"
            "1. Strictly adhere to the requested schema. Never drop existing verified sections (education, employment) "
            "unless the user explicitly asked to remove them.\n"
            "2. When rephrasing or improving existing achievements, preserve factual accuracy and set source_type = 'tailored_enhancement'.\n"
            "3. If the user asks you to add new skills, technologies, or hypothetical achievements, set source_type = 'extrapolated_bluff' "
            "and in 'evidence' state: 'Added via AI Agent prompt: [user instruction]'.\n"
            "4. If existing bullets were untouched, preserve their original source_type and evidence.\n"
            "5. In your 'reply', speak directly and professionally to the recruiter, clearly stating what was modified.\n"
            "6. In 'changes_summary', provide concise bullet points outlining each concrete change (e.g. 'Rewrote summary to 3 bullets', 'Added GraphQL under Frontend skills')."
        )

        # Build context from previous conversation if available
        history_text = ""
        if conversation_history:
            recent = conversation_history[-6:]  # Keep last 6 exchanges for context
            formatted_history = []
            for msg in recent:
                role = "User" if msg.get("role") == "user" else "Assistant"
                content = msg.get("content", "").strip()
                if content:
                    formatted_history.append(f"{role}: {content}")
            if formatted_history:
                history_text = "CONVERSATION HISTORY:\n" + "\n".join(formatted_history) + "\n\n"

        current_profile_json = current_profile.model_dump_json()

        prompt_payload = (
            f"{history_text}"
            f"CURRENT CANDIDATE PROFILE JSON:\n{current_profile_json}\n\n"
            f"RECRUITER EDIT INSTRUCTION:\n{prompt}\n\n"
            "Perform the requested edits now and return the JSON adhering strictly to the schema."
        )

        response = None
        for attempt in range(2):
            try:
                response = await asyncio.to_thread(
                    self._client.models.generate_content,
                    model=self._model,
                    contents=prompt_payload,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_json_schema=AgentExecutionResult.model_json_schema(),
                        temperature=0.1,
                    ),
                )
                break
            except (APIError, ClientError) as exc:
                logger.warning("Gemini API error during AI agent edit (attempt %d): %s", attempt + 1, exc)
                if attempt == 1:
                    raise ExtractionError(f"AI Agent error: {getattr(exc, 'message', str(exc))}") from exc
                await asyncio.sleep(1.5)
            except Exception as exc:
                logger.warning("Transient error during AI agent edit (attempt %d): %s", attempt + 1, exc)
                if attempt == 1:
                    raise ExtractionError(f"AI Agent request failed: {exc}") from exc
                await asyncio.sleep(1.5)

        if response is None:
            raise ExtractionError("AI Agent failed to produce a response.")

        raw_text = response.text or ""
        if not raw_text.strip():
            raise ExtractionError("Gemini returned an empty response for AI agent edit.")

        try:
            parsed = json.loads(raw_text)
            result = AgentExecutionResult.model_validate(parsed)
        except Exception as exc:
            logger.error("Failed to parse Gemini AI agent output: %s\nRaw: %s", exc, raw_text[:500])
            raise ExtractionError(f"Failed to parse AI agent response: {exc}") from exc

        extracted = result.updated_profile

        # Preserve and update meta
        updated_meta = Meta(
            org_id=current_profile.meta.org_id,
            candidate_id=current_profile.meta.candidate_id,
            source_document_id=current_profile.meta.source_document_id,
            extraction_model=self._model,
            extraction_version="2.0-agent",
            extraction_instructions=f"AI Agent Edit: {prompt[:200]}",
            overall_confidence=current_profile.meta.overall_confidence,
        )

        final_profile = CandidateProfile(
            meta=updated_meta,
            candidate=extracted.candidate,
            career_summary=extracted.career_summary,
            technical_skills=extracted.technical_skills,
            education=extracted.education,
            employment=extracted.employment,
        )

        return final_profile, result.reply, result.changes_summary
