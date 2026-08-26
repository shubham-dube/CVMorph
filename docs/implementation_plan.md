# Implementation plan

**Companion documents:** `cv-transformation-platform-prd.md` (product spec), `cv-canonical-schema-and-template-mapping.md` (data contract). This document is the build plan — folder structure, and every epic broken into tickets small enough to assign to one person.

---

## 1. Repo layout (monorepo, production-grade)

```
copious-cv/                          # rename freely — see PRD branding note
├── apps/
│   ├── api/                         # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── core/
│   │   │   │   ├── config.py        # env/settings (pydantic-settings)
│   │   │   │   ├── security.py      # JWT verify, org/role extraction
│   │   │   │   └── logging.py
│   │   │   ├── api/
│   │   │   │   └── v1/
│   │   │   │       ├── routers/
│   │   │   │       │   ├── documents.py
│   │   │   │       │   ├── candidates.py
│   │   │   │       │   ├── generations.py
│   │   │   │       │   ├── templates.py
│   │   │   │       │   ├── orgs.py
│   │   │   │       │   └── jobs.py
│   │   │   │       └── deps.py      # shared FastAPI dependencies (auth, db session, org scoping)
│   │   │   ├── models/              # SQLAlchemy ORM models (mirrors PRD §7 schema)
│   │   │   ├── schemas/             # Pydantic — includes the canonical CandidateProfile schema
│   │   │   │   └── candidate_profile.py
│   │   │   ├── services/
│   │   │   │   ├── parsing/
│   │   │   │   │   ├── pdf_parser.py
│   │   │   │   │   ├── docx_parser.py
│   │   │   │   │   └── ocr_parser.py        # P1
│   │   │   │   ├── extraction/
│   │   │   │   │   ├── provider.py          # abstract AIProvider interface
│   │   │   │   │   ├── claude_provider.py
│   │   │   │   │   ├── prompts/
│   │   │   │   │   │   ├── extraction_system_prompt.md
│   │   │   │   │   │   └── custom_instructions_guard.md
│   │   │   │   │   └── validator.py         # schema + "never invent" post-checks
│   │   │   │   ├── normalization/
│   │   │   │   │   ├── skill_normalizer.py  # P1, backed by skills-taxonomy workbook → seed table
│   │   │   │   │   └── date_normalizer.py
│   │   │   │   ├── template_engine/
│   │   │   │   │   ├── renderer.py          # docxtpl wrapper
│   │   │   │   │   └── richtext.py          # **bold** markdown → RichText runs
│   │   │   │   └── storage/
│   │   │   │       └── object_store.py      # S3/GCS client wrapper
│   │   │   ├── workers/
│   │   │   │   ├── celery_app.py
│   │   │   │   └── tasks/
│   │   │   │       ├── parse_task.py
│   │   │   │       ├── extract_task.py
│   │   │   │       └── render_task.py
│   │   │   └── db/
│   │   │       ├── session.py
│   │   │       └── migrations/              # Alembic
│   │   └── tests/
│   │       ├── unit/
│   │       ├── integration/
│   │       └── fixtures/
│   │           └── reference_cvs/           # the 3 CVs used as golden-path test fixtures
│   └── web/                         # Next.js frontend
│       ├── app/
│       │   ├── (auth)/login/
│       │   ├── (dashboard)/
│       │   │   ├── upload/
│       │   │   ├── candidates/[id]/review/
│       │   │   ├── generations/[id]/
│       │   │   ├── templates/
│       │   │   └── settings/
│       │   └── layout.tsx
│       ├── components/
│       │   ├── review/                      # confidence badges, source-evidence popover, field editors
│       │   ├── upload/
│       │   └── ui/                           # design-system primitives (shadcn-style)
│       ├── lib/
│       │   ├── api-client.ts
│       │   └── types.ts                      # TS types mirroring the canonical schema
│       └── styles/
├── packages/
│   └── shared-types/                # OpenAPI-generated or hand-kept-in-sync TS types shared by web + any future SDK
├── templates/
│   └── copious-default/
│       ├── template.docx            # the actual authored Word template with {{ }} placeholders
│       └── config.json              # section list, required fields, max lengths — drives template-builder UI later
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   └── worker.Dockerfile
│   ├── docker-compose.yml           # local dev: api, worker, redis, postgres
│   └── deploy/                      # Cloud Run / ECS configs, terraform later
├── docs/
│   ├── cv-transformation-platform-prd.md
│   ├── cv-canonical-schema-and-template-mapping.md
│   ├── implementation-plan.md       # this file
│   └── skills-taxonomy-starter.xlsx
└── .github/workflows/               # CI: lint, test, build, deploy
```

