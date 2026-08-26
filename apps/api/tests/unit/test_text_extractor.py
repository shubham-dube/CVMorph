"""Unit tests for PDF/DOCX text extraction dispatch."""

from __future__ import annotations

from io import BytesIO

import pytest

from app.services.parsing.text_extractor import ParseError, extract_text


def _pdf_bytes(text: str) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _docx_bytes(text: str) -> bytes:
    from docx import Document

    doc = Document()
    doc.add_paragraph(text)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_extract_pdf_text() -> None:
    text = extract_text("resume.pdf", _pdf_bytes("Jane Doe Engineer"))
    assert "Jane Doe Engineer" in text


def test_extract_docx_text() -> None:
    text = extract_text("resume.docx", _docx_bytes("Jane Doe Engineer"))
    assert "Jane Doe Engineer" in text


def test_rejects_unsupported_suffix() -> None:
    with pytest.raises(ParseError, match="Only .pdf and .docx"):
        extract_text("resume.txt", b"plain text cv")


def test_rejects_corrupt_pdf() -> None:
    with pytest.raises(ParseError):
        extract_text("resume.pdf", b"this is not a pdf")
