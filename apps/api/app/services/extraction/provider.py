"""
Abstract AIProvider interface.

RULE: Nothing outside this `extraction/` package imports an AI SDK directly.
All SDK calls go through a concrete subclass of AIProvider. This is the
provider-agnostic layer described in PRD §4 point 5.

To add a new provider: subclass AIProvider, implement `extract`, register in
get_provider() below.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.candidate_profile import CandidateProfile


class AIProvider(ABC):
    """
    Provider-agnostic extraction interface.

    Implementations:
      - GeminiProvider (gemini_provider.py) — default
      - ClaudeProvider (claude_provider.py)
      - [Future] OpenAIProvider
    """

    @abstractmethod
    async def extract(
        self,
        raw_text: str,
        org_id: str,
        candidate_id: str,
        source_document_id: str,
        instructions: str | None = None,
    ) -> CandidateProfile:
        """
        Extract a CandidateProfile from raw CV text.

        Args:
            raw_text: Cleaned plain text from the document parser.
            org_id: For embedding in the profile meta.
            candidate_id: For embedding in the profile meta.
            source_document_id: For embedding in the profile meta.
            instructions: Optional recruiter extraction-time instructions (PRD §9.6).

        Returns:
            A fully-populated CandidateProfile (not yet validated — call validator.validate()).

        Raises:
            ExtractionError: if the model returns invalid JSON or fails retry.
        """
        ...


class ExtractionError(Exception):
    """Raised when extraction fails after retries."""


class ExtractionAuthError(ExtractionError):
    """Raised when the AI provider rejects the configured API key."""


def get_provider(provider_name: str = "gemini") -> AIProvider:
    """
    Factory — returns the correct AIProvider implementation.

    Future: look up per-org provider config from DB.
    """
    if provider_name == "gemini":
        from app.services.extraction.gemini_provider import GeminiProvider

        return GeminiProvider()
    if provider_name == "claude":
        from app.services.extraction.claude_provider import ClaudeProvider

        return ClaudeProvider()
    raise ValueError(f"Unknown AI provider: {provider_name!r}")
