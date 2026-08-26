# API Reference — CV Transformation Platform

**Base URL:** `http://localhost:8000` (dev) | `https://api.yourplatform.com` (prod)  
**Version:** v1  
**Auth:** All endpoints except `/v1/auth/login` require `Authorization: Bearer <token>`  
**Swagger UI:** [`/docs`](http://localhost:8000/docs)  

---

## Authentication

### `POST /v1/auth/login`
Login with email + password. Returns a JWT access token.

**Request:**
```json
{ "email": "admin@copious.com", "password": "yourpassword" }
```

**Response `200`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

Use this token in every subsequent request: `Authorization: Bearer <access_token>`

---

### `GET /v1/auth/me`
Returns the currently authenticated user.

**Response `200`:**
```json
{
  "id": "uuid",
  "org_id": "uuid",
  "email": "admin@copious.com",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-08-26T10:00:00Z"
}
```

---

## Health

### `GET /health`
Liveness probe. Returns `200` if the process is running.

### `GET /ready`
Readiness probe. Runs a DB query — returns `200` when ready to serve traffic.

---

## Candidates

A **Candidate** is a person record. Multiple source CVs and profiles can belong to one candidate.

### `GET /v1/candidates`
List all candidates for the org. Paginated.

**Query params:**
- `page` (int, default: 1)
- `page_size` (int, default: 20, max: 100)
- `search` (string) — partial name match

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "name": "Rupesh G",
      "master_profile_id": "uuid | null",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### `POST /v1/candidates`
Create a candidate record manually. (Normally done automatically by `POST /v1/documents`.)

**Request:**
```json
{ "name": "Rupesh G" }
```

**Response `201`:** Candidate object (same shape as list item)

---

### `GET /v1/candidates/{candidate_id}`
Get a single candidate.

**Response `200`:** Candidate object

---

### `GET /v1/candidates/{candidate_id}/profile`
Get the latest extracted canonical profile for a candidate.

> Returns `404` if no profile exists yet (upload hasn't completed extraction).

**Response `200`:**
```json
{
  "profile_id": "uuid",
  "candidate_id": "uuid",
  "extraction_status": "ready_for_review | approved | failed",
  "overall_confidence": 0.93,
  "extraction_model": "claude-sonnet-4-5",
  "approved_at": "null | ISO datetime",
  "profile": {
    "meta": {
      "org_id": "uuid",
      "candidate_id": "uuid",
      "source_document_id": "uuid",
      "extraction_model": "claude-sonnet-4-5",
      "extraction_version": "v1",
      "extraction_instructions": null,
      "overall_confidence": 0.93
    },
    "candidate": {
      "full_name": "Rupesh G",
      "role_title": "Snr. Full Stack Consultant",
      "email": "rupesh@example.com",
      "phone": "+91 9999999999",
      "location": "Bangalore, India"
    },
    "career_summary": {
      "bullets": [
        {
          "text": "Engineering Leader with **15+ years** of software engineering experience.",
          "confidence": 0.95,
          "source_type": "verified_transformation",
          "evidence": "Engineering Leader with 15+ years..."
        }
      ]
    },
    "technical_skills": {
      "groups": [
        {
          "category": "Technical Leadership",
          "skills": ["Platform Engineering Strategy", "Distributed Systems"],
          "confidence": 0.9,
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
          "text": "B.E. in Computer Science from RGPV (2003)",
          "confidence": 0.98,
          "source_type": "source",
          "evidence": "Bachelor of Engineering (B.E.)..."
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
        "technology_used": [],
        "project_description": null,
        "responsibilities": [
          {
            "text": "Own end-to-end delivery for **J.P. Morgan Chase**.",
            "confidence": 0.92,
            "source_type": "verified_transformation",
            "evidence": "Own end-to-end delivery..."
          }
        ],
        "confidence": 0.9
      }
    ]
  }
}
```

**Confidence scores:** `0.0–1.0`. Fields below `0.85` are flagged for recruiter review.

**Source types:**
| Value | Meaning |
|---|---|
| `source` | Copied/lightly cleaned from the CV directly |
| `verified_transformation` | Reworded by AI but every fact verified against source text |
| `ai_generated` | Synthesised content (e.g. summary paragraph) — always flag in UI |

---

### `PATCH /v1/candidates/{candidate_id}/profile`
Recruiter field edit. Writes a `ReviewEvent` to the audit log and updates the profile JSON.

**Request:**
```json
{
  "field_path": "career_summary.bullets.0.text",
  "action": "edit",
  "old_value": { "value": "Old text here" },
  "new_value": { "value": "Corrected text here" },
  "profile": { ... full updated CandidateProfile object ... }
}
```

**`action` values:**
- `confirm` — field is correct, just acknowledged (no value change)
- `edit` — value was changed
- `remove` — field/item was deleted

**`field_path` examples:**
- `career_summary.bullets.0` — first summary bullet
- `employment.1.responsibilities.2.text` — a specific responsibility
- `technical_skills.groups.3` — an entire skill group

**Response `200`:** Updated ProfileResponse

> Returns `409` if the profile is already approved.

---

### `POST /v1/candidates/{candidate_id}/profile/approve`
Approve the profile, enabling CV generation.

**Pre-conditions enforced:**
- All fields with `confidence < 0.85` must have at least one `ReviewEvent`
- Returns `422` with `unreviewed_paths` if any flagged fields are unreviewed

**Response `200`:**
```json
{
  "status": "approved",
  "profile_id": "uuid",
  "approved_at": "2026-08-26T10:30:00Z",
  "message": "Profile approved. You can now generate a formatted CV."
}
```

**Error `422`:**
```json
{
  "detail": {
    "message": "Some low-confidence fields have not been reviewed.",
    "unreviewed_paths": ["career_summary.bullets.1", "employment.0.responsibilities.3"],
    "tip": "Confirm, edit, or remove each field listed above, then retry approval."
  }
}
```

---

### `GET /v1/candidates/{candidate_id}/profile/review-events`
Get the full review audit log for the candidate's current profile.

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "field_path": "career_summary.bullets.0.text",
    "action": "edit",
    "old_value": { "value": "old text" },
    "new_value": { "value": "corrected text" },
    "user_id": "uuid",
    "created_at": "2026-08-26T10:25:00Z"
  }
]
```

---

## Documents

> **Note:** `POST /v1/documents` (upload) is implemented by **Phase 2 (Epic 2)**. The endpoint stub currently returns `501`. The document model, storage, and job infrastructure are fully implemented.

### `GET /v1/documents/{document_id}`
Get document metadata and parse status.

**Parse status values:** `pending → queued → parsing → parsed → failed`

---

## Jobs

### `GET /v1/jobs/{job_id}`
Poll the status of an async job (parse, extract, or render).

**Response `200`:**
```json
{
  "job_id": "celery-task-uuid",
  "status": "queued | processing | retrying | success | failed | cancelled",
  "entity_type": "document | profile | generation",
  "entity_id": "uuid",
  "error_message": null
}
```

**Polling strategy:** exponential backoff starting at 1s, max 10s interval.

---

## Generations

### `POST /v1/generations`
Trigger CV generation from an approved profile + template.

**Request:**
```json
{
  "candidate_id": "uuid",
  "template_id": "uuid",
  "formatting_instructions": "Emphasize AWS experience. Shorten summary to 3 bullets."
}
```

> `formatting_instructions` can guide emphasis/tone but cannot add new facts.

**Response `202`:**
```json
{
  "id": "uuid",
  "candidate_id": "uuid",
  "template_id": "uuid",
  "profile_id": "uuid",
  "status": "pending",
  "formatting_instructions": "...",
  "output_document_url": null,
  "error_message": null,
  "created_at": "...",
  "updated_at": "..."
}
```

**Pre-conditions (returns `422` if violated):**
- Candidate must have an approved profile
- Template must belong to the org and be active

---

### `GET /v1/generations/{generation_id}`
Poll generation status. When `status = 'complete'`, `output_document_url` contains a 1-hour signed download URL.

**Status values:** `pending → rendering → complete | failed`

**Response `200`:**
```json
{
  "id": "uuid",
  "status": "complete",
  "output_document_url": "https://s3.../signed-url...",
  "error_message": null,
  ...
}
```

---

### `GET /v1/generations`
List all generations for the org.

**Query params:** `candidate_id`, `page`, `page_size`

---

## Templates

### `GET /v1/templates`
List all active templates for the org. A "Copious Default" template is pre-seeded.

**Response `200`:** Array of template objects:
```json
[
  {
    "id": "uuid",
    "org_id": "uuid",
    "name": "Copious Default",
    "description": "...",
    "config_json": {
      "sections": ["career_summary", "technical_skills", "education", "employment"],
      "required_fields": ["candidate.full_name", "candidate.role_title"],
      "constraints": { "max_summary_bullets": 6, "min_summary_bullets": 3 }
    },
    "is_active": true,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

### `GET /v1/templates/{template_id}`
Get a single template.

### `POST /v1/templates` *(admin only)*
Upload a new .docx template. Multipart form data:
- `file`: the .docx file
- `name`: template display name
- `description`: optional
- `config_json`: JSON string of the config object

### `PATCH /v1/templates/{template_id}` *(admin only)*
Update template name, description, or config.

### `DELETE /v1/templates/{template_id}` *(admin only)*
Soft-delete (sets `is_active = false`).

---

## Organisations

### `GET /v1/orgs/me`
Get the authenticated user's organisation.

### `GET /v1/orgs/me/usage`
Usage metrics for the org.

**Query params:** `period=all_time|this_month`

**Response `200`:**
```json
{
  "org_id": "uuid",
  "period": "all_time",
  "total_cvs_uploaded": 42,
  "total_cvs_generated": 38,
  "total_api_calls": 0
}
```

### `PATCH /v1/orgs/me/branding` *(admin only)*
Update org branding config (logo_url, primary_color, secondary_color, font).

---

## Error responses

All errors follow this shape:
```json
{ "detail": "Human-readable message" }
```

Or for structured errors (e.g. approve with unreviewed fields):
```json
{ "detail": { "message": "...", "unreviewed_paths": [...] } }
```

| HTTP code | When |
|---|---|
| `400` | Bad request (malformed input) |
| `401` | Missing or expired token |
| `403` | Valid token but insufficient role |
| `404` | Resource not found (or belongs to another org) |
| `409` | Conflict (e.g. approving an already-approved profile) |
| `415` | Unsupported file type on upload |
| `422` | Validation failed (see `detail` for specifics) |
| `500` | Server error |
| `501` | Not yet implemented (Phase 2/3 endpoints) |

---

## Full workflow (happy path)

```
1. POST /v1/auth/login               → access_token
2. POST /v1/documents                → { document_id, job_id }  ← Phase 2
3. GET  /v1/jobs/{job_id}            → poll until status = "success"
4. GET  /v1/candidates/{id}/profile  → profile with confidence scores
5. PATCH /v1/candidates/{id}/profile → review low-confidence fields (repeat)
6. POST /v1/candidates/{id}/profile/approve → status = "approved"
7. GET  /v1/templates                → pick a template_id
8. POST /v1/generations              → { generation_id }
9. GET  /v1/generations/{id}         → poll until status = "complete"
10. GET output_document_url          → download .docx
```

Steps 2–3 depend on Phase 2 (Epic 2 — document upload & parsing pipeline).  
Steps 1, 4–10 are fully implemented and available now.

---

## Frontend development notes

**Mocking steps 2–3 during development:**
```typescript
// In api-client.ts, mock the upload + job response:
async uploadDocument(file: File): Promise<{ document_id: string; job_id: string }> {
  // Simulate upload delay then immediately create a candidate with fixture profile
  await new Promise(r => setTimeout(r, 2000));
  // POST /v1/candidates to get a candidate_id
  // Then directly POST the fixture profile JSON to the DB via a dev-only endpoint
  return { document_id: "mock-doc-id", job_id: "mock-job-id" };
}
```

**Fixture profile:** `apps/api/tests/fixtures/profiles/rupesh_g.json`  
Use this file as mock API response data for building all review UI components.

**TypeScript types:** `packages/shared-types/` — generated from the Pydantic schema.
