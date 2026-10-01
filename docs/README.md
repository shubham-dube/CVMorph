# My Copious · CV Generator — Documentation Master Index

Welcome to the architectural and operational documentation repository for **My Copious · CV Generator** (the Talent Acquisition CV Transformation Platform for Copious).

This document serves as the master sitemap for all documentation across the 15-task production engineering overhaul.

---

## 📚 Master Sitemap

### 1. Handover, Cross-Task Ledger & Architecture Decisions
Located in [`docs/00-handover/`](file:///d:/Projects/Resume_Formatter/docs/00-handover/):
- **[`PROGRESS.md`](file:///d:/Projects/Resume_Formatter/docs/00-handover/PROGRESS.md)** — The 15-task cross-task ledger. Tracks execution status, branches, base commits, summary of work, deviations, open issues, and explicit handover instructions for the next task.
- **[`DECISIONS.md`](file:///d:/Projects/Resume_Formatter/docs/00-handover/DECISIONS.md)** — Architecture Decision Records (ADR-0001+). Records context, options evaluated, trade-offs, decisions, and consequences for platform-wide patterns.
- **[`PR_GUIDE.md`](file:///d:/Projects/Resume_Formatter/docs/00-handover/PR_GUIDE.md)** — Standardized Pull Request register. Contains PR order, branch names, base branches, titles, descriptions, test plans, risk assessments, and the strict sequential merge sequence.

---

### 2. Target Architecture & Engineering Standards
Located in [`docs/architecture/`](file:///d:/Projects/Resume_Formatter/docs/architecture/):
- **[`overview.md`](file:///d:/Projects/Resume_Formatter/docs/architecture/overview.md)** — High-level architecture, mission, core principles, layered architecture, multi-tenancy, and AI copilot boundaries.
- **[`folder-structure.md`](file:///d:/Projects/Resume_Formatter/docs/architecture/folder-structure.md)** — Monorepo directory map, backend/frontend layout, and strict naming conventions.
- **[`coding-standards.md`](file:///d:/Projects/Resume_Formatter/docs/architecture/coding-standards.md)** — Universal limits, Python/FastAPI conventions, TypeScript/Next.js conventions, structured logging, and error envelopes.
- **[`module-template.md`](file:///d:/Projects/Resume_Formatter/docs/architecture/module-template.md)** — End-to-end recipe for adding backend domains (Router -> Service -> Repository) and frontend features (`features/<feature>/`).
- **[`database-conventions.md`](file:///d:/Projects/Resume_Formatter/docs/architecture/database-conventions.md)** — UUIDs, multi-tenant isolation, soft deletes, PostgreSQL JSONB, indexing, and Alembic workflow.

---

### 3. Task 1 System Audit & Findings
Located in [`docs/audit/`](file:///d:/Projects/Resume_Formatter/docs/audit/):
- **[`01-system-audit.md`](file:///d:/Projects/Resume_Formatter/docs/audit/01-system-audit.md)** — Comprehensive end-to-end audit report: Executive Summary, complete tech stack audit (dependencies, vulnerabilities, versions), architecture mapping, failure modes, roadmap critique, and target architecture recommendation.
- **[`01-findings-register.md`](file:///d:/Projects/Resume_Formatter/docs/audit/01-findings-register.md)** — Granular findings register (AUD-001 through AUD-035+), categorizing severity (Critical, High, Medium, Low), exact code evidence (`file:line`), impact, recommended remediation, and target task (Tasks 2–15). Also inventories positive patterns to preserve.
- **[`brand-assets-inventory.md`](file:///d:/Projects/Resume_Formatter/docs/audit/brand-assets-inventory.md)** — Complete catalog of Copious brand assets (logos, social badges, LinkedIn banners, email signatures): dimensions, formats, color hex values (`#01AA83`, `#48D7AC`), variants, and UI utility ratings.
- **[`screenshots/`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/)** — High-resolution visual screenshots of all 9 application routes captured via headless browser during live system audit.

---

### 4. Current State Technical Reference (What IS, Not What Should Be)
Located in [`docs/current-state/`](file:///d:/Projects/Resume_Formatter/docs/current-state/):
- **[`architecture.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/architecture.md)** — Detailed runtime topology, inter-component communications, containerization, hosting infrastructure, and Mermaid data flow diagrams.
- **[`database.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/database.md)** — PostgreSQL relational schema, tables, column types, foreign keys, Alembic migrations (001–005), Row-Level Security (RLS) policies, and Mermaid ER diagram.
- **[`api.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/api.md)** — Comprehensive catalog of all FastAPI v1 endpoints: methods, routes, parameters, validation rules, auth dependencies, status codes, and error shapes.
- **[`screens.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/screens.md)** — Detailed screen-by-screen breakdown of all 9 Next.js routes: purpose, data models, state handling (loading, empty, error), UI components, and design observations.
- **[`cv-pipeline.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/cv-pipeline.md)** — End-to-end documentation of the CV extraction and generation pipeline: upload → object storage → text extraction → AI structured parsing → review studio → LibreOffice/docxtpl rendering → export.
- **[`auth.md`](file:///d:/Projects/Resume_Formatter/docs/current-state/auth.md)** — Complete audit of the current authentication and authorization subsystem: JWT claims, Google/Firebase integration, session cookies, permission models, and security flaws.

---

### 5. Legacy Product Specifications & References
- **[`PRD.md`](file:///d:/Projects/Resume_Formatter/docs/PRD.md)** — Original hackathon Product Requirements Document.
- **[`api-reference.md`](file:///d:/Projects/Resume_Formatter/docs/api-reference.md)** — Hackathon-era API endpoint specification.
- **[`cv_schema_template_mapping.md`](file:///d:/Projects/Resume_Formatter/docs/cv_schema_template_mapping.md)** — Canonical JSON schema to docxtpl template field mappings.
- **[`skills-taxonomy-starter.xlsx`](file:///d:/Projects/Resume_Formatter/docs/skills-taxonomy-starter.xlsx)** — Initial technical skills normalization taxonomy spreadsheet.

---

## 🔄 Documentation Maintenance Rules
1. **Never Outdate**: Any subsequent task modifying architecture, database, API contracts, or screens must update the corresponding file in `docs/current-state/`.
2. **Always Link**: Every document must use relative clickable markdown links referencing line numbers where applicable.
3. **No Phantom Docs**: If a document is deleted or renamed, update this master index immediately.
