# [Product Name TBD] — Product Requirements Document
### AI-Powered CV / Resume Transformation Platform

**Status:** Draft v1
**Owner:** Product & Engineering
**Last updated:** August 26, 2026

> Placeholder naming convention used throughout this doc: **"the Platform"**. Every user-facing string (product name, logo, domain) should be pulled from a single config/branding module (`/config/branding.ts` + env vars) so renaming later is a one-file change, not a find-and-replace across the codebase. Do not hardcode the product name in component text — always reference `BRAND.name`.

---

## 1. Executive summary

The Platform converts an unstructured candidate CV (any format, any layout) into a fully formatted, company-branded CV — with a human recruiter reviewing and approving every output before it goes to a client. Internally, this replaces 20–40 minutes of manual reformatting per candidate with a few minutes of review.

Architecturally, this is being built **API-first, multi-tenant, and provider-agnostic from day one** — even though the first customer is our own internal talent acquisition team — so that the exact same system can later be opened up as a paid public SaaS product without a rewrite.

**Core design philosophy (non-negotiable, carried over and refined from prior discussion):**

> AI extracts and normalizes. Deterministic rules and templates control the final document. A human approves before anything leaves the system.

This separation is what makes the product reliable, auditable, and sellable — customers (internal or external) will not trust a black box that silently rewrites facts about a candidate.

---

## 2. Goals

### 2.1 Business goals
- Cut CV formatting time for our internal TA team by >80%.
- Build the system so it can be white-labeled / multi-tenant and sold as a self-serve SaaS product to other staffing agencies later, without re-architecture.
- Create a defensible product (accuracy + customization + trust features) rather than a thin LLM wrapper.

### 2.2 Product goals
- Recruiters never have to trust AI blindly — every field is traceable to source text.
- Any company can define its own CV template without an engineer.
- Works with whatever format a candidate sends (PDF, DOCX, scanned, even a messy Google Doc export).
- Fast enough to feel instant for a single CV (<20s end-to-end), and supports bulk (50+ CVs) without falling over.

### 2.3 Non-goals (explicitly out of scope for now)
- Full ATS (applicant tracking system) — we integrate with ATS's later, we don't replace them.
- Candidate-facing product (this is a recruiter/employer tool, not a resume builder for job seekers) — though the underlying engine could power that later.
- Automatic sending of CVs to clients without human approval (never fully autonomous).

---

## 3. Users & personas

| Persona | Context | Needs |
|---|---|---|
| **Recruiter** (primary, internal MVP user) | Formats 5–30 CVs/week per client req | Fast review, trust in accuracy, minimal clicks |
| **TA Team Lead / Admin** | Manages templates, customers, users | Template builder, usage analytics, quality monitoring |
| **Org Admin** (future, external SaaS) | Signs up their staffing agency to the platform | Billing, seat management, template/brand setup, org-level settings |
| **External end-user / recruiter** (future, public/paid) | Same as internal recruiter but at another company | Self-serve onboarding, usage-based or seat-based pricing, own branding |
| **Platform admin (us)** | Internal ops for the SaaS business | Tenant management, abuse/quota monitoring, billing oversight |

Designing for the external persona from day one (even if not built yet) is why **every core table is tenant-scoped** — see §7.

---

## 4. Core principles carried into architecture

1. **AI extracts, never invents.** Every fact in the output must be traceable to the source document. No hallucinated technologies, dates, or employers, ever — this is a hard system rule, enforced by prompt constraints *and* a post-extraction validation pass.
2. **Confidence + provenance on every field.** Each extracted field carries a confidence score and a pointer back to the exact source text it came from. This is the single highest-leverage trust feature and is in the MVP, not deferred.
3. **Human approval gate.** Nothing is generated for delivery without a recruiter reviewing at least the low-confidence fields.
4. **Deterministic templating.** Once data is verified, template rendering is 100% deterministic (Jinja-style engine) — no LLM involved in the final formatting step. This makes output reproducible and debuggable.
5. **Provider-agnostic AI layer.** The extraction call goes through an internal interface (`extractCandidateProfile(document)`), not a direct SDK call, so we can swap/mix models (Claude, GPT-4o, others) per tenant or per document type without touching business logic.
6. **Multi-tenant from day one.** Every table has an `org_id`. Our own TA team is simply "tenant #1" (`org_id = internal`). This is the single most important architectural decision in this doc — retrofitting multi-tenancy later is a rewrite; building it in now costs almost nothing.
7. **Config over code for templates.** Adding a new customer/template is a configuration action by an admin, not a deploy.

