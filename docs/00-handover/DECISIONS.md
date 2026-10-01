# Architecture Decision Records (ADR) Log

This document records the architectural and platform design decisions for **My Copious · CV Generator**.

Format:
- **Title**: `ADR-XXXX: Title`
- **Status**: Proposed / Accepted / Superseded / Deprecated
- **Context**: The business problem or technical constraint requiring a decision.
- **Options Evaluated**: Alternatives considered with pros and cons.
- **Decision**: The chosen path and rationale.
- **Consequences**: Positive, negative, or neutral outcomes of the decision.

---

## ADR-0001: Monorepo Architecture & Microservice Routing on Vercel

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  The application consists of a Next.js frontend and a FastAPI backend with heavy native dependencies (LibreOffice, PyMuPDF). We need unified deployment, shared type definitions, and zero CORS overhead while ensuring deployment on Vercel.
- **Options Evaluated**:
  1. *Separate Repositories*: Independent repos for web and api. High overhead for type synchronization; requires cross-domain CORS configuration.
  2. *Single Node.js Next.js Fullstack App*: Porting Python document logic to Node.js. Document rendering and AI libraries in Python (`docxtpl`, `PyMuPDF`, `python-docx`) have no mature JavaScript equivalents.
  3. *Unified Monorepo with Vercel Microservices*: Next.js web application and containerized FastAPI backend hosted under a single root project using `vercel.json` rewrites.
- **Decision**:
  Adopt Option 3. Next.js serves the frontend and proxies `/v1/*` to the containerized FastAPI backend.
- **Consequences**:
  - *Positive*: Same-origin requests eliminate CORS preflight overhead and complex cookie sharing. Shared type packages can be referenced across the monorepo.
  - *Negative*: Requires careful orchestration of build artifacts and container memory limits on Vercel.

---

## ADR-0002: Dual-Layer Multi-Tenancy via PostgreSQL Row-Level Security (RLS)

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  Candidate CVs contain highly sensitive personal identifiable information (PII). A database query omitting an `org_id` filter could lead to critical cross-tenant data leaks.
- **Options Evaluated**:
  1. *Application-Layer Filtering Only*: Rely solely on developers appending `.where(Model.org_id == org_id)` on every query. High human error risk.
  2. *Separate Database / Schema Per Tenant*: Strict physical separation. High operational overhead for provisioning and migration maintenance.
  3. *Defense-in-Depth with PostgreSQL RLS + Transaction-Scoped Config*: Enforce application-layer filtering AND PostgreSQL Row-Level Security policies activated via `SET LOCAL app.current_org_id = :org_id`.
- **Decision**:
  Adopt Option 3. Every session runs `SELECT set_config('app.current_org_id', :org_id, false)` which is PgBouncer transaction-mode safe.
- **Consequences**:
  - *Positive*: Even if an application query omits `org_id`, the database engine refuses to return rows outside the current tenant.
  - *Negative*: Background tasks running outside HTTP requests must explicitly manage session scoping using `get_session_for_org(org_id)`.

---

## ADR-0003: Canonical Candidate Profile JSON Schema with Provenance & Confidence Tracking

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  AI extraction cannot be trusted blindly. Recruiter clients require transparency into whether bullet points were copied verbatim from the candidate's resume, lightly rewritten, or synthesized by AI.
- **Options Evaluated**:
  1. *Unstructured Markdown Output*: LLM returns formatted markdown directly. Hard to edit programmatically or validate against template constraints.
  2. *Strict Normalized Relational Tables*: Separate relational tables for every skill, responsibility bullet, and award. Impedes AI extraction, version branching, and makes schema evolution cumbersome.
  3. *Canonical Pydantic JSON Model with Field-Level Provenance*: A unified, validated JSON structure where every field carries `confidence` (0.0 to 1.0), `source_type` (source, verified_transformation, ai_generated), and verbatim `evidence` text.
- **Decision**:
  Adopt Option 3. Store `CandidateProfile` as a structured JSON blob in the database with strict Pydantic v2 validation.
- **Consequences**:
  - *Positive*: Perfect traceability for recruiters in Review Studio; seamless integration with `docxtpl` Jinja templates; frictionless profile branching and tailoring.
  - *Negative*: Database columns should be migrated from `JSON` to `JSONB` for performance (flagged in AUD-019).

---

## ADR-0004: Standardizing on Copious Brand Identity & Retiring "CVMorph"

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  The prototype was built under the hackathon name "CVMorph" with arbitrary purple design tokens (`#8b7cf6`). The platform is officially part of **My Copious** for the Copious Talent Acquisition team.
- **Options Evaluated**:
  1. *Retain CVMorph as a Sub-Brand*: Keep purple styling and CVMorph logos. Causes brand confusion and fails company design requirements.
  2. *White-Label Chameleon Theme*: Support dynamic theme switching. Premature complexity for an internal company platform.
  3. *Full Brand Unification*: Align with official Copious branding: `#01AA83` (Emerald Teal), `#48D7AC` (Mint Accent), `#08090D` (Obsidian Dark), `#FFFFFF` (White), and fonts Poppins/Roboto.
- **Decision**:
  Adopt Option 3 across all application screens, documentation, email templates, and generated resumes starting in Task 4.
- **Consequences**:
  - *Positive*: Establishes a cohesive, premium design system that will be reused across all future My Copious applications.
  - *Negative*: Requires refactoring 46 hardcoded color literals and 18+ UI file brand references during Tasks 4, 5, and 11.

