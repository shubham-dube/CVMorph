# AGENTS.md — Developer & AI Agent Orientation

Welcome to **My Copious · CV Generator** (internal platform: *My Copious*, module: *Talent Acquisition CV Transformation Engine*).

---

## 1. Ground Rules for Any Developer or AI Agent
1. **Mandatory First Step**: Always read [docs/00-handover/PROGRESS.md](file:///d:/Projects/Resume_Formatter/docs/00-handover/PROGRESS.md) and [docs/README.md](file:///d:/Projects/Resume_Formatter/docs/README.md) before writing or planning any work.
2. **Sequential Roadmap**: We are executing a strict 15-task production overhaul roadmap.
   - You must never skip steps, mix tasks, or jump ahead.
   - Any architectural or platform decision made here will be reused across all future **My Copious** internal applications.
3. **No Code Without Tests & Documentation**: Every feature, schema adjustment, or endpoint modification must update documentation and include comprehensive tests.
4. **Platform Scope**:
   - Company: **Copious** ([gocopious.com](https://www.gocopious.com/)) — tech talent augmentation and consulting.
   - Target User: Talent Acquisition (TA) team.
   - Core Goal: Seamlessly transform candidate resumes in any format (PDF, DOCX, text) into official, branded Copious client-ready CVs with redaction, editing, AI copilot assistance, and deterministic DOCX/PDF export.

---

## 2. Directory Structure & Key Entry Points

```
/
├── AGENTS.md                  # This file: orientation & mandatory rules
├── README.md                  # High-level developer overview
├── DEPLOYMENT.md              # Infrastructure and deployment reference
├── vercel.json                # Unified monorepo deployment routing (Next.js + FastAPI)
│
├── apps/
│   ├── api/                   # FastAPI Backend (Python 3.12, SQLAlchemy, Alembic, uv)
│   │   ├── app/
│   │   │   ├── api/v1/        # API v1 routes & dependencies
│   │   │   ├── core/          # Settings, security, logging
│   │   │   ├── db/            # SQLAlchemy session, models, Alembic migrations, seeds
│   │   │   ├── pipeline/      # Async parsing, AI extraction, rendering pipeline
│   │   │   ├── services/      # Storage (R2/S3/local), template engine (docxtpl, LibreOffice), AI providers
│   │   │   └── workers/       # Celery worker stubs (legacy / to be modernized)
│   │   └── tests/             # Unit and integration test suites
│   │
│   └── web/                   # Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS)
│       ├── app/               # Routes: (auth)/login, (dashboard)/*
│       ├── components/        # UI library, Review studio, layout
│       └── lib/               # API client, auth context, Firebase client, types
│
├── packages/
│   └── shared-types/          # Canonical TypeScript types matching schema contracts
│
└── docs/                      # Centralized documentation system
    ├── 00-handover/           # Cross-task progression, decision records (ADRs), PR guide
    ├── audit/                 # System audit reports, findings register, brand asset inventory
    └── current-state/         # Living documentation of current architecture, DB, API, screens, pipeline
```

---

## 3. Handover & Documentation Protocol
- **Progress Ledger**: [docs/00-handover/PROGRESS.md](file:///d:/Projects/Resume_Formatter/docs/00-handover/PROGRESS.md) contains the real-time status of each task (1–15), branch names, base branches, open issues, and handover notes.
- **Decisions Log**: [docs/00-handover/DECISIONS.md](file:///d:/Projects/Resume_Formatter/docs/00-handover/DECISIONS.md) logs Architecture Decision Records (ADRs) using standard format.
- **PR Guide**: [docs/00-handover/PR_GUIDE.md](file:///d:/Projects/Resume_Formatter/docs/00-handover/PR_GUIDE.md) documents every branch's PR title, description, testing evidence, and merge sequencing.
- **Index**: [docs/README.md](file:///d:/Projects/Resume_Formatter/docs/README.md) acts as the single source of truth index for all system documentation. Keep it strictly updated.
