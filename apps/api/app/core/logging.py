"""
Structured logging module for My Copious.

Provides:
  - JSON formatting in production / human-readable formatting in development
  - Contextual metadata (request_id, org_id, user_id) via contextvars
  - PII-safe redaction filter preventing leakage of bearer tokens, emails, and credentials
  - Standardized logger export: `from app.core.logging import logger`
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings

# ── Context Variables ────────────────────────────────────────────────────────
request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
org_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("org_id", default=None)
user_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("user_id", default=None)

# ── PII Sanitizer Patterns ───────────────────────────────────────────────────
_TOKEN_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)
_EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b")
_PASSWORD_PATTERN = re.compile(r'("password"|"secret"|"access_token"):\s*"[^"]+"', re.IGNORECASE)


class PIISanitizingFilter(logging.Filter):
    """Redacts sensitive PII and authentication secrets from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _TOKEN_PATTERN.sub("Bearer [REDACTED]", record.msg)
            record.msg = _PASSWORD_PATTERN.sub(r'\1: "[REDACTED]"', record.msg)
        return True


class ContextualJSONFormatter(logging.Formatter):
    """Outputs machine-readable JSON logs with contextual execution metadata."""

    def format(self, record: logging.LogRecord) -> str:
        log_payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "app": settings.APP_NAME,
            "env": settings.APP_ENV,
        }

        # Contextual metadata
        req_id = request_id_ctx.get()
        if req_id:
            log_payload["request_id"] = req_id

        org_id = org_id_ctx.get()
        if org_id:
            log_payload["org_id"] = org_id

        user_id = user_id_ctx.get()
        if user_id:
            log_payload["user_id"] = user_id

        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_payload, default=str)


def configure_logging() -> None:
    """Configures application-wide logging."""
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    # Remove existing handlers
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.addFilter(PIISanitizingFilter())

    if settings.DEBUG:
        console_handler.setFormatter(
            logging.Formatter(
                fmt="%(levelname)s  %(asctime)s  [%(name)s]  %(message)s",
                datefmt="%H:%M:%S",
            )
        )
    else:
        console_handler.setFormatter(ContextualJSONFormatter())

    root_logger.addHandler(console_handler)

    # Silence verbose third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DEBUG else logging.WARNING
    )


# Standard module logger
logger = logging.getLogger("my_copious")
