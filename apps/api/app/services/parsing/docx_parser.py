"""
DOCX parser — extracts clean plain text from Word .docx files.

Uses python-docx. Extracts text from:
  - Normal paragraphs (in document body order)
  - Table cells (left-to-right, top-to-bottom)

Epic 2.2 implementation.
"""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


def extract_text(file_bytes: bytes) -> str:
    """
    Extract text from a .docx file.

    Args:
        file_bytes: Raw bytes of the .docx file.

    Returns:
        Cleaned plain text string.

    Raises:
        ParseError: if python-docx cannot open the file.
    """
    try:
        from docx import Document
        from docx.oxml.ns import qn
    except ImportError:
        raise ParseError("python-docx is not installed. Run: pip install python-docx")

    try:
        doc = Document(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ParseError(f"Cannot open DOCX: {exc}") from exc

    parts: list[str] = []

    # Walk document body elements in order (paragraphs AND tables)
    for element in doc.element.body:
        tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag
        if tag == "p":
            # Paragraph
            from docx.text.paragraph import Paragraph
            para = Paragraph(element, doc)
            text = para.text.strip()
            if text:
                parts.append(text)
        elif tag == "tbl":
            # Table — extract cell text in reading order
            from docx.table import Table
            table = Table(element, doc)
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_cells:
                    parts.append("  |  ".join(row_cells))

    return "\n".join(parts)


class ParseError(Exception):
    """Raised when a document cannot be parsed."""
