"""
LibreOffice-based document converter.

Provides two async functions:
  docx_to_pdf(docx_path, output_dir) -> bytes   # DOCX template path
  pdf_to_docx(pdf_path, output_dir)  -> bytes   # LaTeX template path

Both use LibreOffice headless mode. LibreOffice must be installed in the
Docker container (see api.Dockerfile).

If LibreOffice is not available (local dev without Docker), a ConversionError
is raised with an informative message.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

LIBREOFFICE_CMD = shutil.which("libreoffice") or shutil.which("soffice") or "libreoffice"

# Writable user profile dir — avoids permission errors in headless/Docker mode
_LO_PROFILE = "/tmp/libreoffice-profile"


async def _run_libreoffice(*args: str, cwd: Path | None = None) -> None:
    """Run libreoffice as an async subprocess, raising ConversionError on failure."""
    cmd = [
        LIBREOFFICE_CMD,
        "--headless",
        "--norestore",
        f"-env:UserInstallation=file://{_LO_PROFILE}",  # single dash, triple slash
        *args,
    ]
    logger.debug("converter: running %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        out = (stdout + stderr).decode("utf-8", errors="replace")[-2000:]
        raise ConversionError(
            f"LibreOffice exited with code {proc.returncode}:\n{out}"
        )


async def docx_to_pdf(docx_path: Path, output_dir: Path) -> bytes:
    """
    Convert a DOCX file to PDF using LibreOffice headless.

    Args:
        docx_path: Path to the input .docx file.
        output_dir: Directory where LibreOffice writes the output .pdf.

    Returns:
        PDF bytes.
    """
    if not shutil.which("libreoffice") and not shutil.which("soffice"):
        raise ConversionError(
            "LibreOffice is not installed. Install it in the Docker container "
            "with: apt-get install -y libreoffice-writer"
        )

    await _run_libreoffice(
        "--convert-to", "pdf",
        "--outdir", str(output_dir),
        str(docx_path),
        cwd=output_dir,
    )

    pdf_path = output_dir / (docx_path.stem + ".pdf")
    if not pdf_path.exists():
        raise ConversionError(
            f"LibreOffice DOCX→PDF conversion did not produce {pdf_path.name}"
        )

    logger.info("converter: DOCX→PDF %s (%d bytes)", pdf_path.name, pdf_path.stat().st_size)
    return pdf_path.read_bytes()


async def pdf_to_docx(pdf_path: Path, output_dir: Path) -> bytes:
    """
    Convert a PDF file to DOCX using LibreOffice headless.

    Note: PDF→DOCX is inherently imperfect (PDF has no semantic structure).
    For best results, the PDF should originate from a clean LaTeX source.

    Args:
        pdf_path: Path to the input .pdf file.
        output_dir: Directory where LibreOffice writes the output .docx.

    Returns:
        DOCX bytes.
    """
    if not shutil.which("libreoffice") and not shutil.which("soffice"):
        raise ConversionError(
            "LibreOffice is not installed. Install it in the Docker container "
            "with: apt-get install -y libreoffice-writer"
        )

    await _run_libreoffice(
        "--convert-to", "docx",
        "--outdir", str(output_dir),
        str(pdf_path),
        cwd=output_dir,
    )

    docx_path = output_dir / (pdf_path.stem + ".docx")
    if not docx_path.exists():
        raise ConversionError(
            f"LibreOffice PDF→DOCX conversion did not produce {docx_path.name}"
        )

    logger.info("converter: PDF→DOCX %s (%d bytes)", docx_path.name, docx_path.stat().st_size)
    return docx_path.read_bytes()


class ConversionError(Exception):
    """Raised when LibreOffice conversion fails."""
