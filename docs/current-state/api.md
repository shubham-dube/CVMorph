# Current State API Reference — Route Handlers, Schemas & Security

> **Scope**: This document catalogues the **CURRENT STATE** of all FastAPI route handlers mounted under `/v1/` as implemented in [`apps/api/app/api/v1/routers/`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/routers/).

---

## 1. Global Dependencies & Authentication Guards

Every operational endpoint enforces tenant scoping via dependencies defined in [`apps/api/app/api/v1/deps.py`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/deps.py):

| Dependency | Mechanism | Behavior |
|---|---|---|
| **`CurrentUser`** | `HTTPBearer` token validation | Validates the JWT in `Authorization: Bearer <token>`, decodes claims (`sub`, `org`, `role`). Raises 401 on missing, malformed, or expired tokens. |
| **`ScopedDB`** | `AsyncSession` wrapper | Acquires an async session and runs `SET LOCAL app.current_org_id = :org_id` before yielding. Activates PostgreSQL Row-Level Security (RLS). |
| **`AdminUser`** | RBAC check | Wraps `CurrentUser` and asserts `user.is_admin` (`role == 'admin'`). Raises 403 Forbidden if user is a recruiter. |
| **`DBSession`** | Raw session | Unscoped database session used only by pre-authentication routes (`/v1/auth/*`). |

---

## 2. Complete Endpoint Inventory

### Authentication (`/v1/auth`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `POST` | `/v1/auth/login` | None | `{ email, password }` | `TokenResponse` | **Retired / Broken**: Always raises `400 Bad Request` ("Password authentication is disabled. Please sign in with Google"). |
| `GET` | `/v1/auth/me` | `CurrentUser` | None | `UserResponse` | Returns profile of authenticated user. 404 if user row is deleted. |
| `POST` | `/v1/auth/refresh`| `CurrentUser` | None | `TokenResponse` | Issues fresh 30-day JWT for active user. 401 if user is inactive. |
| `POST` | `/v1/auth/google` | None | `{ id_token, email, name, photo_url }` | `TokenResponse` | **CRITICAL FLAW**: Attempts Google token verification; if it fails, falls back to unverified base64 JWT decoding! Auto-creates workspace and assigns `role="admin"` to all new signups. |

---

### Dashboard Analytics (`/v1/dashboard`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `GET` | `/v1/dashboard/stats` | `CurrentUser` | None | `DashboardStatsResponse` | Returns composite KPIs (total candidates, profiles, approved profiles, generations, avg confidence, recent items). **Performance issue**: Contains N+1 database queries and sequential presigned URL calls inside loops. |

---

### Direct Extraction (`/v1/cv`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `POST` | `/v1/cv/extract` | `CurrentUser` | `multipart/form-data`: `file`, `extraction_instructions` | `ExtractResponse` | Synchronous stateless CV extraction. Parses PDF/DOCX and runs Gemini extraction without database persistence. Returns parsed `CandidateProfile`. |

---

### Document Intake & Pipeline (`/v1/documents`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `POST` | `/v1/documents` | `CurrentUser` | `multipart/form-data`: `file`, `candidate_id?`, `extraction_instructions?` | `DocumentUploadResponse` | Uploads CV to object storage, creates `Document` and `Candidate` rows, launches `run_parse` via `BackgroundTasks`. Returns `job_id == document_id`. |
| `GET` | `/v1/documents/{id}` | `CurrentUser` | None | `DocumentResponse` | Retrieves metadata, mime type, and `parse_status` of uploaded document. |
| `GET` | `/v1/documents` | `CurrentUser` | `candidate_id?` query param | `DocumentListResponse` | Lists documents for the current tenant. |

---

### Asynchronous Job Polling (`/v1/jobs`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `GET` | `/v1/jobs/{job_id}` | `CurrentUser` | Path parameter | `JobStatusResponse` | Checks pipeline progress for a document (`queued` → `parsing` → `extracting` → `ready_for_review` \| `failed`). Returns `entity_id` pointing to `CandidateProfile` upon completion. |