---

## 5. High-level architecture

```
                         ┌────────────────────┐
                         │      Frontend        │
                         │   Next.js (web app)  │
                         └──────────┬───────────┘
                                    │ REST/GraphQL (versioned API)
                                    ▼
                         ┌────────────────────┐
                         │   API Gateway /      │
                         │   FastAPI backend    │
                         └──────────┬───────────┘
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
           ┌────────────┐   ┌──────────────┐  ┌───────────────┐
           │ Document    │   │ AI Extraction │  │ Template       │
           │ Parsing     │   │ Service       │  │ Rendering      │
           │ Worker      │   │ (provider-    │  │ Engine         │
           │ (async job) │   │  agnostic)    │  │ (docxtpl)      │
           └──────┬──────┘   └──────┬───────┘  └───────┬────────┘
                  │                 │                   │
                  └─────────────────┼───────────────────┘
                                    ▼
                         ┌────────────────────┐
                         │   PostgreSQL         │
                         │ (multi-tenant, RLS)  │
                         └──────────┬───────────┘
                                    │
                         ┌──────────┴───────────┐
                         │  Object storage        │
                         │  (S3 / GCS) — raw &     │
                         │  generated documents    │
                         └────────────────────────┘

Async jobs run on a queue (Redis + Celery/RQ). API never blocks on
parsing/extraction/rendering — client polls or gets a webhook/websocket
update.
```

**Why FastAPI + Next.js, not a monolith:** the parsing/extraction/rendering pipeline is CPU/IO heavy and benefits from independent scaling and background workers; the frontend needs to be fast, SEO-capable (for the future public marketing site + self-serve signup), and easy to build an advanced UI in. Keeping them separate (API-first) also directly enables a future public API product — the same backend that powers our internal UI can be metered and sold as an API to other developers.

---

## 6. The core data model: Canonical Candidate Profile

This is the single most important schema in the product — keeping this document from GPT's draft was the right call. Every CV, regardless of source format or destination template, is normalized into this shape before anything else happens.

```json
{
  "candidate": {
    "name": "John Doe",
    "location": "Bangalore, India",
    "email": "john@example.com",
    "phone": "+91...",
    "headline": "Senior Java Developer"
  },
  "summary": {
    "value": "Senior Java Developer with 7+ years...",
    "confidence": 0.91,
    "source_type": "ai_generated",
    "evidence": null
  },
  "skills": [
    {
      "name": "Kafka",
      "normalized_name": "Apache Kafka",
      "confidence": 0.87,
      "source_type": "source",
      "evidence": "Worked on event-driven architecture using Kafka and Spring Boot..."
    }
  ],
  "experience": [
    {
      "company": "ABC Technologies",
      "role": "Senior Software Engineer",
      "start_date": "2021-03",
      "end_date": null,
      "is_current": true,
      "bullets": [
        {
          "text": "Built REST APIs using Java and Spring Boot",
          "confidence": 0.95,
          "source_type": "verified_transformation",
          "evidence": "Developed REST APIs using Java and Spring Boot"
        }
      ]
    }
  ],
  "education": [ { "institution": "XYZ University", "degree": "B.Tech", "field": "CS", "year": 2018, "confidence": 0.98 } ],
  "certifications": [],
  "projects": [],
  "languages": [],
  "meta": {
    "org_id": "uuid",
    "candidate_id": "uuid",
    "source_document_id": "uuid",
    "extraction_model": "claude-sonnet-5",
    "extraction_version": "v3",
    "overall_confidence": 0.93
  }
}
```

