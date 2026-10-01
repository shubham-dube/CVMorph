# My Copious · Folder Structure & Naming Conventions

## 1. Monorepo Root Layout

```
my-copious/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Monorepo CI: Lint, Typecheck, Test, Build
├── apps/
│   ├── api/                       # Backend FastAPI Service (Python 3.12, uv)
│   └── web/                       # Frontend Next.js 16 Web Application (React 19, TypeScript)
├── packages/
│   └── shared-types/              # Shared TypeScript interfaces & Zod validation schemas
├── docs/                          # Living Architecture, Audits, PRs, and Guides
│   ├── 00-handover/               # Cross-task progression, ADRs, PR guide
│   ├── architecture/              # Living system architecture & conventions
│   ├── audit/                     # Initial system audit & brand inventories
│   └── current-state/             # System snapshots
├── .editorconfig                  # Uniform formatting (indentation, charset, line endings)
├── .gitignore                     # Repository-wide ignore patterns
├── AGENTS.md                      # AI agent orientation & mandatory rules
├── package.json                   # Root npm workspaces & Turborepo orchestration
├── pnpm-lock.yaml                 # Deprecated (migrated to package-lock.json)
├── README.md                      # 5-minute setup and developer onboarding
├── turbo.json                     # Turborepo task pipeline configuration
└── vercel.json                    # Monorepo unified serverless routing
```

---

## 2. Backend Structure (`apps/api/`)

```
apps/api/
├── alembic.ini                    # Database migration configuration
├── pyproject.toml                 # uv package definition & tool configs (ruff, mypy, pytest)
├── uv.lock                        # Deterministic Python dependency lockfile
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI application initialization & middleware
│   ├── api/                       # Transport Layer
│   │   ├── deps.py                # FastApi dependency injection (auth, db, current user)
│   │   └── v1/
│   │       ├── router.py          # Unified v1 router mounting sub-routers
│   │       └── routers/           # HTTP endpoints (routing, HTTP status, schema validation)
│   │           ├── auth.py
│   │           ├── candidates.py
│   │           ├── cv.py
│   │           ├── generations.py
│   │           ├── health.py
│   │           └── templates.py
│   ├── core/                      # Application Kernel
│   │   ├── config.py              # Pydantic Settings (environment validation)
│   │   ├── logging.py             # Structured, request-scoped, PII-safe logger
│   │   └── security.py            # Password hashing, JWT verification, API key auth
│   ├── db/                        # Database Layer
│   │   ├── base.py                # DeclarativeBase model registry
│   │   ├── session.py             # Async SQLAlchemy session management
│   │   ├── migrations/            # Alembic migration scripts
│   │   │   └── versions/
│   │   └── seeds/                 # Idempotent database seed scripts
│   ├── models/                    # SQLAlchemy Declarative Models
│   │   ├── audit_log.py
│   │   ├── candidate.py
│   │   ├── candidate_profile.py
│   │   ├── cv_generation.py
│   │   ├── organization.py
│   │   ├── template.py
│   │   └── user.py
│   ├── repositories/              # Repository Layer (Data Access & Query Logic)
│   │   ├── base.py                # Generic AsyncRepository[T] with soft-delete & tenant filter
│   │   ├── audit_log.py
│   │   ├── candidate.py
│   │   ├── cv_generation.py
│   │   └── template.py
│   ├── schemas/                   # Pydantic DTOs & Validation Schemas
│   │   ├── auth.py
│   │   ├── candidate.py
│   │   ├── candidate_profile.py   # Canonical Profile schema
│   │   ├── cv_generation.py
│   │   └── template.py
│   ├── services/                  # Business Logic & External Integrations
│   │   ├── ai/                    # AI extraction & Gemini client
│   │   ├── auth.py                # Authentication & token service
│   │   ├── candidate.py           # Candidate profile lifecycle & versioning
│   │   ├── generation.py          # CV rendering orchestration
│   │   ├── storage/               # File storage providers (R2, S3, Local)
│   │   └── template/              # docxtpl Jinja2 & LibreOffice renderers
│   └── pipeline/                  # Resume Transformation Pipeline
│       ├── extractor.py           # Multi-modal extraction
│       ├── normalizer.py          # JSON canonicalization & validation
│       └── parser.py              # Text/DOCX/PDF parsing
└── tests/                         # Automated Test Suite
    ├── conftest.py                # Pytest fixtures & mock dependencies
    ├── fixtures/                  # Real-world anonymized CV samples & schemas
    ├── integration/               # Database & API endpoint integration tests
    └── unit/                      # Pure unit tests (parsers, validators, templates)
```

