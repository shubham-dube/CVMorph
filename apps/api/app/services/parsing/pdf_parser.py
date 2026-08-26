"""
PDF parser — extracts clean plain text from text-based PDF files.

Uses PyMuPDF (fitz) for text extraction. Fast, well-maintained, and handles
most structured text PDFs well.

Epic 2.3 implementation.

NOTE: Image-only / scanned PDFs will return very little or no text — this is
expected in MVP. The caller (parse_task) should detect empty output and set
parse_status = "failed" with a user-facing message:
  "This appears to be a scanned PDF. OCR support is coming soon."
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def extract_text(file_bytes: bytes) -> str:
    """
    Extract text from a PDF file.

    Args:
        file_bytes: Raw bytes of the PDF file.

    Returns:
        Cleaned plain text string. Empty string if no text is extractable.

    Raises:
        ParseError: if PyMuPDF cannot open the file at all (corrupt/invalid PDF).
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ParseError("PyMuPDF (fitz) is not installed. Run: pip install PyMuPDF")

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise ParseError(f"Cannot open PDF: {exc}") from exc

    if doc.is_encrypted and not doc.authenticate(""):
        doc.close()
        raise ParseError("Encrypted PDFs are not supported.")

    pages_text: list[str] = []
    for page_num, page in enumerate(doc):
        try:
            text = page.get_text("text")  # type: ignore[attr-defined]
            pages_text.append(text)
        except Exception as exc:
            logger.warning("Failed to extract text from page %d: %s", page_num, exc)

    doc.close()

    full_text = "\n".join(pages_text)
    cleaned = _clean(full_text)

    if not cleaned.strip():
        logger.warning("PDF produced no extractable text — likely a scanned/image PDF.")

    return cleaned


def _clean(text: str) -> str:
    """
    Light cleanup of raw PDF text:
      - Normalise line endings
      - Collapse runs of blank lines (>2) to a single blank
      - Strip trailing whitespace per line
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = [line.rstrip() for line in lines]

    # Collapse multiple blank lines
    result: list[str] = []
    blank_count = 0
    for line in lines:
        if line == "":
            blank_count += 1
            if blank_count <= 2:
                result.append(line)
        else:
            blank_count = 0
            result.append(line)

    return "\n".join(result)


class ParseError(Exception):
    """Raised when a document cannot be parsed."""
