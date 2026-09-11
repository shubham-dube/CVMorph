# CVMorph Production Deployment Guide

This document provides complete, production-ready instructions for deploying the **CVMorph** platform. It details the system architecture, Docker container topology, same-domain routing configurations, cloud services, and step-by-step guides for custom infrastructure.

---

## 1. System Architecture & Topology

CVMorph is built as a modular monorepo consisting of:
- **Web Frontend**: Next.js 16 (React 19, TypeScript, Tailwind CSS) deployed on **Vercel** (or any Node.js host).
- **API Backend**: FastAPI (Python 3.12, SQLAlchemy, Alembic, LibreOffice, PyMuPDF) packaged as a **Docker Container** on any container host (**Railway**, **Render**, **Fly.io**, **AWS ECS**, **GCP Cloud Run**, or a **VPS**).
- **Database**: Managed PostgreSQL with row-level security (e.g., **Supabase**, **Neon**, **AWS RDS**).
- **Object Storage**: **Cloudflare R2** (S3-compatible, zero egress fees) for raw CV files, generated Word documents, PDFs, and template assets.
- **AI Engine**: **Google Gemini 2.5 Flash** (via `google-genai`) for document extraction, JD tailoring, and real-time Review Studio co-pilot editing.

```
                  ┌──────────────────────────────────────────────┐
                  │                 Users / Web                  │
                  └──────────────────────┬───────────────────────┘
                                         │
                         HTTPS (your-domain.com)
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │          Vercel Edge / Reverse Proxy         │
                  ├──────────────────────────────┬───────────────┤
                  │  Pages: /candidates, /review │  API: /v1/*   │
                  │  Static Assets, SSR, Hydr.   │  OpenAPI Docs │
                  └──────────────┬───────────────┴───────┬───────┘
                                 │                       │
                                 │                       │ Proxy Rewrites
                                 ▼                       ▼
                    ┌────────────────────────┐  ┌─────────────────────────────────┐
                    │  Next.js Frontend App  │  │   FastAPI Backend Container     │
                    │  (Vercel Serverless)   │  │   (Railway / Render / Fly / VPS)│
                    └────────────────────────┘  └──┬──────────────┬───────────────┘
                                                   │              │
                       ┌───────────────────────────┴───┐          │
                       ▼                               ▼          ▼
            ┌──────────────────────┐        ┌────────────────────────┐  ┌──────────────────────┐
            │ Supabase PostgreSQL  │        │   Cloudflare R2 Bucket │  │ Google Gemini 2.5    │
            │ (Multi-tenant RLS)   │        │ (Zero Egress S3 Store) │  │ (Extraction/Edit)    │
            └──────────────────────┘        └────────────────────────┘  └──────────────────────┘
```

---

## 2. Same-Domain Routing & Cookie Strategy

### Why Same-Domain Routing?
Modern browsers (Safari ITP, Chrome Privacy Sandbox, Firefox ETP) restrict third-party cookies and cross-site context. When the frontend (`app.domain.com`) and backend (`api-container.up.railway.app`) reside on different domains:
1. Every client fetch requires an `OPTIONS` CORS preflight network round-trip.
2. Cross-domain cookies require complex `SameSite=None; Secure` handling.

By routing all requests through the same domain (e.g. `https://cvmorph.com`), the browser treats the frontend and backend as a single unified origin:
- Frontend routes: `https://cvmorph.com/*`
- Backend API endpoints: `https://cvmorph.com/v1/*`
- Interactive API documentation: `https://cvmorph.com/docs` and `https://cvmorph.com/openapi.json`

### Option A: Vercel Proxy Rewrites (Recommended)
If Next.js is deployed on Vercel and the container is deployed on Railway / Render / Fly.io:
Configure `apps/web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "https://your-api-container.railway.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${BACKEND_URL}/v1/:path*`,
      },
      {
        source: "/docs",
        destination: `${BACKEND_URL}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${BACKEND_URL}/openapi.json`,
      },
    ];
  },
};

