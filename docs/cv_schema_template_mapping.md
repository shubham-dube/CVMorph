# Canonical CV schema & template mapping (finalized)

**Source of truth for:** the exact JSON the LLM extraction step must return, and how each field maps onto the actual Copious CV template.

**Derived from:** the 3 reference CVs (Rupesh G — Snr. Full Stack Consultant, Pallavi G — Jnr. Project Manager, Sabir K B — System Architect) and reconciled against the Affinda `resumes.json` reference schema for naming sanity — but this is **our own schema**, not Affinda's. Affinda's schema is generic-resume-shaped (built for parsing any resume for ATS search); ours is *template-shaped* — every field exists because a specific section of our template needs it, nothing more, nothing speculative.

---

## 1. What the actual template looks like (confirmed from the .docx files)

Inspecting the real `.docx` files (not just the visual export) confirmed the structural details that matter for building the template engine:

- The document has **3 Word sections** (`sectPr` blocks): a cover-page section with **no header/footer reference at all**, then a content section with a **header + footer reference** that repeats on every subsequent page, then a trailing continuous section.
- The **cover page background image and logo are static template assets** — they are not candidate-specific and don't need to come from data at all. Only two text fields vary on the cover page: **name** and **role title**.
- The **running header** on page 2+ is a single line: `Copious CV | {Name} | {Role}` — same two fields as the cover page, just recombined into one string.
- **Technical Skills** is a genuine Word table, one row per category, left column = bold category label, right column = comma-separated skill list. Row count varies per candidate (Rupesh has 12 rows, Pallavi has 5, Sabir has 15).
- **Educational Qualifications** heading text literally changes to **"Educational Qualifications & Certifications"** when certifications exist (confirmed: Rupesh's CV — no certs — says "Educational Qualifications"; Pallavi's and Sabir's — which have certs — say "Educational Qualifications & Certifications"). This must be a template conditional, not two separate templates.
- **Employment Summary & Projects** entries are *not* uniform across candidates — some employment entries are plain (Company / Role / Duration / Responsibilities only — see Rupesh's McLaren entry), others include Client, Project name, Technology Used, and a Project Description paragraph before the responsibilities (see Pallavi's Vodacom entry, Sabir's Korridor entry). **Every one of those extra fields must be optional and independently omittable** — the template must not print an empty "Project:" line when there's no project.
- Bold formatting is used **inline, mid-sentence, inside bullets** to highlight key facts (years of experience, technologies, client names, metrics) — not just at the section/heading level. The schema has to carry that inline emphasis, not just plain strings.
- The document ends with a horizontal rule — this is a static template element (a paragraph bottom border), not data-driven.

## 2. Design decisions this implies

| Observation | Schema/engine decision |
|---|---|
| Cover page & header both just need name + role | One `candidate` object feeds both, no duplication |
| Bold mid-sentence spans | Every free-text field (summary bullets, responsibility bullets, education lines) is stored as a **markdown-lite string** using `**bold**` — a thin render-time filter turns this into real docx runs (see §4) |
| Skills table has variable rows, and grouping/category names vary per candidate/role (a Project Manager's "Testing Tools" row has no equivalent in the Architect CV) | `technical_skills.groups` is a free-form array, not a fixed set of category keys — the LLM proposes categories from the source CV's own groupings when present, or from a controlled category taxonomy when the source CV isn't already grouped (see the skills-taxonomy workbook, §6) |
| Education heading text changes based on cert presence | `education.has_certifications` boolean drives a template `{% if %}`, not two templates |
| Employment entries have optional Client/Project/Tech/Description | Every one of those fields is nullable on the `employment[]` item; template uses `{% if job.client %}` etc. guards around each |
| Static images/background/closing rule | These live in the **template `.docx` file itself**, never in the JSON payload — the canonical profile only ever carries candidate data |

---

## 3. Final JSON schema

This is what the AI extraction step returns (and what the recruiter review UI edits) for **every** CV, regardless of source format or which template it will eventually render into. Field-level `confidence`/`source_type`/`evidence` (the provenance system from the PRD) is attached to every reviewable text unit — i.e. every bullet, every skill group's skill list, every education line — not to every single scalar, since bullets are the unit a recruiter actually reviews.

```json
{
  "meta": {
    "org_id": "uuid",
    "candidate_id": "uuid",
    "source_document_id": "uuid",
    "extraction_model": "claude-sonnet-5",
    "extraction_version": "v1",
    "extraction_instructions": "Use most recent title as role, ignore the objective paragraph.",
    "overall_confidence": 0.93
  },

  "candidate": {
    "full_name": "Rupesh G",
    "role_title": "Snr. Full Stack Consultant",
    "email": "rupesh@example.com",
    "phone": "+91...",
    "location": "Bangalore, India"
  },

  "career_summary": {
    "bullets": [
      {
        "text": "Engineering Leader with **15+ years** of software engineering experience and progressive leadership.",
        "confidence": 0.95,
        "source_type": "verified_transformation",
        "evidence": "Engineering Leader with 15+ years of software engineering experience..."
      }
    ]
  },

  "technical_skills": {
    "groups": [
      {
        "category": "Technical Leadership",
        "skills": [
          "Platform Engineering Strategy & Roadmap",
          "Enterprise & Solution Architecture",
          "Distributed Systems"
        ],
        "confidence": 0.9,
        "source_type": "source"
      }
    ]
  },

  "education": {
    "has_certifications": false,
    "items": [
      {
        "type": "degree",
        "text": "Bachelor of Engineering (B.E.) in Computer Science from Rajiv Gandhi Proudyogiki Vishwavidyalaya (RGPV), India (2003).",
        "confidence": 0.98,
        "source_type": "source",
        "evidence": "Bachelor of Engineering (B.E.) in Computer Science from Rajiv Gandhi..."
      }
    ]
  },

  "employment": [
    {
      "company": "McLaren Strategic Solutions",
      "client": null,
      "role": "Technical Architect",
      "start_date": "2022-05",
      "end_date": null,
      "is_current": true,
      "duration_display": "May/2022 - Present",
      "project_name": null,
      "technology_used": [],
      "project_description": null,
      "responsibilities": [
        {
          "text": "Own end-to-end delivery and technical health of critical banking platforms for **J.P. Morgan Chase (Trade Finance)** within a highly regulated environment.",
          "confidence": 0.92,
          "source_type": "verified_transformation",
          "evidence": "Own end-to-end delivery and technical health of critical banking platforms for J.P. Morgan Chase (Trade Finance)..."
        }
      ],
      "confidence": 0.9
    },
    {
      "company": "Vodacom",
      "client": "Vodacom, South Africa",
      "role": "Scrum Master",
      "start_date": "2023-09",
      "end_date": null,
      "is_current": true,
      "duration_display": "Sep/2023 - Current",
      "project_name": "Vodacom Digital Lifestyle Services",
      "technology_used": ["React", "Angular"],
      "project_description": "Vodacom Digital Lifestyle Services provides access to content from various OTT platforms, including Netflix, Showmax, Amazon, Spotify...",
      "responsibilities": [
        { "text": "Facilitate Scrum ceremonies (daily stand-ups, sprint planning, sprint review, sprint retrospectives).", "confidence": 0.97, "source_type": "source", "evidence": "Facilitate Scrum ceremonies..." }
      ],
      "confidence": 0.94
    }
  ]
}
```

**Notes on specific fields:**
- `role_title` is deliberately separate from any single employment entry's `role` — it's the *positioning title for this submission* (what goes on the cover page / header), which a recruiter may deliberately set differently from the candidate's most recent job title (this is exactly the kind of thing the extraction-time custom instruction in PRD §9.6 is for).
- `duration_display` is kept alongside structured `start_date`/`end_date` — the source CVs use an inconsistent but human-friendly format (`May/2022 - Present`, `Sep/2023 - Current`, `Mar/2025 – July/2026`). We store both: structured dates for sorting/matching/analytics, and a display string the template prints verbatim so we don't have to fight every stylistic variant with formatting logic. The extraction prompt normalizes to `Mon/YYYY` display style for consistency across candidates.
- `employment[].confidence` is a roll-up (lowest confidence of that entry's fields) so the review UI can flag "this whole job needs a look" at a glance, in addition to per-bullet flags.
- Every optional employment field (`client`, `project_name`, `technology_used`, `project_description`) is `null`/`[]` when absent — **never omitted from the JSON** — so the template's conditional guards are consistent and the frontend doesn't need `hasOwnProperty` checks.

---

## 4. Template mapping (docxtpl)

The template itself is authored once as a real `.docx` (start from one of the 3 reference CVs, strip candidate content, replace with `{{ }}` placeholders — this can be done by hand in Word/Google Docs by whoever owns the current template, no engineering needed for the visual design itself).

```
COVER PAGE (no header/footer section)
  {{ candidate.full_name }}
  {{ candidate.role_title }}

RUNNING HEADER (page 2+, applies to every following page automatically)
  Copious CV | {{ candidate.full_name }} | {{ candidate.role_title }}

CAREER SUMMARY
  {%tr for b in career_summary.bullets %}
  • {{ b.text | richtext }}
  {%tr endfor %}

TECHNICAL SKILLS  (Word table, one templated row repeated via docxtpl row-loop)
  {%tr for g in technical_skills.groups %}
  | {{ g.category }} | {{ g.skills | join(", ") }} |
  {%tr endfor %}

{% if education.has_certifications %}EDUCATIONAL QUALIFICATIONS & CERTIFICATIONS{% else %}EDUCATIONAL QUALIFICATIONS{% endif %}
  {%tr for item in education.items %}
  • {{ item.text | richtext }}
  {%tr endfor %}

EMPLOYMENT SUMMARY & PROJECTS
  {% for job in employment %}
  # Company Name: {{ job.company }}
  {% if job.client %}Client: {{ job.client }}{% endif %}
  Role: {{ job.role }}
  Duration: {{ job.duration_display }}
  {% if job.project_name %}Project: {{ job.project_name }}{% endif %}
  {% if job.technology_used %}Technology Used: {{ job.technology_used | join(", ") }}{% endif %}
  {% if job.project_description %}Project Description: {{ job.project_description | richtext }}{% endif %}
  Responsibilities:
  {%tr for r in job.responsibilities %}
  • {{ r.text | richtext }}
  {%tr endfor %}
  {% endfor %}

[static closing horizontal rule — part of the template, not templated]
```

`{%tr %}` is `docxtpl`'s row-loop tag (used inside table rows so the row itself repeats, not just its cell text) — needed for the Technical Skills table.

**The `richtext` filter** is the one piece of custom code the template engine needs: a small function that takes a string like `"...for **J.P. Morgan Chase (Trade Finance)** within..."`, splits on `**...**`, and returns a `docxtpl.RichText` object with bold runs in the right places. This is the mechanism that reproduces the "important things bold" requirement without the LLM needing to output structured run arrays (which would be far more error-prone for the model to generate correctly than plain markdown-style bold).

```python
# services/template_engine/richtext.py (sketch)
import re
from docxtpl import RichText

def to_richtext(md_text: str) -> RichText:
    rt = RichText()
    parts = re.split(r"(\*\*.*?\*\*)", md_text)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            rt.add(part[2:-2], bold=True)
        elif part:
            rt.add(part)
    return rt
```

---

## 5. Reconciliation with the Affinda reference (`resumes.json`)

Affinda's schema is useful as a sanity check but is **not what we adopt directly** — it's built for generic resume parsing/search (hence deeply nested fields like `workExperience[].occupation.normalizedTitle`, `dateRange.start.precision`, taxonomy IDs for O*NET-style skill matching) which we don't need for a fixed-template rendering use case. Where it's genuinely useful:

- **Date range shape** (`start`/`end` with a `current` flag) — we adopted the same idea (`start_date`/`end_date`/`is_current`) since "still employed here" is a real, common case worth modeling explicitly rather than inferring from a null end date alone.
- **Skill source/evidence pattern** — Affinda tags each skill with the section it came from; we generalized this into our confidence/provenance system, applied more broadly (every bullet, not just skills).
- **What we deliberately dropped:** taxonomy IDs (`af_79kps4a23b`-style), `employmentMetrics`, `patents`, `publications`, `referees`, `interests`, `associations` — none of these map to any section of the Copious template, and carrying unused fields around is exactly the kind of speculative generality that makes a schema harder to maintain, not easier. If a future template needs one of these, add it then.

---

## 6. Skills taxonomy — starter workbook

Category *names* vary per candidate (a Project Manager's CV groups skills differently than an Architect's) — the LLM should default to whatever grouping the source CV already uses. But **individual skill names** still benefit from normalization (`JS`/`Javascript`/`ECMAScript` → `JavaScript`) so search/matching (P2 job-matching feature) works later. A starter taxonomy workbook (`skills-taxonomy-starter.xlsx`) is provided separately — seeded from the actual skills found across all 3 reference CVs — as the editable seed for the P1 skill-normalization feature. It is not a blocker for MVP (MVP can pass skills through as-is), but starting it now means P1 is a config change, not a fresh data-collection effort.