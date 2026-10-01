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
