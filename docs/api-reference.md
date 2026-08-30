# API Reference — CV Transformation Platform

**Base URL:** `http://localhost:8000` (Local Dev / Docker) | `https://api.yourplatform.com` (Production)  
**Version:** `v1`  
**Interactive API Docs:**
- **Swagger UI:** [`http://localhost:8000/docs`](http://localhost:8000/docs)
- **ReDoc:** [`http://localhost:8000/redoc`](http://localhost:8000/redoc)
- **OpenAPI JSON:** [`http://localhost:8000/openapi.json`](http://localhost:8000/openapi.json)

---

## Table of Contents
1. [Authentication & Security](#1-authentication--security)
2. [Full End-to-End Workflow](#2-full-end-to-end-workflow)
3. [State Machines & Enums](#3-state-machines--enums)
4. [Health & Probes](#4-health--probes)
5. [Authentication Endpoints (`/v1/auth`)](#5-authentication-endpoints-v1auth)
6. [Documents & CV Upload (`/v1/documents`)](#6-documents--cv-upload-v1documents)
7. [Synchronous Extraction (`/v1/cv`)](#7-synchronous-extraction-v1cv)
8. [Candidates & Recruiter Review (`/v1/candidates`)](#8-candidates--recruiter-review-v1candidates)
9. [CV Generations (`/v1/generations`)](#9-cv-generations-v1generations)
10. [Templates Management (`/v1/templates`)](#10-templates-management-v1templates)
11. [Organisations & Usage (`/v1/orgs`)](#11-organisations--usage-v1orgs)
12. [Async Jobs & Polling (`/v1/jobs`)](#12-async-jobs--polling-v1jobs)
13. [Canonical Candidate Profile Schema](#13-canonical-candidate-profile-schema)
14. [Error Handling & Status Codes](#14-error-handling--status-codes)
15. [Frontend Integration Guide (TypeScript)](#15-frontend-integration-guide-typescript)

---

## 1. Authentication & Security

All `/v1/*` endpoints (except `POST /v1/auth/login`) require a valid JSON Web Token (JWT) sent via the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

### Multi-Tenancy & Row-Level Security (RLS)
- Every user belongs to an `org_id` (Organisation UUID).
- The `org_id` is embedded inside the JWT payload.
- All database queries enforce tenant isolation at both the application level and via PostgreSQL Row-Level Security (`app.current_org_id`).
- Frontend applications **never** need to pass `org_id` in request bodies or query params.

### Role-Based Access Control (RBAC)
| Role | Permissions |
|---|---|
| `recruiter` | Upload CVs, review candidate profiles, edit fields, approve profiles, trigger generations, view templates . |
| `admin` | All `recruiter` permissions + create/update/delete templates and update organisation branding settings. |

---

## 2. Full End-to-End Workflow

```
┌─────────────────┐       ┌────────────────────────┐       ┌─────────────────────────┐
│ 1. Recruiter    │       │ 2. POST /v1/documents   │       │ 3. Celery Parse Task    │
│    Uploads CV   │──────▶│    Returns doc_id +    │──────▶│    Extracts text from   │
│    (PDF / DOCX) │       │    job_id              │       │    PDF or DOCX          │
└─────────────────┘       └────────────────────────┘       └────────────┬────────────┘
                                                                        │
┌─────────────────────────┐       ┌────────────────────────┐            │
│ 5. GET /v1/candidates/  │       │ 4. Celery Extract Task │◀───────────┘
│    {id}/profile         │◀──────│    Gemini AI creates   │
│    Returns canonical    │       │    CandidateProfile    │
│    profile + confidence │       └────────────────────────┘
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐       ┌────────────────────────┐       ┌─────────────────────────┐
│ 6. Recruiter Review UI  │       │ 7. POST /v1/candidates/│       │ 8. POST /v1/generations │
│    PATCH field edits /  │──────▶│    {id}/profile/approve│──────▶│    Trigger rendering    │
│    confirm low conf     │       │    (validates gates)   │       │    with template_id     │
└─────────────────────────┘       └────────────────────────┘       └────────────┬────────────┘
                                                                                │
                                  ┌────────────────────────┐                    │
                                  │ 9. GET /v1/generations/│◀───────────────────┘
                                  │    {id} -> poll status │
                                  │    Returns signed .docx│
                                  │    download URL (1h)   │
                                  └────────────────────────┘
```

---

## 3. State Machines & Enums

### Document Parse Status
```
queued ──▶ parsing ──▶ parsed ──▶ extracting ──▶ extracted
                                └──▶ failed
```

### Async Job Status
```
queued ──▶ processing ──▶ success (or task-specific: "parsed" / "ready_for_review" / "complete")
          │           └──▶ failed
          └──▶ retrying
          └──▶ cancelled
```

### Profile Extraction Status
```
ready_for_review ──▶ approved
                 └──▶ failed
```

### Generation Status
```
pending ──▶ rendering ──▶ complete (signed download URL ready)
                      └──▶ failed
```

### Source Types (Provenance)
- `source`: Fact copied directly/lightly cleaned from source document.
- `verified_transformation`: Factually verified rewording/normalisation by AI.
- `ai_generated`: Synthesised content without a single direct 1:1 match (e.g., career summary).

---

## 4. Health & Probes

### `GET /health`
Liveness probe. Returns `200` if the FastAPI web service is running.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

### `GET /ready`
Readiness probe. Verifies active connection to PostgreSQL. Used by load balancers and Kubernetes.

**Response `200 OK`:**
```json
{
  "status": "ready"
}
```

---

## 5. Authentication Endpoints (`/v1/auth`)

### `POST /v1/auth/login`
Authenticate with email and password to obtain a Bearer JWT.

**Request Body (`application/json`):**
```json
{
  "email": "admin@copious.com",
  "password": "yourpassword"
}
```

**Response `200 OK`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

**Error `401 Unauthorized`:**
```json
{
  "detail": "Invalid email or password"
}
```

---

### `GET /v1/auth/me`
Retrieve authenticated user profile and organisation ID.

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response `200 OK`:**
```json
{
  "id": "7161be5b-7440-420c-ae69-64ddb6796310",
  "org_id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
  "email": "admin@copious.com",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-08-26T10:00:00Z"
}
```

---

## 6. Documents & CV Upload (`/v1/documents`)

### `POST /v1/documents`
Upload a candidate CV (`.pdf` or `.docx`). Starts the asynchronous background parsing and extraction pipeline.

**Request:** `multipart/form-data`
- `file` (File, required): The PDF or DOCX file (max 10 MB).
- `candidate_id` (string, optional query param): Existing candidate UUID. If omitted, a Candidate is automatically created using the filename.
- `extraction_instructions` (string, optional query param): Recruiter custom prompt guidance for Gemini (e.g., *"Highlight FinTech client projects"*).

**Example Request:**
```http
POST /v1/documents?extraction_instructions=Focus+on+Cloud+Architecture HTTP/1.1
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="Rupesh_Gurjar_CV.docx"
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document

[binary data]
------WebKitFormBoundary--
```

**Response `202 Accepted`:**
```json
{
  "document_id": "8f6d5390-cfef-44d2-9e35-04da9f33ea1f",
  "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
  "job_id": "adbd561d-4815-409b-ab42-5769b2c424ed",
  "status": "queued",
  "message": "CV 'Rupesh_Gurjar_CV.docx' uploaded successfully. Parsing started. Poll GET /v1/jobs/adbd561d-4815-409b-ab42-5769b2c424ed for status, then GET /v1/candidates/7161be5b-7440-420c-ae69-64ddb6796310/profile when complete."
}
```

---

### `GET /v1/documents`
List uploaded documents for the organisation.

**Query Parameters:**
- `candidate_id` (string, optional): Filter by candidate UUID.

**Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "8f6d5390-cfef-44d2-9e35-04da9f33ea1f",
      "org_id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
      "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
      "type": "original",
      "original_filename": "Rupesh_Gurjar_CV.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "file_size_bytes": 45120,
      "parse_status": "extracted",
      "extraction_instructions": "Focus on Cloud Architecture",
      "created_at": "2026-08-26T14:20:00Z"
    }
  ],
  "total": 1
}
```

---

### `GET /v1/documents/{document_id}`
Retrieve a single document's metadata and parsing state.

**Response `200 OK`:** Same structure as item in `GET /v1/documents`.

---

## 7. Synchronous Extraction (`/v1/cv`)

### `POST /v1/cv/extract`
Stateless, synchronous CV parsing + AI extraction in one request (no database persistence). Used for template testing, previews, and builder sandboxes.

**Request:** `multipart/form-data`
- `file` (File, required): PDF or DOCX file.
- `extraction_instructions` (Form text, optional): Custom instructions for Gemini.
- `candidate_id` (Form text, optional): ID to attach to response meta.
- `source_document_id` (Form text, optional): ID to attach to response meta.

**Response `200 OK`:**
```json
{
  "success": true,
  "filename": "Rupesh_Gurjar_CV.docx",
  "profile": {
    "meta": { ... },
    "candidate": { ... },
    "career_summary": { ... },
    "technical_skills": { ... },
    "education": { ... },
    "employment": [ ... ]
  }
}
```

---

## 8. Candidates & Recruiter Review (`/v1/candidates`)

### `GET /v1/candidates`
List all candidates for the organisation with pagination and search.

**Query Parameters:**
- `page` (integer, default: `1`, min: `1`)
- `page_size` (integer, default: `20`, min: `1`, max: `100`)
- `search` (string, optional): Case-insensitive partial name search.

**Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "7161be5b-7440-420c-ae69-64ddb6796310",
      "org_id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
      "name": "Rupesh Gurjar",
      "master_profile_id": "2d30a745-4729-43bf-b26a-a86428cd6cb5",
      "created_at": "2026-08-26T14:15:00Z",
      "updated_at": "2026-08-26T14:24:58Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### `POST /v1/candidates`
Manually create a candidate before uploading documents.

**Request Body (`application/json`):**
```json
{
  "name": "Rupesh Gurjar"
}
```

**Response `201 Created`:** Candidate object.

---

### `GET /v1/candidates/{candidate_id}`
Get a single candidate by UUID.

**Response `200 OK`:** Candidate object.

---

### `GET /v1/candidates/{candidate_id}/profile`
Get the latest extracted Canonical Profile for the candidate, complete with confidence scores and provenance.

**Response `200 OK`:**
```json
{
  "profile_id": "2d30a745-4729-43bf-b26a-a86428cd6cb5",
  "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
  "extraction_status": "ready_for_review",
  "overall_confidence": 0.93,
  "extraction_model": "gemini-2.5-pro",
  "approved_at": null,
  "profile": {
    "meta": {
      "org_id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
      "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
      "source_document_id": "8f6d5390-cfef-44d2-9e35-04da9f33ea1f",
      "extraction_model": "gemini-2.5-pro",
      "extraction_version": "v1",
      "extraction_instructions": null,
      "overall_confidence": 0.93
    },
    "candidate": {
      "full_name": "Rupesh Gurjar",
      "role_title": "Technical Architect & Solution Architect Consultant",
      "email": "rupesh@example.com",
      "phone": "+91 9876543210",
      "location": "Bengaluru, India"
    },
    "career_summary": {
      "bullets": [
        {
          "text": "Engineering Leader with **15+ years** of software engineering experience.",
          "confidence": 0.95,
          "source_type": "verified_transformation",
          "evidence": "15+ years of software industry experience in Architecture..."
        }
      ]
    },
    "technical_skills": {
      "groups": [
        {
          "category": "Technical Leadership",
          "skills": ["Platform Engineering", "Distributed Systems", "Cloud Strategy"],
          "confidence": 0.90,
          "source_type": "source",
          "evidence": null
        }
      ]
    },
    "education": {
      "has_certifications": false,
      "items": [
        {
          "type": "degree",
          "text": "Bachelor of Engineering (B.E.) in Computer Science from RGPV (2003)",
          "confidence": 0.98,
          "source_type": "source",
          "evidence": "B.E. (Computer Science), RGPV Bhopal, 2003"
        }
      ]
    },
    "employment": [
      {
        "company": "McLaren Strategic Solutions",
        "client": null,
        "role": "Technical Architect",
        "start_date": "2022-05",
        "end_date": null,
        "is_current": true,
        "duration_display": "May/2022 - Present",
        "project_name": null,
        "technology_used": ["Python", "FastAPI", "AWS", "Kafka"],
        "project_description": "Architected modern cloud solutions for institutional finance.",
        "responsibilities": [
          {
            "text": "Own end-to-end delivery for **J.P. Morgan Chase** trade finance platform.",
            "confidence": 0.92,
            "source_type": "verified_transformation",
            "evidence": "Leading J.P. Morgan Chase trade finance modernization..."
          }
        ],
        "confidence": 0.92
      }
    ]
  }
}
```

---

### `PATCH /v1/candidates/{candidate_id}/profile`
Recruiter edits a field in the review UI. Writes an immutable audit trail entry (`ReviewEvent`) and updates the candidate's active profile JSON.

**Request Body (`application/json`):**
```json
{
  "field_path": "career_summary.bullets.0.text",
  "action": "edit",
  "old_value": "Engineering Leader with 15+ years of software engineering experience.",
  "new_value": "Engineering Leader with **15+ years** of software engineering experience.",
  "profile": {
    ... full updated CandidateProfile object ...
  }
}
```

**`action` options:**
- `confirm`: Field was verified as correct by recruiter (required for fields where `confidence < 0.85`).
- `edit`: Field value was modified.
- `remove`: Field/bullet was deleted.

**`field_path` format:** Dot-notation with zero-indexed array indices:
- `candidate.role_title`
- `career_summary.bullets.0.text`
- `technical_skills.groups.1`
- `employment.0.responsibilities.2.text`

**Response `200 OK`:** Updated ProfileResponse.

**Error `409 Conflict`:** Returned if the profile is already approved.

---

### `POST /v1/candidates/{candidate_id}/profile/approve`
Approve the candidate profile, unlocking CV generation.

**Review Gate Rule:**
- Every field where `confidence < 0.85` **must** have at least one `ReviewEvent` (`confirm`, `edit`, or `remove`) recorded.
- If any low-confidence fields remain unreviewed, returns `422 Unprocessable Entity` with the exact list of missing paths.

**Response `200 OK`:**
```json
{
  "status": "approved",
  "profile_id": "2d30a745-4729-43bf-b26a-a86428cd6cb5",
  "approved_at": "2026-08-26T14:24:58.232961Z",
  "message": "Profile approved. You can now generate a formatted CV."
}
```

**Error `422 Unprocessable Entity` (Gate Failure):**
```json
{
  "detail": {
    "message": "Some low-confidence fields have not been reviewed.",
    "unreviewed_paths": [
      "career_summary.bullets.1",
      "employment.0.responsibilities.3"
    ],
    "tip": "Confirm, edit, or remove each field listed above, then retry approval."
  }
}
```

---

### `GET /v1/candidates/{candidate_id}/profile/review-events`
Retrieve the complete immutable audit trail of recruiter actions for this profile.

**Response `200 OK`:**
```json
[
  {
    "id": "e0a7df84-95d1-41f8-bf78-65bfa780d60c",
    "field_path": "career_summary.bullets.0.text",
    "action": "edit",
    "old_value": { "value": "Old text" },
    "new_value": { "value": "New **bold** text" },
    "user_id": "7161be5b-7440-420c-ae69-64ddb6796310",
    "created_at": "2026-08-26T14:22:10Z"
  }
]
```

---

## 9. CV Generations (`/v1/generations`)

### `POST /v1/generations`
Trigger formatting & document generation for an approved candidate profile and selected template.

**Request Body (`application/json`):**
```json
{
  "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
  "template_id": "c059787a-0e09-4d2b-ac38-e264c6b0429d",
  "formatting_instructions": "Emphasize AWS and Python experience in bullet formatting"
}
```

**Response `202 Accepted`:**
```json
{
  "id": "b968c6a6-8655-4a6d-870d-88ae1eafc706",
  "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
  "template_id": "c059787a-0e09-4d2b-ac38-e264c6b0429d",
  "profile_id": "2d30a745-4729-43bf-b26a-a86428cd6cb5",
  "status": "pending",
  "formatting_instructions": "Emphasize AWS and Python experience in bullet formatting",
  "output_document_url": null,
  "error_message": null,
  "created_at": "2026-08-26T14:24:57.954139Z",
  "updated_at": "2026-08-26T14:24:57.954139Z"
}
```

---

### `GET /v1/generations/{generation_id}`
Poll generation status. When `status = "complete"`, `output_document_url` provides a signed time-limited (1 hour) download URL for the generated `.docx` file.

**Response `200 OK` (Completed):**
```json
{
  "id": "b968c6a6-8655-4a6d-870d-88ae1eafc706",
  "candidate_id": "7161be5b-7440-420c-ae69-64ddb6796310",
  "template_id": "c059787a-0e09-4d2b-ac38-e264c6b0429d",
  "profile_id": "2d30a745-4729-43bf-b26a-a86428cd6cb5",
  "status": "complete",
  "formatting_instructions": "Emphasize AWS and Python experience in bullet formatting",
  "output_document_url": "file:///d:/Projects/Resume_Formatter/uploads/f52ec175-a73e-440f-b14b-e97b20830bdd/generated/b968c6a6-8655-4a6d-870d-88ae1eafc706/Rupesh_Gurjar_cv.docx",
  "error_message": null,
  "created_at": "2026-08-26T14:24:57.954139Z",
  "updated_at": "2026-08-26T14:24:58.440000Z"
}
```

---

### `GET /v1/generations`
List all generations for the organisation.

**Query Parameters:**
- `candidate_id` (string, optional): Filter by candidate.
- `page` (integer, default: `1`)
- `page_size` (integer, default: `20`)

**Response `200 OK`:**
```json
{
  "items": [
    { ... GenerationResponse ... }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

## 10. Templates Management (`/v1/templates`)

### `GET /v1/templates`
List all active templates available to the organisation.

**Response `200 OK`:**
```json
[
  {
    "id": "c059787a-0e09-4d2b-ac38-e264c6b0429d",
    "org_id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
    "name": "Copious Default",
    "description": "Standard corporate 2-column skills template with executive summary",
    "config_json": {
      "sections": ["career_summary", "technical_skills", "education", "employment"],
      "required_fields": ["candidate.full_name", "candidate.role_title"]
    },
    "is_active": true,
    "created_at": "2026-08-26T10:00:00Z",
    "updated_at": "2026-08-26T10:00:00Z"
  }
]
```

---

### `GET /v1/templates/{template_id}`
Retrieve a single template by UUID.

---

### `POST /v1/templates` *(Admin Only)*
Upload a new `.docx` template file with configuration metadata.

**Request:** `multipart/form-data`
- `file` (File, optional): `.docx` Word template.
- `name` (Form string): Template name.
- `description` (Form string, optional): Description.
- `config_json` (Form string JSON, default: `"{}"`): Section configurations and constraints.

**Response `201 Created`:** TemplateResponse object.

---

### `PATCH /v1/templates/{template_id}` *(Admin Only)*
Update template name, description, or configuration.

**Request Body (`application/json`):**
```json
{
  "name": "Executive Modern",
  "description": "Updated executive template",
  "config_json": {
    "sections": ["career_summary", "technical_skills", "employment", "education"]
  }
}
```

---

### `DELETE /v1/templates/{template_id}` *(Admin Only)*
Soft-delete a template (`is_active = false`).

**Response `204 No Content`**

---

## 11. Organisations & Usage (`/v1/orgs`)

### `GET /v1/orgs/me`
Get the authenticated user's organisation details and current branding settings.

**Response `200 OK`:**
```json
{
  "id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
  "name": "Copious Software",
  "plan_tier": "enterprise",
  "branding_config": {
    "logo_url": "https://cdn.example.com/logo.png",
    "primary_color": "#0F172A",
    "secondary_color": "#3B82F6",
    "font": "Inter"
  },
  "created_at": "2026-08-26T10:00:00Z"
}
```

---

### `GET /v1/orgs/me/usage`
Retrieve aggregated usage metrics for the organisation.

**Query Parameters:**
- `period` (`all_time` | `this_month`, default: `all_time`)

**Response `200 OK`:**
```json
{
  "org_id": "f52ec175-a73e-440f-b14b-e97b20830bdd",
  "period": "this_month",
  "total_cvs_uploaded": 14,
  "total_cvs_generated": 12,
  "total_api_calls": 0
}
```

---

### `PATCH /v1/orgs/me/branding` *(Admin Only)*
Update white-label branding configurations. Partial updates supported.

**Request Body (`application/json`):**
```json
{
  "logo_url": "https://assets.copious.com/brand/logo-dark.svg",
  "primary_color": "#1E293B",
  "secondary_color": "#2563EB",
  "font": "Outfit"
}
```

---

## 12. Async Jobs & Polling (`/v1/jobs`)

### `GET /v1/jobs/{job_id}`
Poll the status of an asynchronous background task (document parse, Gemini extraction, or docxtpl render).

**Response `200 OK`:**
```json
{
  "job_id": "adbd561d-4815-409b-ab42-5769b2c424ed",
  "status": "success",
  "entity_type": "generation",
  "entity_id": "b968c6a6-8655-4a6d-870d-88ae1eafc706",
  "error_message": null,
  "meta": null
}
```

**Status Mapping:**
| Status | Meaning | Next Action |
|---|---|---|
| `queued` | Waiting in Celery broker | Continue polling |
| `processing` | Actively executing on worker | Continue polling |
| `retrying` | Transient retry in progress | Continue polling |
| `success` / `parsed` / `ready_for_review` / `complete` | Job finished successfully | Fetch target entity (`entity_id`) |
| `failed` | Permanent failure | Display `error_message` to user |
| `cancelled` | Task revoked | Stop polling |

---

## 13. Canonical Candidate Profile Schema

The canonical schema is the single source of truth passed across extraction, review, and rendering.

```typescript
export interface CandidateProfile {
  meta: Meta;
  candidate: Candidate;
  career_summary: CareerSummary;
  technical_skills: TechnicalSkills;
  education: Education;
  employment: EmploymentEntry[];
}

export interface Provenance {
  confidence: number; // 0.0 - 1.0 (Flagged if < 0.85)
  source_type: "source" | "verified_transformation" | "ai_generated";
  evidence: string | null; // Verbatim snippet from original CV
}

export interface Candidate {
  full_name: string;
  role_title: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
}

export interface SummaryBullet extends Provenance {
  text: string; // Supports markdown bold: e.g. "**10+ years** of Python"
}

export interface SkillGroup extends Provenance {
  category: string;
  skills: string[];
}

export interface EducationItem extends Provenance {
  type: "degree" | "certification";
  text: string;
}

export interface Education {
  has_certifications: boolean;
  items: EducationItem[];
}

export interface ResponsibilityBullet extends Provenance {
  text: string; // Supports markdown bold
}

export interface EmploymentEntry {
  company: string;
  client?: string | null;
  role: string;
  start_date?: string | null; // "YYYY-MM"
  end_date?: string | null;   // "YYYY-MM" or null if current
  is_current: boolean;
  duration_display: string;   // e.g. "May/2022 - Present"
  project_name?: string | null;
  technology_used: string[];  // Empty array if none, never null
  project_description?: string | null;
  responsibilities: ResponsibilityBullet[];
  confidence: number;         // Roll-up lowest confidence of the job entry
}
```

---

## 14. Error Handling & Status Codes

All errors return JSON with either a simple `detail` string or a structured object:

```json
// Simple Error:
{
  "detail": "Candidate not found"
}

// Structured Validation Error:
{
  "detail": {
    "message": "Some low-confidence fields have not been reviewed.",
    "unreviewed_paths": ["career_summary.bullets.1"],
    "tip": "Confirm, edit, or remove each field listed above, then retry approval."
  }
}
```

### Common HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource created.
- `202 Accepted`: Asynchronous task accepted and queued.
- `204 No Content`: Resource deleted.
- `400 Bad Request`: Malformed payload or empty file.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: User role does not have permission (e.g. non-admin accessing template modification).
- `404 Not Found`: Resource does not exist or belongs to another organisation.
- `409 Conflict`: Resource in conflicting state (e.g. attempting to edit/approve an already approved profile).
- `413 Payload Too Large`: Uploaded file exceeds 10 MB limit.
- `415 Unsupported Media Type`: Non-PDF / non-DOCX file format.
- `422 Unprocessable Entity`: Business validation failure or unreviewed low-confidence paths.
- `502 Bad Gateway`: External AI provider (Gemini) service failure.

---

## 15. Frontend Integration Guide (TypeScript)

### 15.1 API Client Helper
```typescript
// lib/api-client.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/v1";

export async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("access_token");

  const headers: HeadersInit = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(
      typeof errorData.detail === "string" 
        ? errorData.detail 
        : JSON.stringify(errorData.detail)
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
```

### 15.2 Async Job Poller
```typescript
// lib/poll-job.ts
import { fetchWithAuth } from "./api-client";

export interface JobResult {
  job_id: string;
  status: "queued" | "processing" | "success" | "failed" | "retrying" | "cancelled" | string;
  entity_type?: string;
  entity_id?: string;
  error_message?: string;
}

export async function pollJob(
  jobId: string,
  onProgress?: (status: string) => void,
  maxAttempts = 60,
  intervalMs = 1500
): Promise<JobResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await fetchWithAuth<JobResult>(`/jobs/${jobId}`);
    
    if (onProgress) {
      onProgress(job.status);
    }

    if (["success", "parsed", "ready_for_review", "complete"].includes(job.status)) {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error_message || "Async background job failed");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Job polling timed out.");
}
```

### 15.3 Field Edit & Approval Flow
```typescript
// Example: Editing a field and approving in the Review UI
import { fetchWithAuth } from "./api-client";
import { CandidateProfile } from "./types";

export async function reviewField(
  candidateId: string,
  fieldPath: string,
  action: "confirm" | "edit" | "remove",
  oldVal: any,
  newVal: any,
  updatedProfile: CandidateProfile
) {
  return fetchWithAuth(`/candidates/${candidateId}/profile`, {
    method: "PATCH",
    body: JSON.stringify({
      field_path: fieldPath,
      action,
      old_value: oldVal,
      new_value: newVal,
      profile: updatedProfile,
    }),
  });
}

export async function approveProfile(candidateId: string) {
  return fetchWithAuth(`/candidates/${candidateId}/profile/approve`, {
    method: "POST",
  });
}
```