**Why this shape:** `apps/api` and `apps/web` deploy and scale independently (per PRD §5/§10). `services/` inside the API is deliberately organized by *pipeline stage* (parsing → extraction → normalization → template_engine), matching the actual data flow — so a ticket like "improve OCR" only ever touches `services/parsing/`, never `services/template_engine/`. `templates/` is separate from application code entirely, because non-engineers (an admin) will eventually edit `.docx` templates directly (P1 template builder) without touching the codebase.

---

## 2. Build order — epics

Ordered so each epic produces something demoable, and later epics never require reworking earlier ones.

```
EPIC 0  Repo & infra bootstrap
EPIC 1  Data model & migrations
EPIC 2  Upload & parsing pipeline
EPIC 3  AI extraction → canonical profile
EPIC 4  Recruiter review UI
EPIC 5  Template engine & rendering (Copious template)
EPIC 6  End-to-end generation flow
EPIC 7  Auth & org scoping
EPIC 8  Custom instructions
EPIC 9  Deploy, CI/CD, observability
```

Epics 2–5 can be staffed in parallel once Epic 1 lands, since they only share the schema contract (already finalized in `cv-canonical-schema-and-template-mapping.md`) — that's the whole point of finalizing that doc first.

---

## EPIC 0 — Repo & infra bootstrap

| # | Ticket | Output |
|---|---|---|
| 0.1 | Scaffold monorepo per §1 layout, empty FastAPI app + empty Next.js app booting locally | `pnpm dev` / `uvicorn` both run |
| 0.2 | `docker-compose.yml` for local Postgres + Redis | `docker compose up` gives a working local stack |
| 0.3 | CI skeleton: lint + typecheck on PR (no deploy yet) | Green check on a trivial PR |
| 0.4 | Branding config module (`BRAND.name` etc., per PRD naming note) | Renaming the product is a one-file change |

## EPIC 1 — Data model & migrations

| # | Ticket | Output |
|---|---|---|
| 1.1 | SQLAlchemy models for `organizations`, `users`, `candidates`, `documents` | Tables per PRD §7 |
| 1.2 | Models for `candidate_profiles`, `templates`, `generations`, `review_events` | |
| 1.3 | Models for `usage_events`, `api_keys` (unused now, schema-ready for P3) | |
| 1.4 | Alembic migration chain + Postgres RLS policies scoped on `org_id` | `psql` confirms cross-org row access is denied even via a raw query |
| 1.5 | Seed script: one internal org + one admin user, for local dev | `make seed` |

## EPIC 2 — Upload & parsing pipeline

*Depends on: Epic 1.*

| # | Ticket | Output |
|---|---|---|
| 2.1 | `POST /v1/documents` — accepts PDF/DOCX upload, virus-scans, stores in object storage, creates `documents` row, enqueues parse job | Returns `document_id` + `job_id` |
| 2.2 | `services/parsing/docx_parser.py` — extract clean text from DOCX | Unit tests against the 3 reference CVs |
| 2.3 | `services/parsing/pdf_parser.py` — extract clean text from text-based PDF | Unit tests against a couple of sample PDFs |
| 2.4 | `parse_task.py` Celery task wiring upload → parser → stores raw extracted text on `documents` | Job status transitions `queued → parsing → parsed` |
| 2.5 | `GET /v1/jobs/{job_id}` polling endpoint | Frontend can show live status |
| 2.6 | *(P1)* OCR fallback for scanned/image PDFs via Document AI/Textract | Deferred — stub with a clear "not yet supported" error in MVP |

