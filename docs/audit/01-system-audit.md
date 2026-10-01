# System Audit Report — My Copious · CV Generator

> **Author**: Principal Engineer & Architect, My Copious Platform  
> **Task**: Task 1 of 15 — End-to-End System Audit & Context Capture  
> **Repository**: `shubham-dube/CVMorph` (Branch: `chore/01-system-audit` based on `master@0e33523`)  
> **Date**: October 2026  
> **Status**: Completed

---

## Executive Summary

**My Copious · CV Generator** is an internal software application built for the Talent Acquisition (TA) team at **Copious** ([gocopious.com](https://www.gocopious.com/)), a specialized tech talent recruiting and consulting firm with headquarters in Johannesburg and delivery centers in Pune, Chennai, and Singapore.

The application addresses a costly and error-prone manual bottleneck: when candidates are submitted to client organizations, TA recruiters must manually redact, edit, and re-format candidate resumes into Copious's branded corporate CV template. Previously, recruiters spent hours copy-pasting resumes into commercial AI tools with inconsistent formatting, loss of confidential details, and no audit trail.

A working prototype was developed rapidly in a hackathon setting under the moniker "CVMorph". While the core concept is sound and demonstrates high recruiter value, the current codebase exhibits the typical technical debt of a fast MVP:
1. **Critical Security Vulnerabilities**: An unverified base64 decoding fallback in the Google auth handler permits trivial identity takeover; production Cloudflare R2 secrets are committed to git; and Next.js 16.3.3 is vulnerable to remote code execution.
2. **Multi-Tenancy Breakdown**: User signups create isolated personal workspaces rather than attaching recruiters to the corporate Copious organization.
3. **Fragile Background Execution**: In-process `BackgroundTasks` handle heavy document parsing and LibreOffice compilation without durable queuing, losing in-flight jobs on server restart.
4. **Brand & Design Dissonance**: The interface uses purple design tokens (`#8b7cf6`) and hardcoded "CVMorph" branding, entirely detached from Copious's official emerald (`#01AA83`) and mint (`#48D7AC`) brand identity.
5. **Database Deficiencies**: The database uses unindexed `JSON` instead of `JSONB`, lacks soft-delete protection, and suffers from severe N+1 query patterns on dashboard screens.

This audit provides a comprehensive end-to-end technical assessment across all layers and feeds directly into the 15-task production engineering overhaul.

---

## 1. Tech Stack, Versions & Dependency Audit

| Layer | Component | Version in Repo | Latest Stable / Recommended | Audit Finding & Status |
|---|---|---|---|---|
| **Frontend Framework** | Next.js | `16.3.3` | `16.3.8` / `15.2.x` | **CRITICAL**: Vulnerable to RCE via `next/og` ImageResponse ([`GHSA-vcvr-r3jv-pc5j`](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)). Must update immediately. |
| **Frontend Runtime** | React / React DOM | `19.2.8` | `19.x` | Canary/pre-release React 19 build. Stable for standard hooks. |
| **CSS Framework** | Tailwind CSS | `^4.0.0` | `4.x` | Tailwind v4 inline `@theme` in `globals.css`. |
| **Client Auth** | Firebase Web SDK | `^12.18.0` | `12.x` | **HIGH**: Pulls vulnerable `@grpc/grpc-js` (certificate bypass). |
| **State & Data Fetching**| TanStack Query | `^5.62.0` | `5.66.x` | Up to date, stable. |
| **Icons** | Lucide React | `^0.469.0` | `0.475.x` | Up to date. |
| **Backend Framework** | FastAPI | `>=0.115.0` (Installed `0.141.1`) | `0.141.x` | Up to date, asynchronous. |
| **Python Runtime** | CPython | `>=3.12` (Host `3.12.10`) | `3.12.10` | Supported LTS. |
| **Database ORM** | SQLAlchemy | `>=2.0.0` (Installed `2.0.52`) | `2.0.x` | Up to date async ORM. |
| **Migrations** | Alembic | `>=1.13.0` (Installed `1.19.1`)| `1.19.x` | Migrations 001–005 verified. |
| **Database Driver** | asyncpg / psycopg2 | `0.31.0` / `2.9.12` | Latest | Dual driver (async for API, sync for Alembic). |
| **AI / LLM SDK** | google-genai / anthropic | `2.20.0` / `1.0.0` | Latest | Google GenAI SDK used for Gemini 3.5 Flash structured parsing. |
| **Document Parsing** | PyMuPDF (fitz) / python-docx | `1.28.2` / `1.2.0` | Latest | High-speed C-based PDF text parser and OpenXML reader. |
| **Template Engine** | docxtpl / Jinja2 | `0.20.2` / `3.1.6` | Latest | OpenXML Word template manipulation. |
| **PDF Conversion** | Headless LibreOffice | Installed in Docker | 24.x | Converts `.docx` to `.pdf`. Crashes on Windows host outside Docker. |
| **Object Storage** | boto3 / botocore | `1.43.80` | Latest | S3-compatible client for Cloudflare R2. |
| **Package Managers** | Python `uv` / Node `npm` / `pnpm` | `uv 0.12.7`, `npm 11.13.0` | `pnpm 9.x` | **Conflict**: `package.json` specifies `pnpm@9.0.0`, but `package-lock.json` is committed and pnpm is missing from PATH. |

### Dependency Vulnerability Summary
- **npm audit**: 7 vulnerabilities (1 Critical, 6 High).
  - Critical: `next` 16.3.3 RCE ([`GHSA-vcvr-r3jv-pc5j`](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)).
  - High: `@grpc/grpc-js` (certificate spoofing), `brace-expansion` (ReDoS), `js-yaml` (DoS).
- **Python uv audit**: No known remote exploits in core packages, but orphaned Celery dependencies remain in codebase.

---

## 2. Architecture & Data Flow

Detailed architectural diagrams and sequence maps are documented in [`docs/current-state/architecture.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/architecture.md).

### Component Topology
1. **Edge Router (`vercel.json`)**: Directs `/v1/*` traffic to the containerized FastAPI microservice and all other routes to the Next.js frontend.
2. **Route Guard (`apps/web/proxy.ts`)**: Evaluates `cvmorph_session` cookie at the edge.
3. **API Layer (`apps/api/app/main.py`)**: Mounts 9 routers under `/v1/`, enforcing PostgreSQL Row-Level Security via connection set-config hooks.
4. **Pipeline Engine**: Operates in-process via FastAPI `BackgroundTasks`, chaining text extraction, Gemini LLM structured outputs, and headless LibreOffice rendering.
5. **Storage & Database**: Persistent state stored across Supabase PostgreSQL (AWS eu-west-1 pooler) and Cloudflare R2 object storage.

---

## 3. Folder Structure & Responsibility Audit

```
cvmorph/
├── apps/
│   ├── api/                   # Backend application
│   │   ├── app/
│   │   │   ├── api/v1/        # Routers & Dependencies (Cleanly isolated)
│   │   │   ├── core/          # Config, logging, security (Contains hardcoded brand strings)
│   │   │   ├── db/            # Models & migrations (Mixed schema concerns, JSON vs JSONB)
│   │   │   ├── pipeline/      # Async orchestrators (Tightly coupled to BackgroundTasks)
│   │   │   ├── schemas/       # Canonical CandidateProfile schema (Well structured)
│   │   │   ├── services/      # AI providers, parsers, docxtpl, R2 storage (Solid primitives)
│   │   │   └── workers/       # Celery stubs (CRITICAL LEAK: Orphaned dead code)
│   │   └── tests/             # Tests (Broken on Windows due to .venv symlink conflict)
│   │
│   └── web/                   # Frontend Next.js application
│       ├── app/               # App Router pages (9 screens audited)
│       ├── components/        # UI components (Mixed styling, purple accent tokens)
│       │   ├── layout/        # Sidebar, Topbar
│       │   ├── review/        # Review Studio subcomponents & AI Copilot drawer
│       │   └── ui/            # Reusable primitives (Button, Card, Badge, etc.)
│       └── lib/               # ApiClient, AuthContext, Firebase (Dual auth confusion)
│
├── packages/
│   └── shared-types/          # Canonical TypeScript models matching backend JSON
├── infra/docker/              # Postgres initialization script
├── scripts/                   # Automated multi-environment Vercel deploy script
└── docs/                      # Centralized documentation architecture
```

---

## 4. Screens & Routes Audit

All 9 routes were visited on a live local development server and captured using the browser subagent. Full details are in [`docs/current-state/screens.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/screens.md):

1. **`/login`** — Authentication portal. Features Google sign-in and feature overview. (Screenshot: `login_screen_1790891779070.png`).
2. **`/dashboard`** — Executive recruiter analytics with 4 composite KPI cards and recent pipelines. (Screenshot: `dashboard_screen_1790891958227.png`).
3. **`/candidates`** — Searchable candidate directory with profile branching badges. (Screenshot: `candidates_screen_1790891980120.png`).
4. **`/upload`** — Dual intake portal (PDF/DOCX dropzone and direct text paste) with 4-tier strategic alignment slider. (Screenshot: `upload_screen_1790891991932.png`).
5. **`/candidates/[id]/review`** — Core Review Studio. Features side-by-side editing, confidence badges, verbatim evidence popovers, and conversational AI Copilot. (Screenshot: `review_studio_screen_1790892008131.png`).
6. **`/candidates/[id]/generate`** — Template selection and custom export instructions. (Screenshot: `generate_screen_1790892020169.png`).
7. **`/generations`** — Centralized export history with instant DOCX/PDF download triggers. (Screenshot: `generations_screen_1790892044210.png`).
8. **`/templates`** — Template gallery with system template inspection and custom `.docx` uploader. (Screenshot: `templates_screen_1790892064285.png`).
9. **`/settings`** — Workspace settings, naming conventions, and usage metrics. (Screenshot: `settings_screen_1790892103526.png`).

---

## 5. API & Database Audit

- **Endpoints**: 27 endpoints across 9 routers cataloged in [`docs/current-state/api.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/api.md).
- **Database**: 9 active tables + 1 dropped (`api_keys`). Full ER diagram and migration history cataloged in [`docs/current-state/database.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/database.md).
- **Key Findings**:
  - `candidate_profiles.profile_json` uses `JSON` rather than `JSONB`.
  - Lack of soft-delete architecture across `candidates` and `documents`.
  - Dashboard endpoint triggers severe N+1 sequential database and object storage queries.

---

## 6. End-to-End CV Pipeline & Failure Modes

Detailed pipeline analysis is documented in [`docs/current-state/cv-pipeline.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/cv-pipeline.md).

### Extraction Accuracy & Cost
- **Prompt**: Strict 16-point instructions in `gemini_system_prompt.md` forbidding hallucination and enforcing confidence scoring.
- **Model**: `gemini-3.5-flash` configured in settings (recommended to standardize to `gemini-2.5-flash`).
- **Cost Efficiency**: Structured outputs average ~1,800 prompt tokens and ~1,200 output tokens per CV, costing approximately $0.0004 per CV on Gemini Flash.
- **Failure Modes Identified**: Scanned image PDFs fail without OCR; in-process tasks drop on container restart; LibreOffice fails on Windows hosts without Docker.

---

## 7. UI & Design System Audit

- **Color Literal Scan**: 46 hardcoded color literals identified across frontend files.
- **Brand Conflict**:
  - Web App: Primary `#8b7cf6` (purple), `#6d5bd0`, `#08090d`.
  - Official Copious Brand: Emerald `#01AA83`, Mint `#48D7AC`, White `#FFFFFF`, Black `#000000`.
- **Typography Conflict**:
  - Web App: Inter & JetBrains Mono loaded via Next.js fonts.
  - Official Copious Site: Poppins, Roboto, and Open Sans.
- **Cataloged Brand Assets**: 36 official assets cataloged in [`docs/audit/brand-assets-inventory.md`](file:///d:/Projects/Resume_Formatter/docs/audit/brand-assets-inventory.md).

---

## 8. Target Architecture Recommendation (Starting Point for Task 2)

As the principal architect, I recommend the following target architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 Web Application                       │
│  - Copious Design System (Tailwind CSS v4 tokens, #01AA83 Emerald)     │
│  - Unified Session Auth (Server-side verified HTTP-only session cookie) │
│  - Shared UI Component Library (Atoms, Molecules, Review Studio)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (Bearer JWT / Session Cookie)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Platform Backend                       │
│  - Clean Layered Architecture: Handlers → Services → Repositories      │
│  - Unified Error Handling & Standardized JSON Response Shapes          │
│  - Multi-Tenant RLS Session Context with Domain-based Auto-Join        │
│  - Dynamic Role-Based Access Control (RBAC) Engine                     │
└──────────────┬────────────────────┬────────────────────┬───────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
   ┌──────────────────────┐ ┌───────────────┐ ┌──────────────────────────┐
   │ PostgreSQL 16 (JSONB)│ │ Cloudflare R2 │ │ Durable Async Job Engine │
   │ - RLS Tenant Policy  │ │ Zero-Egress   │ │ - Queue with Retries     │
   │ - Soft-Delete Trails │ │ Object Store  │ │ - Timeout Monitoring     │
   └──────────────────────┘ └───────────────┘ └──────────────────────────┘
```

### Architectural Decisions to Formalize in Task 2:
1. **Retain Python + FastAPI for Document & AI Processing**: Python's ecosystem for document manipulation (PyMuPDF, docxtpl, LibreOffice bindings) and AI SDKs is vastly superior to Node.js.
2. **Retain Next.js 16 for Frontend**: React 19 and Next.js App Router provide optimal developer velocity and server-rendered performance for internal business tools.
3. **Replace Unverified Auth with Standard OAuth Token Exchange**: Google ID tokens must be cryptographically verified against Google's public JWKS before issuing application JWTs.
4. **Transition to Durable Asynchronous Task Processing**: Replace fragile in-process `BackgroundTasks` with a durable queue (or database-backed polling worker) to guarantee job execution across container deployments.

---

## 9. Critique of the 15-Task Roadmap

Reviewing the planned 15-task sequence against our findings:

| Task # | Planned Task Title | Assessment & Recommendations |
|---|---|---|
| **Task 2** | Production-grade foundation and codebase rewrite | **Crucial First Priority**: Must address AUD-002 (leaked secrets), AUD-003 (Next.js RCE), AUD-010 (Windows uv symlink collision), and purge dead Celery code. |
| **Task 3** | Agent skills and rules | **Well placed**: Codifies architectural rules and testing expectations for subsequent agent tasks. |
| **Task 4** | Design system, app design spec, design philosophy | **High Impact**: Must ingest Copious brand assets (`#01AA83`, `#48D7AC`, Poppins/Roboto) to eliminate "CVMorph" purple styling. |
| **Task 5** | Core UI component library | **Direct Follow-up**: Builds reusable component tokens on top of Task 4 design spec. |
| **Task 6** | Error-handling architecture | **Well placed**: Establishes global error envelopes before tackling auth and backend services. |
| **Task 7** | Authentication | **Critical Security Task**: Must eliminate unverified base64 token fallback (AUD-001) and restore internal test login. |
| **Task 8** | Organizations: creation and joining | **Vital for Collaboration**: Solves AUD-005 (personal workspace fragmentation) by allowing `@gocopious.com` users to join the shared Copious organization. |
| **Task 9** | Roles and permissions engine | **Security Requirement**: Replaces static 2-role enum with granular permission engine and stops auto-admin escalation (AUD-004). |
| **Task 10**| Org management UI and permission retrofit | **Natural Follow-up**: Delivers user management and invite screens for team leads. |
| **Task 11**| Screen-by-screen module rebuild | **Core Experience**: Rebuilds all 9 screens using Tasks 4–10 foundation and eliminates N+1 query loops. |
| **Task 12**| Core CV pipeline overhaul | **Engine Overhaul**: Replaces in-process `BackgroundTasks` with durable execution, optimizes Gemini prompts, and fixes Windows LibreOffice paths. |
| **Task 13**| Repeated deep audit and remediation | **Quality Gate**: End-to-end regression audit verifying all AUD findings are resolved. |
| **Task 14**| Security, privacy, performance, accessibility, observability | **Production Hardening**: Rate limiting, GDPR/privacy data sanitation for candidate CVs, OpenTelemetry tracing. |
| **Task 15**| Vercel deployment | **Final Delivery**: Production multi-environment release on Vercel. |

*Roadmap Verdict*: The 15-task sequence is logically sound, well-ordered, and directly addresses every finding discovered in this audit. No re-ordering is required.