---

## 3. Frontend Structure (`apps/web/`)

```
apps/web/
├── app/                           # Next.js 16 App Router (Thin Page Wrappers)
│   ├── layout.tsx                 # Root HTML shell, fonts, global providers
│   ├── page.tsx                   # Root redirect / landing
│   ├── (auth)/
│   │   └── login/page.tsx         # Login screen (wraps features/auth/components/LoginForm)
│   └── (dashboard)/
│       ├── layout.tsx             # Authenticated shell (Sidebar, Topbar, Org Context)
│       ├── dashboard/page.tsx     # Overview dashboard
│       ├── candidates/
│       │   ├── page.tsx           # Candidate list
│       │   └── [id]/page.tsx      # Candidate details
│       ├── upload/page.tsx        # CV Upload & ingestion screen
│       ├── review/[id]/page.tsx   # Interactive Review Studio
│       ├── templates/page.tsx     # Template management
│       ├── generations/page.tsx   # Generation history & downloads
│       └── settings/page.tsx      # Organization & user settings
├── components/                    # Shared Presentation Components
│   ├── layout/                    # App Shell (Sidebar, Header, Breadcrumbs)
│   └── ui/                        # Design System Primitives (Button, Modal, Input, Toast)
├── features/                      # Domain Feature Modules
│   ├── auth/                      # Authentication state, login form, auth guards
│   ├── candidates/                # Candidate tables, search, filters, cards
│   ├── dashboard/                 # Metrics, recent activity, quick actions
│   ├── generations/               # Download table, format badges, re-render actions
│   ├── review/                    # Review Studio components, diff viewer, AI chat copilot
│   ├── templates/                 # Template cards, preview modals, uploaders
│   └── upload/                    # File dropzone, parsing progress, preview
├── hooks/                         # Cross-feature utility hooks (useDebounce, useMediaQuery)
├── lib/                           # Core utilities
│   ├── api.ts                     # Axios/fetch HTTP client with interceptors
│   ├── auth.ts                    # Firebase Auth integration
│   ├── config.ts                  # Client environment configuration
│   └── utils.ts                   # Tailwind class merge (cn) & formatting helpers
└── styles/
    └── globals.css                # Tailwind CSS v4 directives & color variables
```

---

## 4. Naming Conventions

### 4.1 File & Directory Names
| Category | Convention | Examples |
|---|---|---|
| Frontend Components | PascalCase or kebab-case | `CandidateTable.tsx`, `button.tsx` |
| Frontend Hooks | camelCase with `use` prefix | `useCandidate.ts`, `useReviewState.ts` |
| Frontend Utilities | camelCase or kebab-case | `formatDate.ts`, `api-client.ts` |
| Backend Python Files | snake_case | `candidate_profile.py`, `cv_generation.py` |
| Database Tables | snake_case, plural | `candidates`, `candidate_profiles`, `organizations` |
| Database Columns | snake_case | `org_id`, `created_at`, `is_deleted` |
| API Endpoints | kebab-case, plural nouns | `/v1/candidates/{id}/profiles`, `/v1/cv/generate` |

### 4.2 TypeScript & Python Type Naming
- **Interfaces & Types**: PascalCase (`CandidateProfile`, `CVGenerationRequest`).
- **Enums**: PascalCase for name, UPPER_SNAKE_CASE for values (`CandidateStatus.APPROVED`).
- **Pydantic Models**: PascalCase (`CandidateCreate`, `CandidateResponse`).
- **SQLAlchemy Models**: PascalCase singular (`Candidate`, `Organization`, `Template`).
