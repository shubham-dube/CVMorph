# CV Transformation Platform

> **AI-powered CV reformatting pipeline — internal TA tool, built for future SaaS.**
>
> Upload any CV → AI extracts a Canonical Candidate Profile → Recruiter reviews & approves → Deterministic template render → Download branded `.docx`.

[![CI](https://github.com/your-org/cv-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/cv-platform/actions)

---

## Repository map

```
cv-platform/
├── apps/
│   ├── api/          ← FastAPI backend  (Python 3.12)
│   └── web/          ← Next.js frontend (TypeScript, Tailwind)
├── packages/
│   └── shared-types/ ← Canonical schema TypeScript types (shared by web + future SDK)
├── templates/
│   └── copious-default/  ← The actual .docx template + config.json
├── infra/
│   ├── docker/       ← Dockerfiles for api + worker
│   └── docker-compose.yml
├── docs/             ← PRD, schema doc, implementation plan
└── .github/workflows/ ← CI (lint, test, build)
```

---

## Quick start (local dev)

### Prerequisites
- Docker & Docker Compose
- Node 20+ / pnpm 9+
- Python 3.12 + [uv](https://docs.astral.sh/uv/) (recommended) or pip

### 1 — Spin up Postgres + Redis
```bash
docker compose up -d
```

### 2 — Backend API
```bash
cd apps/api
cp .env.example .env          # fill in secrets
uv sync                       # or: pip install -e ".[dev]"
uv run alembic upgrade head   # run migrations
uv run make seed              # seed internal org + admin user
uv run uvicorn app.main:app --reload --port 8000
```

### 3 — Frontend
```bash
cd apps/web
cp .env.local.example .env.local   # fill in API URL + auth secrets
pnpm install
pnpm dev                           # http://localhost:3000
```

API docs (auto-generated): http://localhost:8000/docs

---

## Epic ownership — who builds what

| Epic | Description | Team / Owner |
|------|-------------|--------------|
| **EPIC 0** | Repo & infra bootstrap | DevOps / Lead |
| **EPIC 1** | Data model & migrations | Backend |
| **EPIC 2** | Upload & parsing pipeline | Backend |
| **EPIC 3** | AI extraction → canonical profile | AI / Backend |
| **EPIC 4** | Recruiter review UI | Frontend |
| **EPIC 5** | Template engine & rendering | Backend / Template |
| **EPIC 6** | End-to-end generation flow | Full-stack |
| **EPIC 7** | Auth & org scoping | Backend + Frontend |
| **EPIC 8** | Custom instructions | AI / Backend |
| **EPIC 9** | Deploy, CI/CD, observability | DevOps |

> **Epics 2–5 can run in parallel** once Epic 1 (data model) merges — the Canonical Candidate Profile JSON schema (see `docs/cv_schema_template_mapping.md`) is the only shared contract.

---

## Key contracts (read these first)

| Document | Purpose |
|----------|---------|
| [`docs/PRD.md`](docs/PRD.md) | Full product requirements |
| [`docs/cv_schema_template_mapping.md`](docs/cv_schema_template_mapping.md) | **The finalized JSON schema** — source of truth for AI extraction output, Pydantic models, and TS types |
| [`docs/implementation_plan.md`](docs/implementation_plan.md) | Build order, epics, ticket breakdown |
| [`packages/shared-types/src/candidate-profile.ts`](packages/shared-types/src/candidate-profile.ts) | TypeScript types auto-derived from the JSON schema |
| [`apps/api/app/schemas/candidate_profile.py`](apps/api/app/schemas/candidate_profile.py) | Pydantic models (source of truth on backend) |

---

## Contributing

1. Branch from `main`: `git checkout -b epic-N/short-description`
2. Open a PR — CI must pass (lint + typecheck + tests)
3. One approval required before merge
4. Epic 1 (migrations) must merge before any other epic opens a PR touching `models/`

---

## Environment variables

See [`apps/api/.env.example`](apps/api/.env.example) and [`apps/web/.env.local.example`](apps/web/.env.local.example) for required variables.

---

*Product name / branding: always reference `BRAND.name` from `apps/api/app/core/config.py` and `apps/web/lib/branding.ts` — never hardcode the product name in UI strings.*
