# CVMorph Deployment Guide

CVMorph is architected for unified deployment: both the **Next.js frontend** and the **containerized FastAPI backend** deploy together onto **Vercel** with a single command:

```bash
vercel --prod
```

Both services run on the **same domain**, eliminating CORS preflights, cross-site cookie restrictions, and multi-domain configuration overhead.

---

## 1. Deployment Architecture

```
                               HTTPS (your-domain.vercel.app)
                                              │
                                              ▼
                             ┌───────────────────────────────────┐
                             │       Vercel Gateway Router       │
                             │          (vercel.json)            │
                             ├─────────────────┬─────────────────┤
                             │   Rewrite: /*   │ Rewrite: /v1/*  │
                             │                 │ Rewrite: /docs  │
                             └────────┬────────┴────────┬────────┘
                                      │                 │
                                      ▼                 ▼
                        ┌──────────────────┐  ┌───────────────────────┐
                        │   Web Service    │  │      API Service      │
                        │    (Next.js)     │  │  (FastAPI Container) │
                        │    apps/web      │  │  Dockerfile.vercel   │
                        └──────────────────┘  └───┬───────────────┬───┘
                                                  │               │
                                                  ▼               ▼
                                     ┌──────────────────┐  ┌──────────────┐
                                     │  Supabase (PG)   │  │Cloudflare R2 │
                                     │  Multi-tenant RLS│  │ (Zero-Egress)│
                                     └──────────────────┘  └──────────────┘
                                                  │
                                                  ▼
                                     ┌──────────────────┐
                                     │Google Gemini 3.5 │
                                     │   (AI Engine)    │
                                     └──────────────────┘
```

### Same-Domain Routing via `vercel.json`
The root [`vercel.json`](vercel.json) declares both services and proxies traffic seamlessly under a single origin:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "web": {
      "root": "apps/web",
      "framework": "nextjs"
    },
    "api": {
      "root": "apps/api",
      "entrypoint": "Dockerfile.vercel"
    }
  },
  "rewrites": [
    {
      "source": "/v1/(.*)",
      "destination": { "service": "api" }
    },
    {
      "source": "/docs",
      "destination": { "service": "api" }
    },
    {
      "source": "/openapi.json",
      "destination": { "service": "api" }
    },
    {
      "source": "/(.*)",
      "destination": { "service": "web" }
    }
  ]
}
```

- **Frontend Pages**: `https://your-domain.vercel.app/*`
- **Backend API Endpoints**: `https://your-domain.vercel.app/v1/*`
- **Interactive Documentation**: `https://your-domain.vercel.app/docs`

Because both live on the same domain:
1. `NEXT_PUBLIC_API_URL` is left empty (`""`) in production — all API calls use relative `/v1` paths.
2. No CORS preflight round-trips (`OPTIONS`).
3. Session tokens and cookies are strictly first-party.

---

## 2. Dockerfiles Explained

The project maintains two Dockerfiles:

| Dockerfile | Build Context | Primary Purpose |
|---|---|---|
| **`apps/api/Dockerfile.vercel`** | `apps/api` | **Production Vercel Deployment**: The entrypoint declared in `vercel.json` for Vercel's multi-service container builds. |
| **`Dockerfile`** (Root) | Repository Root (`.`) | **Local Development & Standard Docker**: Used by `docker compose up --build` and standalone container hosts. |

### Container Runtime Details
Both Dockerfiles provide:
- **Python 3.12** base image with `uv` for fast dependency management.
- **Headless LibreOffice** (`libreoffice-writer`, `libreoffice-calc`) with `fonts-liberation` and `fonts-dejavu-core` for server-side DOCX ↔ PDF conversion.
- **LibreOffice Profile Isolation**: `SOFFICE_OPTS="--user-installation=/tmp/libreoffice-profile"` isolates temporary lockfiles to prevent concurrency collisions during document conversions.
- **Automated Startup Sequence**:
  ```bash
  uv run alembic upgrade head && uv run python -m app.db.seed && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
  ```
  1. Runs database schema migrations automatically.
  2. Idempotently uploads and registers the official system templates (`Classic Professional`, `Contemporary Header`, `Modern Sidebar`) directly into Cloudflare R2 and PostgreSQL.
  3. Launches the Uvicorn ASGI server binding to Vercel's assigned `${PORT}`.

---

## 3. External Cloud Services Setup

Before deploying to Vercel, ensure these 3 external services are ready:

### 1. Managed PostgreSQL (Supabase)
- Create a project at [supabase.com](https://supabase.com).
- Under **Project Settings** → **Database**, obtain your connection string:
  ```env
  DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
  DATABASE_URL_SYNC="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
  ```
- Migrations (`alembic upgrade head`) will run automatically on container boot.

### 2. Cloudflare R2 Object Storage
- In [Cloudflare Dashboard](https://dash.cloudflare.com), go to **R2** → **Create bucket** (e.g. `my-copious`).
- Obtain your **Account ID** from the R2 overview.
- Click **Manage R2 API Tokens** → **Create API Token** with **Object Read & Write** permissions to get:
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
- In **Bucket Settings** → **CORS Policy**, add:
  ```json
  [
    {
      "AllowedOrigins": ["https://*.vercel.app", "http://localhost:3000"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

### 3. Google Gemini 3.5 Flash AI
- Generate an API Key at [Google AI Studio](https://aistudio.google.com).
- Model configured: `gemini-3.5-flash`.

---

## 4. Step-by-Step Deployment to Vercel

### Step 1: Link the Project (First Time Only)
If deploying from a new machine or terminal:
```bash
npx vercel link
```
Select the project (e.g. `cvmorph`).

### Step 2: Configure Environment Variables in Vercel
Set the following environment variables in the [Vercel Dashboard](https://vercel.com) under **Project Settings** → **Environment Variables** (or via `vercel env add`):

#### API Environment Variables (Backend Service)
```env
APP_NAME=CVMorph API
APP_ENV=production
DEBUG=false
SECRET_KEY=your-secure-random-64-character-jwt-key
CORS_ORIGINS=http://localhost:3000,https://*.vercel.app

DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
DATABASE_URL_SYNC=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres

STORAGE_BACKEND=r2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=my-copious
R2_PUBLIC_URL=

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
```

#### Web Environment Variables (Frontend Service)
```env
# Leave empty so the browser uses relative /v1 same-domain proxying
NEXT_PUBLIC_API_URL=

# Firebase Auth Configuration (for Google OAuth)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Step 3: Deploy to Production
Run from the repository root:
```bash
vercel --prod
```

Vercel will:
1. Detect `vercel.json` multi-service configuration.
2. Build the Next.js frontend (`apps/web`).
3. Build the FastAPI container (`apps/api/Dockerfile.vercel`).
4. Execute database migrations and seed R2 system templates on boot.
5. Deploy both services onto your production URL (e.g. `https://cvmorph-nu.vercel.app`).

---

## 5. Verification & Health Checks

Once deployment completes, verify:
- **API Health Check**: `https://your-domain.vercel.app/v1/health` → returns `{"status":"ok","version":"1.0.0"}`
- **Interactive OpenAPI Documentation**: `https://your-domain.vercel.app/docs`
- **Web App**: `https://your-domain.vercel.app` → opens the login / dashboard interface.

---

## 6. How to Customize This Setup

- **Custom Domain**: In Vercel Project Settings → **Domains**, add your custom domain (e.g. `cvmorph.com`). Both frontend and backend immediately inherit the domain with SSL auto-provisioned. Update `CORS_ORIGINS` to include your new domain.
- **Change AI Model**: Update `GEMINI_MODEL` in Vercel environment variables (e.g. to a future model release).
- **Change Storage Bucket**: Update `R2_BUCKET` in Vercel environment variables. On next container start, `seed.py` will automatically upload the official templates to the new bucket.
- **Switching Vercel Accounts or Re-linking**: If you ever switch Vercel accounts or transfer the project to a different team, clear any local cached project links to prevent `Error: Not authorized`:
  ```bash
  vercel logout
  # Clear local cached link (PowerShell: Remove-Item -Recurse -Force .vercel, .env.local)
  rm -rf .vercel .env.local
  vercel login
  vercel --prod
  ```
  Vercel will prompt you to select your new account/team and link the project cleanly.
- **Run Locally Without Vercel**: Run `docker compose up --build` to run the complete stack locally on `http://localhost:8000` and `http://localhost:3000`.

---

## 7. Multi-Environment & Multi-Domain Architecture

When you need two separate deployments with **different environments** (e.g., Staging vs Production, or two distinct clients) and **separate domains**, here is the industry-standard architecture and configuration.

### Architecture Overview

```
 ┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
 │         ENVIRONMENT A: STAGING               │   │        ENVIRONMENT B: PRODUCTION             │
 │     Domain: staging.cvmorph.com             │   │        Domain: app.cvmorph.com               │
 │     (or cvmorph-staging.vercel.app)          │   │        (or cvmorph-prod.vercel.app)          │
 └──────────────────────┬───────────────────────┘   └──────────────────────┬───────────────────────┘
                        │                                                  │
                        ▼                                                  ▼
 ┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
 │          Vercel Project: cvmorph-staging     │   │         Vercel Project: cvmorph-prod         │
 │  ┌────────────────────┐ ┌──────────────────┐ │   │  ┌────────────────────┐ ┌──────────────────┐ │
 │  │  Web (Next.js)     │ │  API Container   │ │   │  │  Web (Next.js)     │ │  API Container   │ │
 │  │  apps/web          │ │  apps/api        │ │   │  │  apps/web          │ │  apps/api        │ │
 │  └────────────────────┘ └────────┬─────────┘ │   │  └────────────────────┘ └────────┬─────────┘ │
 └──────────────────────────────────┼───────────┘   └──────────────────────────────────┼───────────┘
                                    │                                                  │
                    ┌───────────────┴───────────────┐                  ┌───────────────┴───────────────┐
                    ▼                               ▼                  ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐ ┌────────────────────────┐      ┌────────────────────────┐
       │ Supabase (Staging DB)  │      │ Cloudflare R2 (Staging)│ │ Supabase (Prod DB)     │      │ Cloudflare R2 (Prod)   │
       │ Multi-tenant isolation │      │ Bucket: cvmorph-staging│ │ Multi-tenant isolation │      │ Bucket: cvmorph-prod   │
       └────────────────────────┘      └────────────────────────┘ └────────────────────────┘      └────────────────────────┘
```

### Strategy: Two Isolated Vercel Projects (Recommended)

Maintaining two distinct Vercel projects (e.g. `cvmorph-staging` and `cvmorph-prod`) built from the same codebase provides:
1. **Zero Data/Secret Contamination**: Staging database migrations or test resumes never touch production data.
2. **Dedicated Domains**: Each project has its own assigned production domain (e.g., `staging.yourdomain.com` and `app.yourdomain.com`).
3. **Independent Cloudflare R2 Buckets**: Staging templates and generated candidate resumes live in their own bucket.

---

### Step-by-Step Setup

#### 1. Create Staging & Production Resources
Ensure you have provisioned:
- **Databases**: Two PostgreSQL connection strings (e.g., Supabase Staging vs Supabase Production).
- **Object Storage**: Two Cloudflare R2 buckets (e.g., `cvmorph-staging` and `cvmorph-prod`).
- **Firebase Auth**: Either two Firebase projects or separate authorized redirect domains in Firebase Console.

#### 2. Configure Environments in Vercel

##### For Production (`cvmorph-prod` or `cvmorph`):
- Assign domain: `app.cvmorph.com` or `cvmorph-fawn.vercel.app`
- Set Production environment variables:
  - `DATABASE_URL=postgresql+asyncpg://...@prod-db.supabase.co:5432/postgres`
  - `R2_BUCKET=cvmorph-prod`
  - `CORS_ORIGINS=["https://app.cvmorph.com","https://cvmorph-fawn.vercel.app"]`
  - Production `GEMINI_API_KEY`, `JWT_SECRET_KEY`, and `NEXT_PUBLIC_FIREBASE_*`

##### For Staging (`cvmorph-staging`):
- Assign domain: `staging.cvmorph.com` or `cvmorph-staging.vercel.app`
- Set Production environment variables on this project:
  - `DATABASE_URL=postgresql+asyncpg://...@staging-db.supabase.co:5432/postgres`
  - `R2_BUCKET=cvmorph-staging`
  - `CORS_ORIGINS=["https://staging.cvmorph.com","https://cvmorph-staging.vercel.app"]`
  - Staging `GEMINI_API_KEY`, `JWT_SECRET_KEY`, and `NEXT_PUBLIC_FIREBASE_*`

#### 3. How to Deploy Each Environment

##### Method A: Git Branches (Automated CI/CD)
Connect your GitHub repository to both Vercel projects:
- In Vercel Project `cvmorph-staging` → set Production Branch to `staging`
- In Vercel Project `cvmorph-prod` → set Production Branch to `master` (or `main`)
- Pushing to `staging` deploys to your staging domain.
- Pushing to `master` deploys to your production domain.

##### Method B: Vercel CLI from Local Machine
To deploy directly using Vercel CLI to either target project without Git push:

1. **Deploy to Staging**:
   ```bash
   vercel link --project cvmorph-staging --yes
   vercel --prod
   ```

2. **Deploy to Production**:
   ```bash
   vercel link --project cvmorph --yes
   vercel --prod
   ```

3. **Or configure convenience scripts in root `package.json`**:
   ```json
   {
     "scripts": {
       "deploy:staging": "vercel link --project cvmorph-staging --yes && vercel --prod",
       "deploy:prod": "vercel link --project cvmorph --yes && vercel --prod"
     }
   }
   ```

