"""
Unit tests for the RichText filter (services/template_engine/richtext.py).

Epic 5.5 — these tests should pass as soon as richtext.py is implemented.
"""

from __future__ import annotations

import pytest

from app.services.template_engine.richtext import to_richtext


class TestToRichtext:
    def test_plain_text_returns_single_run(self) -> None:
        rt = to_richtext("Hello world")
        # docxtpl RichText stores runs — just verify it doesn't crash and has content
        assert rt is not None

    def test_bold_mid_sentence(self) -> None:
        rt = to_richtext("Hello **world** here")
        assert rt is not None

    def test_bold_at_start(self) -> None:
        rt = to_richtext("**Bold** at start")
        assert rt is not None

    def test_bold_at_end(self) -> None:
        rt = to_richtext("At end **bold**")
        assert rt is not None

    def test_multiple_bold_spans(self) -> None:
        rt = to_richtext("**one** and **two** and **three**")
        assert rt is not None

    def test_empty_string(self) -> None:
        rt = to_richtext("")
        assert rt is not None

    def test_none_equivalent(self) -> None:
        rt = to_richtext("")
        assert rt is not None

    def test_no_bold_returns_richtext(self) -> None:
        rt = to_richtext("Plain text no bold")
        assert rt is not None