---

### Candidate & Profile Review (`/v1/candidates`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `GET` | `/v1/candidates` | `CurrentUser` | `page`, `page_size`, `search?` | `CandidateListResponse` | Lists candidates with pagination, role title, profile count, and master profile reference. |
| `POST` | `/v1/candidates` | `CurrentUser` | `{ name }` | `CandidateResponse` | Creates a new candidate placeholder record. |
| `POST` | `/v1/candidates/from-text` | `CurrentUser` | `{ name, raw_text, instructions?, target_role?, job_description?, bluff_level? }` | `CandidateResponse` | Creates a candidate directly from pasted text, skips document parsing, and kicks off AI extraction. |
| `GET` | `/v1/candidates/{id}` | `CurrentUser` | Path parameter | `CandidateResponse` | Retrieves single candidate details. |
| `DELETE`| `/v1/candidates/{id}` | `AdminUser` | Path parameter | `{ success: true }` | Hard cascade delete of candidate and all associated profiles, documents, and generations. |
| `GET` | `/v1/candidates/{id}/profiles` | `CurrentUser` | Path parameter | `CandidateProfilesListResponse` | Lists all profile variations for a candidate. |
| `POST` | `/v1/candidates/{id}/profiles/clone` | `CurrentUser` | `{ title, base_profile_id?, target_role?, job_description?, custom_prompt?, bluff_level? }` | `ProfileResponse` | Clones an existing profile into a new branch. |
| `POST` | `/v1/candidates/{id}/profiles/tailor` | `CurrentUser` | `{ title, target_role?, job_description, custom_prompt?, bluff_level, base_profile_id? }` | `ProfileResponse` | Clones profile and executes `TailoringService` via Gemini against a target Job Description. |
| `PATCH`| `/v1/candidates/{id}/profiles/{profile_id}/title` | `CurrentUser` | `{ title }` | `ProfileResponse` | Renames a profile branch. |
| `POST` | `/v1/candidates/{id}/profiles/{profile_id}/set-master` | `CurrentUser` | Path parameter | `CandidateResponse` | Elects a specific profile as candidate's default master profile. |
| `DELETE`| `/v1/candidates/{id}/profiles/{profile_id}` | `AdminUser` | Path parameter | `{ success: true }` | Deletes a profile variation. Blocks deletion if it is the sole approved profile. |
| `GET` | `/v1/candidates/{id}/profile` | `CurrentUser` | `profile_id?` query param | `ProfileResponse` | Retrieves the profile JSON data for editing in Review Studio. |
| `PATCH`| `/v1/candidates/{id}/profile` | `CurrentUser` | `{ field_path, action, old_value, new_value, profile }` | `ProfileResponse` | Saves reviewer edits, persists updated profile JSON, and writes audit record to `review_events`. |
| `POST` | `/v1/candidates/{id}/profile/approve` | `CurrentUser` | `profile_id?` query param | `ApproveResponse` | Marks profile as `approved`, unlocking CV generation. |
| `POST` | `/v1/candidates/{id}/profiles/{profile_id}/approve` | `CurrentUser` | Path parameter | `ApproveResponse` | Explicit approval route for a specific profile branch. |
| `GET` | `/v1/candidates/{id}/profile/review-events` | `CurrentUser` | Path parameter | `list[ReviewEventResponse]` | Returns audit log of recruiter edits. |
| `POST` | `/v1/candidates/{id}/profiles/{profile_id}/agent-edit` | `CurrentUser` | `{ prompt, conversation_history? }` | `AgentEditResponse` | In-Studio Conversational AI Copilot. Dispatches prompt to Gemini, modifies profile JSON, records `ReviewEvent`, and returns conversational explanation. |

---

