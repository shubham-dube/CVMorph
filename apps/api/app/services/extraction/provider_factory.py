"""
AI Provider factory — thin wrapper around provider.get_provider().

This file exists for import ergonomics from Celery tasks.
The actual factory logic lives in app/services/extraction/provider.py.

Usage in Celery tasks:
    from app.services.extraction.provider_factory import get_provider
    provider = get_provider()
    profile = await provider.extract(...)

This always returns the Gemini provider by default (see settings.GEMINI_MODEL).
Pass provider_name="claude" to get ClaudeProvider (requires ANTHROPIC_API_KEY).
"""

from __future__ import annotations

from app.services.extraction.provider import AIProvider, get_provider as _get_provider


def get_provider(provider_name: str | None = None) -> AIProvider:
    """
    Return the configured AIProvider.

    Args:
        provider_name: "gemini" (default) | "claude"

    Returns:
        Initialized AIProvider ready to call .extract()
    """
    return _get_provider(provider_name or "gemini")
