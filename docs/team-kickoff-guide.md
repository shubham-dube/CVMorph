# CV Platform – Team Kickoff & Collaboration Guide

Hey team! Welcome to the CV Transformation Platform. 

We've just finished laying down the foundation. The monorepo infrastructure (FastAPI, Next.js, Postgres, Redis, Celery, Docker) is wired up, the core database models are scaffolded, and most importantly, the canonical JSON schema for the Candidate Profile is locked in.

Because our data contract is finalized, we are in a great position to divide and conquer. We can work entirely in parallel without blocking each other.

---

## 🚀 Our Parallel Tracks

We can split our immediate focus into two independent tracks. 

### Track A: Document Parsing & AI Extraction (Epics 2 & 3)
*Focus: Backend, Python, Celery, Claude API.*

If you'd like to jump into the backend pipelines, this track is all yours. The goal here is to take a raw uploaded CV (PDF/DOCX) and transform it into our structured `CandidateProfile` JSON using Claude.

**What's already set up:**
- The Celery workers and queues are configured.
- The `CandidateProfile` Pydantic schema is locked.
- Stubs are ready for `parse_task.py` and `extract_task.py`.
- The AI system prompt is drafted at `apps/api/app/services/extraction/prompts/extraction_system_prompt.md`.

**Where you can dive in:**
1. **Parsing Pipeline (Epic 2):** Check out `apps/api/app/services/parsing/pdf_parser.py` and `docx_parser.py`. We need to flesh these out and connect them inside `apps/api/app/workers/tasks/parse_task.py`.
2. **Extraction Engine (Epic 3):** Head to `apps/api/app/services/extraction/claude_provider.py`. This is where we'll implement the Claude API call using Structured Outputs. Once that's returning data, it needs to be wired into `extract_task.py` and validated using `validator.py`.

*Pro-tip: Use the golden-path fixture at `apps/api/tests/fixtures/profiles/rupesh_g.json` as the target for what the AI extraction should perfectly return.*

### Track B: The Review UI (Epic 4)
*Focus: Frontend, Next.js, React, Tailwind.*

*(I will be taking the lead on this track so we can move fast on the user experience!)*

While the extraction pipeline is being built, I will be working in `apps/web` to build out the core Candidate Review screen. 
- I'll be building the confidence badges, the "Show Source" evidence popovers, and the field-level editing experience.
- Because our TypeScript types (`@cv-platform/shared-types`) are synced with the backend schema, I can mock the API responses and build the entire UI independently.
- You'll see my commits landing mostly in `apps/web/app/(dashboard)/candidates/[id]/review/page.tsx` and `apps/web/components/review/`.

---

## 🛠️ Getting Started Locally

Getting the stack running is straightforward:

1. **Start the backend services:**
   From the repository root, run:
   ```bash
   docker-compose up -d
   ```
   *This spins up Postgres, Redis, the FastAPI backend (port 8000), and the Celery workers.*

2. **Seed the database (Optional but helpful):**
   ```bash
   cd apps/api
   uv run python -m app.db.seed
   ```
   *This creates the default internal organization and admin user.*

3. **Start the frontend UI:**
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
   *The Next.js app will be available at http://localhost:3000.*

---

## 🤝 Coordination

The main touchpoint between our tracks is the **Canonical Schema**. 
The absolute source of truth is `apps/api/app/schemas/candidate_profile.py`. If we discover during extraction or UI building that we need to alter the schema (add a field, change a type), let's sync up quickly before changing it, as it requires updating the shared TypeScript package as well.

For a deeper dive into the technical details and acceptance criteria of any specific feature, refer to the `docs/implementation_plan.md` and `docs/PRD.md`.

Let's build something awesome!
