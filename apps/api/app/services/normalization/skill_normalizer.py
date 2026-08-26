"""
Normalization stubs — Epic P1 / 2.

Skill normalization (JS → JavaScript, K8s → Kubernetes) is a P1 feature,
but the module structure is created now so the Epic 2 parsing pipeline can
call `normalize_skill(name)` without a code-structure change later.

For MVP, normalize_skill() is a pass-through that returns the input unchanged.
"""

from __future__ import annotations


def normalize_skill(raw_name: str) -> str:
    """
    Normalize a skill name to a canonical form.

    MVP: returns raw_name unchanged.
    P1: look up raw_name in the skills taxonomy table (seeded from skills-taxonomy-starter.xlsx)
        and return the canonical name if found.
    """
    return raw_name.strip()


def normalize_date(raw_date: str) -> str:
    """
    Normalize a date string to YYYY-MM format.

    MVP: basic cleanup only.
    P1: full date parsing with dateparser / arrow.
    """
    return raw_date.strip()
