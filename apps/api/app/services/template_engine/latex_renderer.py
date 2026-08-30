"""
LaTeX template renderer.

Uses Jinja2 with LaTeX-safe delimiters to avoid conflicts with LaTeX syntax,
then compiles via xelatex (runs twice for stable layout).

Template format: .tex.j2 files using:
  <% block %> / <% endblock %>  →  Jinja2 blocks
  << expression >>               →  Jinja2 expressions
  <# comment #>                  →  Jinja2 comments

These delimiters never appear in LaTeX source, so there is zero conflict.

The template receives the same context dict as the DOCX renderer but as
plain escaped strings (LaTeX entity escaping instead of XML escaping).
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
import tempfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from app.schemas.candidate_profile import CandidateProfile

logger = logging.getLogger(__name__)

# Characters that must be escaped for LaTeX
_LATEX_ESCAPE_MAP = str.maketrans(
    {
        "&":  r"\&",
        "%":  r"\%",
        "$":  r"\$",
        "#":  r"\#",
        "_":  r"\_",
        "{":  r"\{",
        "}":  r"\}",
        "~":  r"\textasciitilde{}",
        "^":  r"\textasciicircum{}",
        "\\": r"\textbackslash{}",
        "<":  r"\textless{}",
        ">":  r"\textgreater{}",
    }
)


def _lx(text: str | None) -> str:
    """Escape a string for safe use in LaTeX source."""
    if not text:
        return ""
    return str(text).translate(_LATEX_ESCAPE_MAP)


def _lx_bold(md_text: str | None) -> str:
    """
    Convert minimal markdown bold (**text**) to LaTeX \\textbf{text},
    with all other characters LaTeX-escaped.
    """
    if not md_text:
        return ""
    import re
    parts = re.split(r"(\*\*.*?\*\*)", md_text)
    out = []
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            inner = _lx(part[2:-2])
            out.append(rf"\textbf{{{inner}}}")
        else:
            out.append(_lx(part))
    return "".join(out)


def _build_latex_context(profile: CandidateProfile) -> dict:
    """Build the Jinja2 context dict — all strings LaTeX-escaped."""
    summary_bullets = [
        {
            "text": _lx_bold(b.text),
            "confidence": b.confidence,
        }
        for b in profile.career_summary.bullets
    ]

    skill_groups = [
        {
            "category": _lx(g.category),
            "skills": _lx(", ".join(g.skills)),
        }
        for g in profile.technical_skills.groups
    ]

    education_items = [
        {
            "text": _lx_bold(item.text),
            "type": item.type.value,
        }
        for item in profile.education.items
    ]

    employment = []
    for job in profile.employment:
        employment.append(
            {
                "company": _lx(job.company),
                "client": _lx(job.client),
                "role": _lx(job.role),
                "duration_display": _lx(job.duration_display),
                "project_name": _lx(job.project_name),
                "technology_used": _lx(
                    ", ".join(job.technology_used) if job.technology_used else ""
                ),
                "project_description": _lx_bold(job.project_description or ""),
                "responsibilities": [
                    {"text": _lx_bold(r.text)} for r in job.responsibilities
                ],
            }
        )

    return {
        "candidate": {
            "full_name": _lx(profile.candidate.full_name),
            "role_title": _lx(profile.candidate.role_title),
        },
        "career_summary": {"bullets": summary_bullets},
        "technical_skills": {"groups": skill_groups},
        "education": {
            "has_certifications": profile.education.has_certifications,
            "entries": education_items,
        },
        "employment": employment,
    }


def _create_jinja_env(template_dir: Path) -> Environment:
    """Create a Jinja2 environment with LaTeX-safe delimiters."""
    return Environment(
        loader=FileSystemLoader(str(template_dir)),
        block_start_string="<%",
        block_end_string="%>",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="<#",
        comment_end_string="#>",
        undefined=StrictUndefined,
        autoescape=False,  # We do our own LaTeX escaping
        keep_trailing_newline=True,
    )


async def render(
    template_path: str | Path,
    profile: CandidateProfile,
    work_dir: Path | None = None,
) -> bytes:
    """
    Render a LaTeX template with the given profile, compile to PDF.

    Args:
        template_path: Path to a .tex.j2 Jinja2-LaTeX template file.
        profile: Approved CandidateProfile.
        work_dir: Optional working directory for xelatex output files.
                  If None, a temporary directory is created and cleaned up.

    Returns:
        PDF bytes.

    Raises:
        LatexRenderError: if template rendering or compilation fails.
    """
    template_path = Path(template_path)
    if not template_path.exists():
        raise LatexRenderError(f"Template not found: {template_path}")

    context = _build_latex_context(profile)

    # ── Step 1: Jinja2 render → .tex ─────────────────────────────────────────
    env = _create_jinja_env(template_path.parent)
    try:
        tex_source = env.get_template(template_path.name).render(**context)
    except Exception as exc:
        raise LatexRenderError(f"Jinja2 render failed: {exc}") from exc

    # ── Step 2: Write .tex + run xelatex twice ────────────────────────────────
    async def _compile(work: Path) -> bytes:
        tex_file = work / "output.tex"
        pdf_file = work / "output.pdf"
        tex_file.write_text(tex_source, encoding="utf-8")

        xelatex_cmd = [
            "xelatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-output-directory",
            str(work),
            str(tex_file),
        ]

        for run_no in (1, 2):  # Two passes for stable cross-references
            result = await asyncio.create_subprocess_exec(
                *xelatex_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await result.communicate()

            if result.returncode != 0:
                log_tail = stdout.decode("utf-8", errors="replace")[-2000:]
                raise LatexRenderError(
                    f"xelatex failed (pass {run_no}, exit={result.returncode}):\n{log_tail}"
                )

        if not pdf_file.exists():
            raise LatexRenderError("xelatex did not produce output.pdf")

        return pdf_file.read_bytes()

    if work_dir:
        return await _compile(work_dir)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            return await _compile(Path(tmp))


class LatexRenderError(Exception):
    """Raised when LaTeX template rendering or compilation fails."""