**Field provenance types** (this is the trust feature — keep from the earlier draft, it's genuinely the best idea in it):
- `source` — copied/lightly cleaned directly from the original CV
- `verified_transformation` — reworded by AI but every fact checked against source
- `ai_generated` — synthesized content (e.g. a written summary paragraph) with no 1:1 source sentence — always flagged distinctly in the UI

This profile is stored once per candidate and can be **re-rendered into any template** without re-parsing the original document — critical for the "same candidate, multiple client CVs" staffing use case.

> **The exact, finalized version of this schema** — reverse-engineered against our actual Copious CV template (cover page, running header, career summary, grouped technical skills table, education/certifications, employment & projects) and reconciled against the Affinda reference schema for field-naming sanity — lives in a dedicated document: **`cv-canonical-schema-and-template-mapping.md`**. That document is the source of truth for engineering; this PRD describes the product shape, that one describes the exact data contract.

---

## 7. Multi-tenancy & data model foundations

Even though only one org exists at MVP launch, build every table with this shape:

```
organizations (id, name, plan_tier, branding_config, created_at)
users (id, org_id, email, role, created_at)
candidates (id, org_id, name, master_profile_id, created_at)
documents (id, org_id, candidate_id, type[original|generated], storage_url, created_at)
candidate_profiles (id, org_id, candidate_id, document_id, profile_json, extraction_confidence, model_used, created_at)
templates (id, org_id, name, config_json, docx_storage_url, created_at)
generations (id, org_id, candidate_id, template_id, profile_id, status, output_document_id, reviewed_by, approved_at)
review_events (id, generation_id, field_path, action[confirm|edit|remove], old_value, new_value, user_id, created_at)
usage_events (id, org_id, event_type, quantity, created_at)   -- for future billing
api_keys (id, org_id, key_hash, scopes, created_at)            -- for future public API
```

- **Postgres Row-Level Security (RLS)** on `org_id` from day one — even for the single-tenant MVP. This means "add a second tenant" is a config change, not a security review.
- `usage_events` and `api_keys` tables exist from day one but are unused until the SaaS phase — costs nothing to add now, saves a migration later.

---

## 8. Feature list & prioritization

Legend: **P0 = MVP (build first)**, **P1 = fast-follow (weeks after MVP)**, **P2 = scale-up phase**, **P3 = public SaaS phase**

### P0 — MVP (internal, single-tenant usage, ships first)

| Feature | Notes |
|---|---|
| Upload CV (PDF, DOCX) | Single file, drag-and-drop |
| Document parsing pipeline | PyMuPDF (PDF), python-docx (DOCX); OCR deferred to P1 |
| AI extraction → Canonical Candidate Profile | Structured output via Claude, strict schema, "never invent" constraints baked into prompt |
| **Confidence score per field** | Kept from earlier draft — high/medium/low, drives what the recruiter actually needs to check |
| **Source evidence / provenance per field** | "Show source" — click any field, see the exact sentence it came from |
| Recruiter review UI | Editable fields, confirm/edit/remove per field, only low-confidence fields surfaced by default (with an "expand all" option) |
| One company template | Built with a JSON template config + `docxtpl` .docx template |
| Generate formatted CV | Deterministic render from verified profile → .docx |
| Download / basic export | .docx download; Google Docs export is P1 (see note below) |
| Single-org auth | Simple email/password or Google OAuth login — but built on a multi-tenant-ready schema (see §7 and §12) |
| Audit trail (basic) | Who generated what, when, from which source |
| **Custom instructions per upload/generation** | Free-text box the recruiter can fill in at upload time and/or generation time — e.g. "treat the most recent title as the role, ignore the objective section," "emphasize AWS and ignore the older mainframe experience for this client," "keep the summary to 3 bullets," "use UK spelling." Passed as additional, bounded context into the extraction and/or rendering prompt. See §9.6. |

**Note on Google Docs:** per your last message, Google Docs export is explicitly **deferred to P1**, not MVP. The MVP produces a downloadable, well-formatted `.docx` (openable and editable in Google Docs manually via upload anyway). This simplifies the MVP considerably — no OAuth scopes, no Docs API `batchUpdate` complexity — while `docxtpl` gives you the flexible looping needed for variable-length experience sections that the raw Docs API struggles with.

### P1 — Fast follow (make it good, not just working)

| Feature | Notes |
|---|---|
| Google Drive/Docs export | Upload rendered .docx via Drive API with `convert=true` → lands as native Google Doc in team's Drive |
| Multiple templates (per client) | Template selector at generation time |
| Template builder UI (no-code) | Admin defines `{{placeholders}}` visually, system maps to profile schema |
| Bulk upload / batch processing | Process a folder of CVs at once, per-candidate status list |
| Skill normalization | "JS" / "Javascript" / "ECMAScript" → "JavaScript" — canonical skills dictionary |
| OCR support | Scanned/image CVs via Document AI or Textract |
| Regeneration controls | "Make more concise", "more technical", "customer-focused" — operates only on verified data, never invents |
| Version history per candidate | Every generation + edit is versioned |
| Candidate master profile + diffing | New CV from same candidate → diff against master profile, recruiter accepts/rejects deltas |
| Analytics dashboard | CVs processed, avg. review time, fields corrected most often, estimated time saved |

### P2 — Scale-up (multi-tenant becomes real, not just schema-ready)

| Feature | Notes |
|---|---|
| True multi-org support turned on | Org signup flow, org-level branding, per-org template libraries |
| Role-based access control (RBAC) | Org admin / recruiter / read-only roles |
| Job requirement matching | Paste a JD, get a candidate-fit score against real (non-invented) experience |
| Customer-specific CV emphasis | Reorders/highlights existing, verified experience relevant to a JD — never adds unverified skills |
| Provider abstraction fully exercised | Ability to run different AI providers per org (cost/quality tradeoff), configurable per tenant |
| SOC2-track security hardening | Formal audit logging, retention policies, encryption key management |

### P3 — Public SaaS / monetization phase

| Feature | Notes |
|---|---|
| Self-serve signup + billing | Stripe integration, seat-based and/or usage-based pricing |
| Public API (metered) | Same extraction/template engine exposed as an API product, `api_keys` table already exists |
| White-label branding | Org uploads logo/colors, output templates reflect their brand, not ours |
| Usage quotas & plan tiers | Free tier (e.g. 5 CVs/month), Pro, Enterprise |
| Marketing site + docs | Next.js static/SSR pages, pulled from same monorepo |
| SSO / SAML for enterprise customers | For larger staffing agency customers |
| Public template marketplace (stretch) | Agencies share/sell CV template designs |

This ordering means: **nothing in P1–P3 requires reworking P0.** The schema, the AI-provider interface, and the API-first backend are the reason — they're designed once, correctly, up front.

---

## 9. Detailed MVP feature specs

### 9.1 Upload & parsing
- Accept PDF and DOCX (image-only/scanned handled gracefully with a clear "OCR not yet supported" message in MVP, not a silent failure).
- File size limit, virus/malware scan on upload (basic — e.g. ClamAV or a cloud scanning API) before processing.
- Parsing runs as an async job; UI shows live status (queued → parsing → extracting → ready for review).

### 9.2 AI extraction
- Prompt enforces the canonical schema via structured/tool-use output (JSON schema validated server-side with Pydantic — reject and retry once if invalid).
- Explicit "do not invent" instructions: null out anything not clearly supported by source text rather than guessing.
- Each field gets a confidence score computed from model-reported certainty + a secondary consistency check (e.g. does the date range parse validly, does the skill appear verbatim or near-verbatim in source text).
- Evidence extraction: model returns the literal source span alongside each fact so the "show source" feature works without a second pass.

### 9.3 Review UI
- Default view: only fields below a confidence threshold (e.g. <85%) are shown for review; everything else is collapsed under "Reviewed automatically — expand to check anyway."
- Each field: value, confidence badge, "show source" toggle, confirm / edit / remove actions.
- Global "Approve & Generate" button disabled until all flagged fields have been explicitly confirmed or edited (not just ignored).

### 9.4 Template engine
- Templates authored as `.docx` files using `docxtpl` (Jinja2 syntax: `{{ candidate.name }}`, `{% for job in experience %}` loops for variable-length sections).
- Template metadata stored as a JSON config: which sections are required, max bullet count, max summary word count, ordering — this config drives both the UI hints for the template builder (P1) and validation before render.
- Rendering is a pure function: `render(template, verified_profile) -> docx_bytes`. No AI involved at this step — fully deterministic and testable.

### 9.5 Output & delivery
- MVP: download `.docx` directly.
- Stored in object storage with a versioned filename and linked to the `generations` record for audit.

### 9.6 Custom instructions ("talk to the AI directly")
Two distinct injection points, both in MVP — they solve different problems and recruiters will want both:

1. **Extraction-time instructions** (attached to the upload): guidance about *reading* this specific source CV correctly. Examples: "the header title is outdated, use the most recent role instead," "ignore the personal projects section, client doesn't need it," "this candidate goes by a nickname on the CV, use their legal name from the email domain instead." Stored on the `documents` record, passed into the extraction prompt alongside the source text.
2. **Generation-time instructions** (attached to a specific template render): guidance about *emphasis and tone* for this specific submission. Examples: "emphasize cloud/AWS experience, this client is AWS-only," "shorten the career summary to 3 bullets," "use British English spelling," "de-emphasize the healthcare domain work." Stored on the `generations` record, passed into the rendering/rewrite step.

**Guardrails (important — do not let this reopen the "AI invents facts" problem):** custom instructions can change *emphasis, tone, length, and selection* of existing verified facts. They can never introduce a new fact not present in the canonical profile. This is enforced the same way as the base "never invent" rule: the instruction is appended to the prompt as a constraint layer, not a replacement for the extraction/rendering system prompt, and the output still goes through the same recruiter approval gate before generation. A malicious or careless instruction like "add AWS certification" should be rejected by the model per the system-level constraint, and any field it does touch is still shown with its normal confidence/source-evidence UI so the recruiter catches it if it doesn't.

---

## 10. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | SSR for a future public marketing/signup site, great DX, easy to build an advanced/polished UI, same framework scales from internal tool to public SaaS |
| UI components | Tailwind + a headless component library (Radix UI / shadcn-style) | Fully customizable design system — needed for both an advanced internal UI and future white-labeling |
| Backend API | **FastAPI (Python)** | Best ecosystem for document parsing + AI SDKs, async-friendly, easy to version (`/v1/...`) for a future public API product |
| AI extraction | Claude API (Sonnet), behind an internal `AIProvider` interface | Swappable provider; structured output support |
| Async jobs | Celery or RQ + Redis | Keeps API non-blocking on parsing/extraction/rendering |
| Database | PostgreSQL with Row-Level Security | Multi-tenant-ready from day one |
| Object storage | S3 or GCS | Original + generated documents |
| Document parsing | PyMuPDF (PDF), python-docx (DOCX), Document AI/Textract (OCR, P1) | Proven, well-maintained libraries |
| Template rendering | `docxtpl` | Jinja2-style loops/conditionals map perfectly to variable-length CV sections |
| Auth | NextAuth.js (or Clerk/Auth0) on frontend, JWT validated by FastAPI | Start simple (Google OAuth + email/password) but on a schema that already supports orgs/roles — see §12 |
| Billing (P3) | Stripe | Standard, well-documented, supports both seat- and usage-based |
| Deployment | Docker containers; Cloud Run / ECS Fargate for API+workers, Vercel for Next.js frontend | Scales independently, minimal ops overhead early on |
| Observability | OpenTelemetry + hosted logging (e.g. Grafana Cloud / Datadog) | Needed early for debugging extraction quality issues |
| CI/CD | GitHub Actions | Standard |

**A note on `python-docx`/`docxtpl` vs. Google Docs API as the source of truth:** rendering to `.docx` first (rather than driving the Google Docs API directly) is the right call for the reasons discussed earlier — Jinja-style loops handle "N jobs with M bullets each" far more cleanly than hand-rolled `batchUpdate` table-row insertion. Google Docs becomes an **export target** (P1), not the rendering engine.

---

## 11. API design (sketch)

Versioned and resource-oriented from the start, since this becomes a public product later:

```
POST   /v1/documents                 upload a CV, returns document_id + job_id
GET    /v1/jobs/{job_id}             poll parsing/extraction status
GET    /v1/candidates/{id}/profile   get canonical candidate profile
PATCH  /v1/candidates/{id}/profile   recruiter edits (field-level, logged to review_events)
POST   /v1/candidates/{id}/profile/approve
POST   /v1/generations               { candidate_id, template_id } → generate formatted CV
GET    /v1/generations/{id}          status + output document link
GET    /v1/templates                 list org's templates
POST   /v1/templates                 create/upload a template (P1: template builder)
GET    /v1/orgs/{id}/usage           usage metrics (P2/P3 billing input)
```

Every endpoint scoped by the authenticated org (`org_id` derived from the session/API key, never trusted from the request body).

---

## 12. Auth & permissions

**MVP decision: build real auth from day one, but keep it simple.**

You explicitly asked whether to add login now or leave it for later — recommendation: **add it now**, because:
- The multi-tenant schema (§7) already assumes `users.org_id` and roles; retrofitting auth onto data that was created without an owner is painful.
- Google OAuth (via NextAuth) is not meaningfully more work than a fake "no-login" MVP, and your users are already Google Workspace users.
- It future-proofs directly into the P3 self-serve signup flow with zero rework — the same login page just adds a "create your organization" step.

**MVP auth scope:**
- Google OAuth login (matches your team's existing Workspace usage).
- Two roles to start: `admin` (manages templates/users) and `recruiter` (uploads/reviews/generates). RBAC granularity expands in P2.
- Every API call authenticated via session → JWT → `org_id` + `role` claims, enforced by Postgres RLS as a second line of defense (defense in depth — the API layer and the DB layer both refuse cross-tenant access).

---

## 13. Security & compliance considerations

- Candidate CVs contain PII (name, contact info, employment history) — treat as sensitive data throughout: encryption at rest and in transit, least-privilege access, no candidate data in logs.
- Explicit, documented data-handling policy for what's sent to the AI provider (Claude API) — no training on customer data (verify current Anthropic API data-retention terms before finalizing customer-facing claims).
- Configurable document retention/deletion policy per org (important for future enterprise customers and eventual compliance needs like GDPR-style "right to deletion").
- Audit log (`review_events`, `generations`) gives full traceability: "why did the output say X" is always answerable.
- Rate limiting and abuse detection on uploads/API from day one of the public API (P3), designed into the gateway layer early even if unused until then.

---

## 14. Non-functional requirements

| Requirement | Target |
|---|---|
| Single CV: upload → ready for review | < 20s p95 |
| Bulk batch (50 CVs) | Processes in parallel via worker pool, progress visible per-item |
| Availability | 99.5% target post-MVP (internal tool tolerance is looser at first) |
| Horizontal scalability | API and workers scale independently behind a load balancer; stateless API pods |
| Data isolation | Verified via RLS + automated tenant-isolation tests in CI |

---

## 15. Analytics & success metrics

Track from day one (cheap to add now, valuable later for both internal ROI reporting and, eventually, customer-facing dashboards in the SaaS product):

- CVs processed / generated per week
- Average recruiter review time per CV
- % of fields requiring manual correction (proxy for extraction quality — track over time to know if prompt/model changes help)
- Overall extraction confidence trend
- Time saved estimate (baseline manual time vs. assisted time — measure the baseline honestly during pilot rather than assuming a number)

---

## 16. UI/UX direction

- Advanced, modern SaaS-grade UI (not an internal-tool-looking CRUD app) — this matters both for daily recruiter usability and because it's the shop window for the future paid product.
- Design system: Tailwind + a headless component primitive library, fully theme-able (colors/typography driven by `branding_config` per org — needed for white-labeling in P3, cheap to build correctly now).
- Key screens for MVP:
  1. **Upload/dashboard** — recent candidates, quick upload
  2. **Review screen** — the core screen; confidence-first design, source evidence one click away, minimal cognitive load
  3. **Template picker** — even with one template in MVP, build the picker UI so adding template #2 (P1) is a config change, not a UI change
  4. **Generation result** — preview + download, link back to source profile

---

## 17. Monetization plan (P3, for context now so nothing blocks it later)

| Tier | Target user | Pricing shape |
|---|---|---|
| Free | Solo recruiter / trial | Limited CVs/month, 1 template, watermarked or basic export only |
| Pro | Small staffing agency | Seat-based or per-CV usage, multiple templates, Google Docs export, priority processing |
| Enterprise | Larger agency | SSO, custom templates at scale, API access, dedicated support, custom data retention terms |
| API (developer) | Other platforms/ATS vendors wanting to embed this | Usage-metered, `api_keys` table already exists from day one |

None of this needs building at MVP — it needs the **data model and API shape to already support it**, which §7 and §11 ensure.

---

## 18. Open questions / decisions needed before build starts

1. Confirm which AI provider(s) to standardize on for extraction at launch (Claude recommended given quality on structured extraction; keep the provider interface abstract regardless).
2. Confirm initial company template(s) and their exact required sections/formatting rules to encode as the first `docx` template + config.
3. Decide OCR provider for P1 (Document AI vs. Textract) based on existing cloud vendor relationship, if any.
4. Confirm retention policy for original candidate CVs (how long to keep raw uploads vs. only the canonical profile).
5. Decide MVP hosting target (GCP vs. AWS) — mostly a preference call given both stacks proposed are portable.

---

## 19. Summary: what ships when

- **MVP (P0):** Upload → AI extraction with confidence & source evidence → recruiter review/edit → one configurable template → deterministic `.docx` generation → download. Real (simple) auth, multi-tenant-ready schema, provider-agnostic AI layer, API-first backend. This alone should deliver the bulk of the time savings.
- **P1:** Google Docs export, multiple templates + no-code template builder, bulk processing, skill normalization, OCR, regeneration controls, version history, analytics.
- **P2:** Multi-org support actually turned on, RBAC, job-matching, security hardening for enterprise readiness.
- **P3:** Self-serve public SaaS — billing, public API, white-labeling, usage tiers, marketing site.

Because the schema, auth, and API are built correctly at P0, every later phase is additive — no user is ever blocked waiting for a rearchitecture.