"""
Dispatch CV bytes to the PDF or DOCX parser based on filename suffix.

This is the synchronous entry point used by POST /v1/cv/extract.
"""

from __future__ import annotations

from pathlib import Path

from app.services.parsing import docx_parser, pdf_parser

SUPPORTED_SUFFIXES = {".pdf", ".docx"}


class ParseError(Exception):
    """Raised when a document cannot be parsed."""


def extract_text(filename: str, file_bytes: bytes) -> str:
    """
    Extract plain text from a PDF or DOCX upload.

    Args:
        filename: Original filename (used only for suffix routing).
        file_bytes: Raw file contents.

    Returns:
        Cleaned plain text.

    Raises:
        ParseError: unsupported type, corrupt file, or encrypted PDF.
    """
    suffix = Path(filename or "").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ParseError("Only .pdf and .docx files are currently supported.")

    try:
        if suffix == ".pdf":
            return pdf_parser.extract_text(file_bytes)
        return docx_parser.extract_text(file_bytes)
    except (pdf_parser.ParseError, docx_parser.ParseError) as exc:
        raise ParseError(str(exc)) from exc