### CV Generation (`/v1/generations`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `POST` | `/v1/generations` | `CurrentUser` | `{ candidate_id, template_id, profile_id?, formatting_instructions? }` | `GenerationResponse` | Asserts profile is approved and template is active, creates `Generation` row, and launches `run_render` via `BackgroundTasks`. |
| `GET` | `/v1/generations/{id}` | `CurrentUser` | Path parameter | `GenerationResponse` | Returns generation status. If `complete`, returns presigned download URLs for DOCX and PDF. |
| `GET` | `/v1/generations` | `CurrentUser` | `candidate_id?`, `status?`, `page`, `page_size` | `GenerationListResponse` | Paginated history of generated CVs. |

---

### Template Management (`/v1/templates`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `GET` | `/v1/templates` | `CurrentUser` | None | `list[TemplateResponse]` | Returns all active templates (org-owned + global system templates). |
| `GET` | `/v1/templates/{id}` | `CurrentUser` | Path parameter | `TemplateResponse` | Retrieves template metadata and section schema configuration. |
| `POST` | `/v1/templates` | `AdminUser` | `multipart/form-data`: `file`, `name`, `description?`, `config_json?` | `TemplateResponse` | Uploads custom `.docx` or `.tex` template. Admin only. |
| `PATCH`| `/v1/templates/{id}` | `AdminUser` | `{ name?, description?, config_json? }` | `TemplateResponse` | Updates template metadata. |
| `DELETE`| `/v1/templates/{id}`| `AdminUser` | Path parameter | `{ success: true }` | Soft-deletes custom template (`is_active = false`). Rejects deletion if `is_system == true`. |
| `GET` | `/v1/templates/{id}/download` | `CurrentUser` | Path parameter | `{ download_url, filename }` | Generates presigned URL to inspect or download the template file. |

---

### Organization & Workspace (`/v1/orgs`)

| Method | Path | Auth Required | Input Schema | Response | Description & Failure Modes |
|---|---|---|---|---|---|
| `GET` | `/v1/orgs/me` | `CurrentUser` | None | `OrgResponse` | Returns current user's organization profile. |
| `PATCH`| `/v1/orgs/me` | `AdminUser` | `{ name?, naming_pattern? }` | `OrgResponse` | Updates organization name and default export naming pattern. |
| `GET` | `/v1/orgs/me/usage` | `CurrentUser` | `period?` ('all_time' \| 'this_month') | `UsageSummaryResponse` | Aggregates `usage_events` metrics (CVs uploaded, CVs generated, API calls). |
| `PATCH`| `/v1/orgs/me/branding` | `AdminUser` | `BrandingUpdateRequest` | `OrgResponse` | Updates branding configuration (logo, colors, fonts). |

---

### Health & Observability

| Method | Path | Auth Required | Response | Description |
|---|---|---|---|---|
| `GET` | `/health` / `/v1/health` | None | `{"status": "ok", "version": "1.0.0"}` | Liveness probe for load balancer / container orchestrator. |
| `GET` | `/ready` / `/v1/ready` | None | `{"status": "ready"}` | Readiness probe: executes `SELECT 1` against PostgreSQL pooler. |

---

## 3. Error Handling Patterns & Gaps

1. **Unstandardized Error Payloads**:
   - `HTTPException` returns standard FastAPI `{ "detail": "message" }`.
   - Pydantic validation errors return `{ "detail": [ { "loc": [...], "msg": "...", "type": "..." } ] }`.
   - Unhandled exceptions return generic 500 tracebacks when `DEBUG=true` or blank 500s. There is no unified error shape like `{ "code": "ERROR_CODE", "message": "...", "details": {} }`.
2. **Missing Rate Limiting**:
   - No rate limiting or throttling exists on sensitive endpoints like `/v1/cv/extract`, `/v1/candidates/from-text`, `/v1/candidates/{id}/profiles/{profile_id}/agent-edit`, or `/v1/auth/google`.