export default nextConfig;
```

When deployed with this configuration, set `NEXT_PUBLIC_API_URL=""` (empty) in Vercel environment variables. The API client in `apps/web/lib/api-client.ts` will automatically use `/v1` relative to the current domain.

### Option B: Cloudflare Reverse Proxy / Nginx
If using a custom reverse proxy or Cloudflare in front of both services:
- Route `/v1/*`, `/docs`, `/openapi.json` to the backend container IP / upstream.
- Route all remaining paths `/*` to the Vercel deployment.

---

## 3. Dockerfiles Explained

The repository contains two production Dockerfiles tailored to specific deployment contexts:

| Dockerfile | Build Context | Primary Use Case |
|---|---|---|
| **`Dockerfile`** (Repository Root) | Root (`.`) | **Recommended**: Local Docker Compose, Railway, Render, Fly.io, AWS ECS, GCP Cloud Run, DigitalOcean, self-hosted VPS. |
| **`apps/api/Dockerfile.vercel`** | `apps/api` | Vercel Multi-Service Docker deployment (configured in `vercel.json`). |

### Key Container Features in Both Dockerfiles
1. **Headless LibreOffice**: Installed along with `fonts-liberation` and `fonts-dejavu-core` for server-side DOCX → PDF conversion.
2. **Profile Isolation**: `SOFFICE_OPTS="--user-installation=/tmp/libreoffice-profile"` isolates LibreOffice temporary locks to prevent concurrency errors during PDF rendering.
3. **Automated Boot Sequence**:
   ```bash
   uv run alembic upgrade head && uv run python -m app.db.seed && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
   ```
   - Runs database migrations automatically.
   - Idempotently verifies and uploads official Word templates (`Classic Professional`, `Contemporary Header`, `Modern Sidebar`) directly to Cloudflare R2 on startup.
   - Launches high-performance asynchronous Uvicorn server.

---

## 4. Step-by-Step Deployment Guide

### Step 1: Set Up Managed PostgreSQL (Supabase)
1. Create a project at [supabase.com](https://supabase.com).
2. Navigate to **Project Settings** → **Database**.
3. Copy the **URI connection string**.
   - For containerized backends, use the direct connection (port `5432`):
     ```
     postgresql+asyncpg://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
     ```
   - Ensure the driver prefix is `postgresql+asyncpg://`.
4. Note your project URL and service role key if utilizing Supabase Auth / Storage integrations.

---

### Step 2: Set Up Cloudflare R2 Object Storage
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and navigate to **R2**.
2. Click **Create bucket** and name it (e.g. `cvmorph-production`).
3. Under **Account Details**, copy your **Account ID**.
4. In the R2 Overview, click **Manage R2 API Tokens** → **Create API Token**:
   - Permissions: **Object Read & Write**.
   - TTL: Permanent (or according to your security policy).
5. Note the **Access Key ID** and **Secret Access Key**.
6. (Optional) Under **Bucket Settings**, connect a Custom Domain if you wish to serve public preview URLs, or leave private (CVMorph generates time-limited presigned S3 URLs automatically).
7. Configure Bucket CORS under **Bucket Settings** → **CORS Policy**:
   ```json
   [
     {
       "AllowedOrigins": ["https://your-domain.com", "http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

---

### Step 3: Deploy the Backend Container

#### Deploying on Railway (Recommended)
1. Create a new project at [railway.app](https://railway.app).
2. Connect your GitHub repository.
3. In the service settings:
   - **Dockerfile Path**: `Dockerfile` (root).
   - **Context**: Root directory (`/`).
4. Set Environment Variables:
   ```env
   ENVIRONMENT=production
   DATABASE_URL=postgresql+asyncpg://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
   DB_POOL_SIZE=10
   DB_MAX_OVERFLOW=20
   DB_ECHO=false

   SECRET_KEY=generate-a-secure-random-64-char-string
   JWT_ALGORITHM=HS256
   JWT_EXPIRY_DAYS=7

   STORAGE_BACKEND=r2
   R2_ACCOUNT_ID=your_cloudflare_account_id
   R2_ACCESS_KEY_ID=your_cloudflare_r2_access_key
   R2_SECRET_ACCESS_KEY=your_cloudflare_r2_secret_key
   R2_BUCKET=cvmorph-production
   R2_PUBLIC_URL=

   GEMINI_API_KEY=your_google_gemini_api_key
   GEMINI_MODEL=gemini-2.5-flash

   CORS_ORIGINS=["https://your-domain.com", "https://*.vercel.app"]
   SEED_ADMIN_EMAIL=admin@your-company.com
   SEED_ADMIN_PASSWORD=strong-initial-password
   ```
5. Click **Deploy**. Railway will build the container, execute migrations, upload the official system templates to R2, and bind to `${PORT}`.
6. Copy the assigned public domain (e.g., `https://cvmorph-api-production.up.railway.app`).
7. Verify health by visiting `https://[your-railway-url]/health`.

---

### Step 4: Deploy the Frontend on Vercel

1. Log in to [vercel.com](https://vercel.com) and click **Add New** → **Project**.
2. Select your repository.
3. In **Project Configuration**:
   - **Root Directory**: Select `apps/web`.
   - **Framework Preset**: Next.js.
4. In **Environment Variables**, add:
   ```env
   # Leave empty if using same-domain rewrites in next.config.ts
   NEXT_PUBLIC_API_URL=

   # Backend URL used by Next.js server-side rewrites
   BACKEND_INTERNAL_URL=https://your-api-container.railway.app

   # Firebase Auth credentials (if using Google OAuth)
   NEXT_PUBLIC_FIREBASE_API_KEY=your_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```
5. Click **Deploy**.

---

### Step 5: Configure Custom Domain in Vercel
1. In Vercel Project Settings, navigate to **Domains**.
2. Add your custom domain (e.g. `cvmorph.com` and `www.cvmorph.com`).
3. Point your DNS records (A / CNAME) as instructed by Vercel.
4. Update the backend `CORS_ORIGINS` variable in your container host:
   ```json
   CORS_ORIGINS=["https://cvmorph.com", "https://www.cvmorph.com"]
   ```

---

## 5. Environment Variables Reference

### Backend (`apps/api`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | Async PostgreSQL connection URI (`postgresql+asyncpg://...`). |
| `SECRET_KEY` | Yes | - | Secret key used for signing session JWTs. |
| `STORAGE_BACKEND` | Yes | `r2` | `r2` (Cloudflare R2), `s3` (AWS S3), or `local` (filesystem). |
| `R2_ACCOUNT_ID` | If R2 | - | Cloudflare account ID. |
| `R2_ACCESS_KEY_ID` | If R2 | - | R2 S3 API access key. |
| `R2_SECRET_ACCESS_KEY` | If R2 | - | R2 S3 API secret key. |
| `R2_BUCKET` | If R2 | - | R2 bucket name. |
| `GEMINI_API_KEY` | Yes | - | Google Gemini AI API key for CV parsing and editing. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model name. |
| `CORS_ORIGINS` | Yes | `["*"]` | Allowed CORS origins as a JSON array. |
| `SEED_ADMIN_EMAIL` | No | `admin@cvmorph.local` | Default admin email initialized on startup. |

### Frontend (`apps/web`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `""` | Base API path. Leave empty for relative `/v1` proxying. |
| `BACKEND_INTERNAL_URL` | Yes (if proxy) | - | Target container URL for Next.js rewrites. |
| `NEXT_PUBLIC_FIREBASE_*` | Optional | - | Firebase configuration for Google OAuth login. |

---

## 6. Operational Runbook & Maintenance

### Adding New Templates
1. Place the Microsoft Word `.docx` file in `apps/api/seed/templates/`.
2. Register the template details (name, description, UUID) in `SYSTEM_TEMPLATES_CONFIG` within `apps/api/app/db/seed.py`.
3. Deploy or run `uv run python -m app.db.seed`. The template will be uploaded to Cloudflare R2 and registered in PostgreSQL.

### Database Migrations
Database schema updates are managed with Alembic:
```bash
# Create a new migration revision
uv run alembic revision --autogenerate -m "add_column_name"

# Apply migrations
uv run alembic upgrade head
```

### Health Check Endpoint
Containers expose `GET /health` which returns `{"status": "ok", "version": "1.0.0"}`. Configure this endpoint as the liveness/readiness probe in your orchestration platform.
