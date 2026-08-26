"""
RichText filter — converts markdown-bold strings to docxtpl RichText objects.

Usage in template:  {{ bullet.text | richtext }}

This is the ONLY custom filter registered on the docxtpl template engine.
It handles the **bold** mid-sentence emphasis requirement described in
docs/cv_schema_template_mapping.md §4.

Epic 5.5 implementation.
"""

from __future__ import annotations

import re

from docxtpl import RichText


def to_richtext(md_text: str) -> RichText:
    """
    Convert a markdown-lite string with **bold** spans to a docxtpl RichText.

    Examples:
        "Normal text" → RichText("Normal text")
        "Hello **world**!" → RichText("Hello ", bold("world"), "!")
        "**Bold** at start and **end**" → works correctly
        "" → empty RichText()

    The regex splits on **...** pairs. Any text that isn't wrapped in **...**
    is added as a normal (non-bold) run.
    """
    rt = RichText()
    if not md_text:
        return rt

    parts = re.split(r"(\*\*.*?\*\*)", md_text)
    for part in parts:
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            rt.add(part[2:-2], bold=True)
        elif part:
            rt.add(part)

    return rt
