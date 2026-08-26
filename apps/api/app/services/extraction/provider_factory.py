"""
AI Provider factory.

Returns the configured AIProvider implementation based on settings.
Future: per-org provider config (stored in organizations.config_json).

Usage:
    from app.services.extraction.provider_factory import get_provider

    provider = get_provider()
    profile = await provider.extract(text, org_id, candidate_id, doc_id)
"""

from __future__ import annotations

from app.core.config import settings
from app.services.extraction.provider import AIProvider


def get_provider(org_config: dict | None = None) -> AIProvider:
    """
    Return the AI provider for the current request/task.

    Args:
        org_config: Optional per-org configuration (future use — e.g. to select
                    a different provider or model per tenant). Currently unused.

    Returns:
        An initialized AIProvider instance ready to call .extract().
    """
    # For now: always Claude. Future: read from org_config["ai_provider"]
    from app.services.extraction.claude_provider import ClaudeProvider

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. "
            "Copy .env.example to .env and fill in the API key."
        )

    return ClaudeProvider()
