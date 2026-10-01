# My Copious · Architecture Overview

## 1. System Mission & Context
**My Copious** is the internal software platform for **Copious** ([gocopious.com](https://www.gocopious.com/)), a talent augmentation and consulting firm for top-tier tech talent.
The **CV Transformation Engine** is the initial core module of My Copious. It enables Talent Acquisition (TA) specialists to:
1. Ingest candidate resumes in arbitrary formats (PDF, DOCX, text).
2. Extract rich, structured candidate profiles (with multi-modal AI and strict validation).
3. Review, redact, modify, and curate candidate details in an interactive Review Studio.
4. Deterministically compile branded, client-ready Copious CVs in DOCX and PDF formats using Jinja2-based DOCX templating and LibreOffice headless rendering.

The architectural foundation defined here is designed not just for this single application, but as the reusable foundation for all upcoming My Copious internal apps (e.g. ATS integration, client portal, skill assessments).

---

## 2. High-Level System Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │                      Client Layer                      │
                    │   Next.js 16 (React 19) App Router + Tailwind CSS      │
                    │   - Feature Modules (Candidates, Review, Upload, etc.) │
                    │   - Shared UI Primitives & Design Tokens               │
                    └───────────────────────────┬────────────────────────────┘
                                                │ HTTPS / REST (JSON)
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │                      API Gateway                       │
                    │   Vercel Serverless Routing / FastAPI v1 (/v1/*)       │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                ┌───────────────────────────────┴───────────────────────────────┐
                ▼                                                               ▼
┌───────────────────────────────┐                               ┌───────────────────────────────┐
│     Transport Layer (HTTP)    │                               │     Transport Layer (HTTP)    │
│  FastAPI Routers, Auth Deps,  │                               │  FastAPI Routers, Auth Deps,  │
│  Pydantic Request Schemas     │                               │  Pydantic Request Schemas     │
└───────────────┬───────────────┘                               └───────────────┬───────────────┘
                │ Calls                                                         │ Calls
                ▼                                                               ▼
┌───────────────────────────────┐                               ┌───────────────────────────────┐
│         Service Layer         │                               │       Pipeline Engine         │
│  Business Rules, Audit Trails,│                               │  Parser -> AI Extraction ->   │
│  Validation, Orchestration    │                               │  Docx Template -> PDF Render  │
└───────────────┬───────────────┘                               └───────────────┬───────────────┘
                │ Queries                                                       │ Stores / Fetches
                ▼                                                               ▼
┌───────────────────────────────┐                               ┌───────────────────────────────┐
│       Repository Layer        │                               │       External Services       │
│  SQLAlchemy 2.0 Async Queries,│                               │  - Google Gemini 2.5 Flash    │
│  Multi-Tenant Org Isolation   │                               │  - Cloudflare R2 / S3 Storage │
└───────────────┬───────────────┘                               │  - LibreOffice Headless       │
                │                                               └───────────────────────────────┘
                ▼
┌────────────────────────────────────────────────────────┐
│               PostgreSQL Database (Supabase)           │
│   Multi-tenant, Foreign Keys, Soft Deletes, JSONB      │
└────────────────────────────────────────────────────────┘
```

---

## 3. Core Architectural Principles

### 3.1 Strict Layering & Separation of Concerns
1. **Transport Layer (`apps/api/app/api/v1/`)**: Pure HTTP gateway. Validates request schemas, handles authentication and tenant resolution via dependency injection, calls services, and formats HTTP responses. **Zero business logic or direct DB access allowed here.**
2. **Service Layer (`apps/api/app/services/`)**: Orchestrates business rules, transactions, permission checks, audit logging, and external integrations (AI, storage, rendering). Services interact with data solely through repositories.
3. **Repository Layer (`apps/api/app/repositories/`)**: Encapsulates all SQLAlchemy queries and database interactions. Automatically applies multi-tenant filtering (`org_id`) and soft-delete filters (`is_deleted = False`).
4. **Shared Contracts (`packages/shared-types/`)**: Single source of truth for schema definitions shared across frontend and backend. Prevents API drift.

### 3.2 Feature-Driven Frontend Architecture
1. **Page Routes are Thin Orchestrators**: Next.js App Router files (`apps/web/app/(dashboard)/*`) contain fewer than 50 lines of code. They compose feature-level components and coordinate route metadata.
2. **Feature Colocation (`apps/web/features/*`)**: Feature-specific UI, React hooks, state management, API queries, and validation schemas live together in domain modules (`candidates/`, `review/`, `upload/`, `templates/`, `generations/`, `dashboard/`).
3. **Reusable Design System (`apps/web/components/ui/`)**: Pure presentation components (Buttons, Inputs, Dialogs, Cards) decoupled from any domain logic.

### 3.3 Multi-Tenant by Design
Every database model (with the exception of global system templates) contains an `org_id` column. Repositories enforce tenant isolation automatically, preventing cross-tenant data leakage.

### 3.4 Deterministic Document Pipeline
CV rendering relies on `python-docx` and `docxtpl` for templated document generation, paired with headless LibreOffice for PDF compilation. Document schemas are strictly validated against Pydantic models before rendering to guarantee layout stability.

### 3.5 AI Copilot as an Assistant, Not an Authority
The AI extraction engine (Google Gemini 2.5 Flash) ingests raw text, emits structured JSON with explicit source citations (`evidence` strings), and flags unverified facts. Talent Acquisition specialists retain full manual control in the Review Studio to override or redact any content before final generation.
