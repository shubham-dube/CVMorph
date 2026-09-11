# CVMorph

> **Enterprise AI-Powered CV Transformation & Branded Resume Formatting Platform.**
>
> Ingest candidate resumes in any format (PDF, Word, or raw text) → Extract into a canonical, confidence-scored profile using AI → Polish in Review Studio with conversational AI Copilot & job tailoring → Render into branded, pixel-perfect `.docx` and `.pdf` resumes.

---

## Key Features

- **Multi-Source Intake**: Upload raw PDFs and DOCX files or paste unstructured text backgrounds with target role positioning.
- **AI Extraction & Provenance Tracking**: Extracts structured career summaries, grouped technical competencies, chronologically formatted employment, and education using Google Gemini 3.5 Flash. Every field carries confidence scores and traceable evidence spans.
- **Strategic Role Alignment & Bluffing Engine**: 4-tier granular alignment slider (`Strict Facts`, `Role Focus`, `Role Alignment`, `Scope Expansion`) to adapt candidate experience directly against a target Job Description with audit trails for extrapolated claims.
- **Interactive Review Studio**: In-browser side-by-side editing, low-confidence flag verification, and instant inline candidate updates.
- **AI Profile Copilot**: Built-in conversational sidecar enabling recruiters to command complex transformations (e.g. "Condense summary to 3 high-impact bullets", "Quantify bullet points with latency and throughput metrics", "Add Docker and Kubernetes to DevOps").
- **Multi-Profile Branching & Master Profiles**: Generate multiple tailored variations of a candidate's CV for different roles, elect a master default profile, and approve versions independently.
- **Deterministic Word & PDF Generation**: Generates clean `.docx` files using Jinja-templated XML document manipulation, and converts to `.pdf` via headless LibreOffice.
- **Zero-Egress Object Storage**: Cloudflare R2 integration for ultra-fast, cost-effective document storage and presigned download URLs.

---

## System Architecture & Tech Stack

```
cvmorph/
├── apps/
│   ├── api/          # FastAPI Backend (Python 3.12, SQLAlchemy, Alembic, LibreOffice)
│   └── web/          # Next.js 16 Web Application (React 19, TypeScript, Tailwind CSS)
├── packages/
│   └── shared-types/ # Shared TypeScript types derived from canonical JSON schema
├── docs/             # Product specifications, API reference, schema mapping contracts
├── infra/            # PostgreSQL initialization scripts
├── Dockerfile        # Authoritative API container Dockerfile
├── vercel.json       # Monorepo deployment and routing configuration
└── DEPLOYMENT.md     # Production deployment and infrastructure guide
```

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query, Lucide Icons, Sonner |
| **Backend** | FastAPI, Python 3.12, Pydantic v2, SQLAlchemy (asyncpg), Alembic, docxtpl |
| **Document Processing** | PyMuPDF, headless LibreOffice, python-docx, poppler-utils |
| **AI / LLM** | Google Gemini 3.5 Flash (`google-genai`), Claude Structured Outputs compatible |
| **Database** | PostgreSQL 16+ (Supabase / local Docker) with multi-tenant row-level security |
| **Storage** | Cloudflare R2 (S3-compatible) with zero egress bandwidth fees |
| **Package Management** | Python: `uv` · Node.js: `npm` |

---

## Local Development Quickstart

### Prerequisites
- [Docker & Docker Compose](https://www.docker.com/)
- [Node.js 20+](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/) and [`uv`](https://docs.astral.sh/uv/)

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/cvmorph.git
cd cvmorph
```

### 2. Environment Configuration
Copy sample environment files:
```bash
# Backend environment
cp apps/api/.env.example apps/api/.env

# Frontend environment
cp apps/web/.env.local.example apps/web/.env.local
```
Fill in your `GEMINI_API_KEY`, database credentials, and Cloudflare R2 credentials in `apps/api/.env`.

### 3. Run with Docker Compose (Recommended)
Launch the entire backend stack with PostgreSQL, automated migrations, system template seeding, and LibreOffice conversion:
```bash
docker compose up --build
```
The API will be accessible at `http://localhost:8000`. Auto-generated OpenAPI documentation is available at `http://localhost:8000/docs`.

### 4. Run the Frontend
In a separate terminal:
```bash
cd apps/web
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Production Deployment

Both the Next.js frontend and containerized FastAPI backend deploy together onto **Vercel** with a single command:
```bash
vercel --prod
```
The monorepo uses [`vercel.json`](vercel.json) to route both services under the exact same domain, eliminating CORS preflights and cookie restrictions.

Refer to [**`DEPLOYMENT.md`**](DEPLOYMENT.md) for the complete cloud setup guide (Supabase PostgreSQL, Cloudflare R2, Google Gemini 3.5 Flash, and Vercel).

---

## Documentation Index

- [**DEPLOYMENT.md**](DEPLOYMENT.md) — Comprehensive production deployment walkthrough.
- [**docs/PRD.md**](docs/PRD.md) — Complete Product Requirements Document & functional specs.
- [**docs/api-reference.md**](docs/api-reference.md) — Full REST API endpoint specification.
- [**docs/cv_schema_template_mapping.md**](docs/cv_schema_template_mapping.md) — Canonical Candidate Profile JSON Schema & Word `.docx` template mapping contract.
- [**docs/skills-taxonomy-starter.xlsx**](docs/skills-taxonomy-starter.xlsx) — Starter taxonomy for skill category classification.

---

## License

Internal proprietary software. All rights reserved.
