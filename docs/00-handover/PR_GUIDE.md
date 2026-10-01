# Pull Request Guide & Merge Sequence

This guide documents the standardized Pull Request specification, testing protocol, and strict sequential merge order across the 15-task overhaul of **My Copious · CV Generator**.

---

## 1. Overall Merge Sequence

Each task branch branches from the previous task's completed branch to ensure continuous progression:

```
master (0e33523)
  └── PR #1: chore/01-system-audit ────────────► [Task 1 Audit Deliverables]
        └── PR #2: feat/02-production-foundation
              └── PR #3: feat/03-agent-skills-rules
                    └── PR #4: feat/04-design-system-spec
                          └── PR #5: feat/05-ui-component-library
                                └── PR #6: feat/06-error-handling
                                      └── PR #7: feat/07-authentication
                                            └── PR #8: feat/08-organizations
                                                  └── PR #9: feat/09-permissions-engine
                                                        └── PR #10: feat/10-org-management-ui
                                                              └── PR #11: feat/11-screen-module-rebuild
                                                                    └── PR #12: feat/12-cv-pipeline-overhaul
                                                                          └── PR #13: chore/13-deep-audit-remediation
                                                                                └── PR #14: feat/14-hardening
                                                                                      └── PR #15: feat/15-vercel-deployment ──► Merge to master
```

---

## 2. Pull Request Register

### PR #1: Task 1 — Project Context & End-to-End System Audit
- **Order**: 1 of 15
- **Branch**: `chore/01-system-audit`
- **Base Branch**: `master` (`0e33523`)
- **PR Title**: `chore(audit): complete end-to-end system audit, findings register, and technical documentation`
- **PR Description**:
  #### Summary
  Delivers a comprehensive technical audit of the entire My Copious · CV Generator repository without modifying any application runtime code or database state. Establishes the centralized documentation architecture, living current-state technical specifications, an exhaustive findings register (AUD-001 through AUD-030), and the cross-task handover ledger for Tasks 2–15.

  #### Changes Included
  - **`AGENTS.md`**: Created root orientation instructions and mandatory handover rules for developers and AI agents.
  - **`docs/README.md`**: Authoritative documentation index and sitemap.
  - **`docs/audit/01-system-audit.md`**: Full system audit report including tech stack audit, failure modes, roadmap critique, and target architecture recommendation.
  - **`docs/audit/01-findings-register.md`**: 30 concrete findings categorized by severity, exact code evidence, impact, recommended fix, and target task (Tasks 2–15). Also cataloged positive architectural patterns to preserve.
  - **`docs/audit/brand-assets-inventory.md`**: Inventory of 36 Copious brand assets across workstation downloads, extracting color hex codes (`#01AA83`, `#48D7AC`), dimensions, and formats.
  - **`docs/audit/screenshots/`**: Full-page screenshots of all 9 application routes captured via headless browser subagent during live testing.
  - **`docs/current-state/`**: 6 deep-dive living technical references:
    - `architecture.md`: Topology, inter-service communications, Mermaid diagrams.
    - `database.md`: 10 tables, column schemas, migrations 001–005, RLS details, Mermaid ER diagram.
    - `api.md`: Catalog of all 27 REST endpoints, inputs, auth guards, and response schemas.
    - `screens.md`: Screen-by-screen breakdown of all 9 routes, states, and UI components.
    - `cv-pipeline.md`: End-to-end processing pipeline, prompts, models, and failure modes.
    - `auth.md`: Authentication models, Google OAuth flow, token specifications, and critical security flaws.
  - **`docs/00-handover/`**:
    - `PROGRESS.md`: Cross-task ledger tracking Task 1 through Task 15.
    - `DECISIONS.md`: Architecture Decision Records (ADR-0001 to ADR-0004).
    - `PR_GUIDE.md`: Standardized PR documentation and merge sequence.

  #### How It Was Tested
  1. Spun up live FastAPI server on port 8000; verified `/v1/health` and `/v1/ready` probes against Supabase PostgreSQL.
  2. Spun up live Next.js 16 development server on port 3000.
  3. Ran automated browser subagent to authenticate and navigate to all 9 screens (`/login`, `/dashboard`, `/candidates`, `/upload`, `/candidates/[id]/review`, `/candidates/[id]/generate`, `/generations`, `/templates`, `/settings`), verifying rendering and saving screenshots.
  4. Executed `npm audit` on frontend dependencies, discovering 7 vulnerabilities (1 Critical, 6 High).
  5. Analyzed brand asset image files via Python PIL script to extract exact dimensions, formats, and dominant color hex values.

  #### Risks & Discovered Vulnerabilities
  - Leaked Cloudflare R2 secrets in `.env.example` (`AUD-002`) require immediate rotation upon commencing Task 2.
  - Next.js 16.3.3 Remote Code Execution vulnerability (`AUD-003`) requires upgrading Next.js in Task 2.
  - Critical authentication bypass in `auth.py` (`AUD-001`) flagged for remediation in Task 7.

  #### Screenshots
  Screenshots saved to [`docs/audit/screenshots/`](file:///d:/Projects/Resume_Formatter/docs/audit/screenshots/).