## EPIC 3 — AI extraction → canonical profile

*Depends on: Epic 2. This is the highest-risk epic — start it early and iterate against the 3 reference CVs continuously.*

| # | Ticket | Output |
|---|---|---|
| 3.1 | Define the canonical `CandidateProfile` Pydantic schema exactly per `cv-canonical-schema-and-template-mapping.md` §3 | Schema importable, matches doc field-for-field |
| 3.2 | `services/extraction/provider.py` — abstract `AIProvider.extract(text, instructions) -> CandidateProfile` interface | Swappable providers, nothing else in the codebase imports an SDK directly |
| 3.3 | `claude_provider.py` — implementation using Claude structured/tool-use output | Returns schema-valid JSON on first pass for all 3 reference CVs |
| 3.4 | Extraction system prompt — encodes "never invent," bold-span markdown convention, category grouping heuristics (per schema doc §2) | Prompt file reviewed against all 3 reference CVs' edge cases (Rupesh: no certs, plain employment entries; Pallavi: certs present, project-heavy entries; Sabir: certs present, tech-stack-heavy entries) |
| 3.5 | `validator.py` — post-extraction checks: schema validity, confidence score sanity, flag any fact not traceable to `evidence` text | Rejects/retries on invalid output before it ever reaches the DB |
| 3.6 | `extract_task.py` Celery task: parsed text → provider → validator → `candidate_profiles` row | Job status `parsed → extracting → ready_for_review` |
| 3.7 | Golden-path test suite: run all 3 reference CVs through extraction, assert every known field (name, role, employment count, cert presence) is captured correctly | Regression safety net for prompt changes |

## EPIC 4 — Recruiter review UI

*Depends on: Epic 3 (can build against mocked API responses in parallel once the schema — Epic 3.1 — is locked).*

| # | Ticket | Output |
|---|---|---|
| 4.1 | Upload screen — drag/drop, upload progress, extraction-time custom instructions box (PRD §9.6) | |
| 4.2 | Review screen skeleton — fetch `candidate_profiles`, render read-only | |
| 4.3 | Confidence badge component + "show source" popover (evidence text) | Core trust feature from the PRD, built early |
| 4.4 | Field-level edit interactions: confirm / edit / remove, writing to `review_events` via `PATCH /v1/candidates/{id}/profile` | |
| 4.5 | Default collapse of high-confidence fields, expand-all toggle | Matches PRD §9.3 spec |
| 4.6 | "Approve & Generate" gate — disabled until all flagged fields addressed | |

## EPIC 5 — Template engine & rendering (Copious template)

*Depends on: Epic 3.1 (schema) only — can run fully in parallel with Epics 3/4.*

| # | Ticket | Output |
|---|---|---|
| 5.1 | Author `templates/copious-default/template.docx` — cover page + running header with `{{ candidate.full_name }}` / `{{ candidate.role_title }}`, matching the confirmed section structure (no header on cover, header from page 2 on) | Opens correctly in Word/Google Docs, placeholders visible |
| 5.2 | Career Summary + Education sections with `{%tr for %}` loops and the certifications-heading conditional | |
| 5.3 | Technical Skills table with row-loop | Renders correctly for candidates with 5 rows and 15 rows alike (Pallavi vs. Sabir range) |
| 5.4 | Employment & Projects section with all optional-field guards (`client`, `project_name`, `technology_used`, `project_description`) | Renders correctly for both plain entries (Rupesh-style) and project-heavy entries (Pallavi/Sabir-style) in the same document |
| 5.5 | `richtext.py` — markdown-bold → docx runs filter | Unit test: bold spans mid-sentence render correctly |
| 5.6 | `renderer.py` — `render(template_path, profile) -> docx_bytes`, pure/deterministic, no AI calls | |
| 5.7 | Visual regression check: render all 3 reference profiles, convert to PDF, eyeball against the original CVs per the docx skill's verify step | Sign-off that output is visually equivalent |
| 5.8 | `render_task.py` Celery task + `POST /v1/generations` endpoint | Job status `approved → rendering → complete` |

