"""Structured logging configuration (stdlib logging + JSON formatter for prod)."""

from __future__ import annotations

import logging
import sys

from app.core.config import settings


def configure_logging() -> None:
    level = logging.DEBUG if settings.DEBUG else logging.INFO
    fmt = (
        "%(levelname)s  %(asctime)s  %(name)s  %(message)s"
        if settings.DEBUG
        else '{"level":"%(levelname)s","time":"%(asctime)s","logger":"%(name)s","msg":"%(message)s"}'
    )
    logging.basicConfig(stream=sys.stdout, level=level, format=fmt)
    # Quieten noisy third-party libs
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DEBUG else logging.WARNING
    )