---

## ADR-0005: Monorepo Tooling — Standardizing on npm Workspaces & Turborepo

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  The repo had a tooling mismatch: `package.json` declared `"packageManager": "pnpm@9.0.0"`, but `package-lock.json` was committed, pnpm was not pre-installed on the host or CI, and Vercel builds were experiencing lockfile conflicts.
- **Options Evaluated**:
  1. *Force pnpm across all developer environments*: Requires pre-installing corepack/pnpm on every local machine and Docker container.
  2. *Standardize on npm workspaces with Turborepo*: Native to standard Node.js installations, compatible with Vercel zero-config deployments, deterministic with single root `package-lock.json`.
- **Decision**:
  Adopt Option 2: Standardize on npm workspaces with Turborepo caching for frontend and shared packages, and `uv` for Python backend packaging.
- **Consequences**:
  - *Positive*: Eliminates package manager collisions; enables cached parallel linting, typechecking, and builds across monorepo packages.
  - *Negative*: Workspace dependencies in `package.json` use `"packages/*"` with standard npm workspace syntax (`file:packages/...` or npm workspaces).

---

## ADR-0006: Frontend Modular Architecture — Feature-Driven Packaging

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  Next.js route files in `apps/web/app/` were becoming god files holding mixed data fetching, business logic, form validation, and complex UI layouts.
- **Options Evaluated**:
  1. *Flat components/ directory*: Keep all components in `components/`, grouped only by type (`ui/`, `review/`, `layout/`). Leaks feature-specific state and logic across screens.
  2. *Feature-Driven Modules (`features/<feature>/`)*: Encapsulate domain logic, hooks, schemas, API calls, and components into feature directories (`features/auth`, `features/candidates`, `features/review`, `features/upload`, `features/templates`, `features/generations`, `features/dashboard`). App router files become thin composition layers (<50 LOC).
- **Decision**:
  Adopt Option 2: All domain-specific UI, hooks, and schemas live inside `apps/web/features/*`. Shared generic primitives remain in `components/ui/`.
- **Consequences**:
  - *Positive*: High cohesion and clear ownership. Features can be easily refactored, tested in isolation, or migrated into shared packages.
  - *Negative*: Requires migrating existing scattered review and upload components into structured feature folders.

---

## ADR-0007: Backend Layered Architecture — Transport, Service, Repository

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  FastAPI router files (e.g. `candidates.py` with 1187 lines) were combining HTTP routing, complex DB queries, AI prompt formatting, audit logging, and document orchestration in single bloated endpoints.
- **Options Evaluated**:
  1. *Fat Controllers / Routers*: Continue writing inline SQLAlchemy queries and business logic inside router functions. Fast to prototype, impossible to test or maintain.
  2. *Strict 3-Tier Layered Architecture*:
     - **Transport Layer (`api/v1/routers/`)**: Pure HTTP concern — path, method, schema validation, dependency injection, status code.
     - **Service Layer (`services/`)**: Core business rules, AI orchestration, approval constraints, and pipeline dispatch.
     - **Repository Layer (`repositories/`)**: Encapsulates SQLAlchemy database queries, joins, and RLS tenant enforcement.
- **Decision**:
  Adopt Option 2: Refactor backend into Transport -> Service -> Repository. Route handlers must never execute raw database queries or direct AI SDK calls.
- **Consequences**:
  - *Positive*: Allows mock-based unit testing of business logic without a database; decouples database queries from HTTP semantics; solves N+1 query patterns centrally.
  - *Negative*: Slightly higher file count per module (Router, Service, Repository).

---

## ADR-0008: Shared Contracts & Runtime Validation Boundary

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  The TypeScript definitions in `apps/web/lib/types.ts` were maintained manually and drifted from the Pydantic schemas in `apps/api/app/schemas/candidate_profile.py`.
- **Options Evaluated**:
  1. *Manual Duplicate Types*: Maintain separate types in frontend and backend. Highly prone to silent drift and runtime JSON mismatch bugs.
  2. *Centralized Type Package with Zod & Pydantic Alignment*: Maintain canonical schema definitions in `packages/shared-types` with TypeScript types and runtime Zod validation schemas that mirror Pydantic models.
- **Decision**:
  Adopt Option 2: `packages/shared-types` serves as the single source of truth for the Canonical Candidate Profile, API error envelopes, and review event schemas.
- **Consequences**:
  - *Positive*: Compile-time type safety across frontend and backend; runtime validation catches corrupted data before rendering.
  - *Negative*: Both frontend and shared-types must be built during CI.

---

## ADR-0009: Strict Dependency Boundaries & Lint Enforcement

- **Status**: **Accepted**
- **Date**: 2026-10-02
- **Context**:
  Without automated boundary enforcement, developers and agents easily introduce circular dependencies, import database models in frontend code, or bypass service layers.
- **Options Evaluated**:
  1. *Documentation only*: Rely on code review and architecture guidelines. Fails over time.
  2. *Lint-enforced boundary rules (ESLint `no-restricted-imports` & Ruff boundary rules)*: Automated CI checks fail immediately if a layer imports from a forbidden layer.
- **Decision**:
  Adopt Option 2: Configure ESLint import restrictions and Ruff module linting to enforce architectural boundaries.
- **Consequences**:
  - *Positive*: Zero architectural decay over future development tasks.
  - *Negative*: Strict imports require occasional explicit re-exports through index barrels.