## EPIC 6 — End-to-end generation flow

*Depends on: Epics 2–5 all landing.*

| # | Ticket | Output |
|---|---|---|
| 6.1 | Wire full pipeline: upload → parse → extract → review → approve → render → download, no manual steps | Full happy-path demo on a brand-new (non-reference) CV |
| 6.2 | Generation result screen — preview, download `.docx`, link back to source profile | |
| 6.3 | Audit trail: every generation traceable to source document + reviewer + timestamp | |
| 6.4 | Error/retry handling at every pipeline stage (bad upload, extraction failure, invalid template render) | No silent failures anywhere in the chain |

## EPIC 7 — Auth & org scoping

*Can start in parallel with Epic 2 — needed before any real usage, not just before public launch.*

| # | Ticket | Output |
|---|---|---|
| 7.1 | Google OAuth via NextAuth on frontend | |
| 7.2 | JWT issuance/validation, `org_id`/`role` claims, FastAPI `deps.py` guard on every route | |
| 7.3 | Two roles: `admin`, `recruiter` — route/action gating | |
| 7.4 | Confirm RLS (Epic 1.4) + API-layer scoping both independently prevent cross-org access | Automated test: user from org A cannot fetch org B's candidate via any endpoint |

## EPIC 8 — Custom instructions

*Depends on: Epic 3 (extraction) and Epic 5 (rendering) both being stable — this modifies both prompts.*

| # | Ticket | Output |
|---|---|---|
| 8.1 | `documents.extraction_instructions` field + UI box (was 4.1) wired into the extraction prompt as a bounded constraint layer | |
| 8.2 | `generations.formatting_instructions` field + UI box at generation time | |
| 8.3 | Guardrail enforcement: instruction can reorder/emphasize/shorten but the validator (3.5) still rejects any new unevidenced fact even when an instruction requests one | Test case: instruction "add AWS certification" is refused, logged, surfaced to recruiter |

## EPIC 9 — Deploy, CI/CD, observability

| # | Ticket | Output |
|---|---|---|
| 9.1 | Dockerfiles for API + worker, deployed to Cloud Run/ECS | |
| 9.2 | Frontend deployed to Vercel (or equivalent) | |
| 9.3 | CI: full test suite + build on every PR, deploy on merge to main | |
| 9.4 | OpenTelemetry tracing across upload → parse → extract → render pipeline | Can answer "where did this generation spend its time" |
| 9.5 | Basic usage dashboard (PRD §15 metrics: CVs processed, avg review time, % fields corrected) | |

---

## 3. Suggested first sprint

If you want to assign work starting tomorrow, this is the minimum slice that proves the hardest part of the system end-to-end before investing in UI polish:

1. **Epic 0** (bootstrap) — 1 person, 1–2 days.
2. **Epic 1** (data model) — 1 person, in parallel with Epic 0 finishing.
3. **Epic 3.1–3.4** (schema + extraction prompt against the 3 reference CVs, via a throwaway script — no API/UI needed yet) — this is the single riskiest unknown in the whole project and should be de-risked before anyone builds UI around it.
4. **Epic 5.1–5.6** (template + renderer, fed by hand-written sample JSON matching the schema, no extraction needed yet) — proves the output side independently.

Once 3 and 4 both work standalone against the same schema, wiring them together (Epic 6) is comparatively mechanical — which is exactly why finalizing the schema document first, before writing any pipeline code, was worth doing.