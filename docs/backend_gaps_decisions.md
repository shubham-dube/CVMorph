# Frontend → Backend: gaps, decisions, and requests

Read this alongside `docs/api-reference.md` from the main repo. Everything the frontend needs already exists in the documented API **except** the items below. None of these block the frontend build — each has a documented fallback/assumption — but they should be picked up as real backend tickets.

---

## 1. Auth mechanism mismatch (decided, needs backend follow-up)

The web scaffold's `.env.local.example` and the login page's TODO comment both pointed at **Google OAuth via NextAuth**. The actual, implemented backend is **email/password → Bearer JWT** (`POST /v1/auth/login`, `GET /v1/auth/me`). There is no OAuth endpoint in the routers.

**Decision made for this build:** implement real email/password login against the actual API, not a NextAuth/Google flow that has no backend counterpart yet. Google OAuth is a fine P1/P2 addition (per the PRD) but building it now would mean shipping a login screen that can't authenticate against the real backend.

**Token storage — flagged as a simplification, not a final answer:** the backend returns the JWT in the response body with no cookie-setting of its own. The frontend stores it in `localStorage` (for the API client) and mirrors it into a plain (non-`httpOnly`) cookie (for the Next.js middleware that gates dashboard routes). This works, but a token in `localStorage`/a readable cookie is vulnerable to theft via any XSS bug — acceptable for an internal-tool MVP, not acceptable once this is a public-facing paid product per the PRD's SaaS phase.

**Recommendation:** move to backend-issued `httpOnly`, `Secure`, `SameSite=Lax` session cookies (or a short-lived access token + `httpOnly` refresh token pair) before any public launch. This is a backend change (the login endpoint would need to `Set-Cookie` instead of/in addition to returning the token in the body) plus a small frontend change to stop manually managing the token. Worth its own ticket rather than bundling into general auth hardening.

## 2. No token refresh / expiry handling endpoint

`TokenResponse` includes `expires_in` but there's no refresh endpoint. The frontend currently just logs the user out and redirects to `/login` when a request comes back `401`. Fine for MVP; a refresh-token flow would remove the "surprise logout mid-review" edge case and is worth adding alongside the cookie change above.

## 3. No candidate/document delete endpoints

The candidates list and document history have no way to delete a mistaken upload or a test candidate from the UI, because there's no `DELETE /v1/candidates/{id}` or `DELETE /v1/documents/{id}` in the routers. The frontend does not expose a delete action anywhere right now as a result. Low-effort backend addition, meaningful UX gap in daily use (recruiters will absolutely upload the wrong file sometimes).

## 4. No org-wide candidate/generation search beyond name substring

`GET /v1/candidates?search=` only searches candidate name. Once volume grows, recruiters will want to filter by review status (needs-review vs. approved vs. generated) and by upload date range. The frontend's candidates list currently does status filtering **client-side** on the page of results returned, which will silently stop working correctly once pagination is in play (i.e. "needs review" candidates on page 2 won't show up while filtering page 1). Flagging this now rather than after it ships wrong: recommend adding `status` and `date_from`/`date_to` query params to `GET /v1/candidates` before this list gets long in practice.

## 5. No real-time push for job/generation status

Both the upload stepper and the generation status screen poll `GET /v1/jobs/{id}` / `GET /v1/generations/{id}` on an interval (per the reference `pollJob` helper in the API doc). This works fine for MVP but means extra load and a small latency tail on “done” detection. A future WebSocket or SSE status stream would be a nice P1/P2 upgrade — not requesting it now, just noting the polling is a deliberate, documented choice rather than an oversight.

## 6. No template preview image

`GET /v1/templates` returns `name`, `description`, `config_json` — no thumbnail/preview image of what the template actually looks like. The templates page currently renders a generated placeholder (an abstract pattern derived from the template name) instead of a real preview, which is a real UX gap for anyone choosing between two similarly-described templates. **Request:** either a `preview_image_url` field on the template resource (rendered by the backend once, e.g. off the first page of the template `.docx`), or a dedicated `GET /v1/templates/{id}/preview` endpoint.

## 7. No aggregate "needs my attention" endpoint

The candidates list is the closest thing to a home screen, and it currently derives "needs review" status by inspecting the fetched profile's confidence data client-side per row (extra round trip per candidate today, since `GET /v1/candidates` doesn't include profile/status summary). **Request:** include a lightweight `latest_profile_status` (`ready_for_review` / `approved` / `no_profile_yet`) and `overall_confidence` directly on each item in `GET /v1/candidates`, so the list can render status without N+1 profile fetches.

## 8. Branding logo upload

`PATCH /v1/orgs/me/branding` takes `logo_url` as a string — there's no file upload endpoint for the logo itself, so the settings page currently only accepts a URL (the admin has to host the image somewhere else first). A `POST /v1/orgs/me/branding/logo` (multipart, returns a URL) would complete the loop, consistent with how document/template upload already works.

---

## What the frontend assumed where the API reference was silent

- **Pagination defaults:** used the documented defaults (`page=1`, `page_size=20` for candidates/generations) everywhere; no infinite-scroll, just numbered pagination, since 20-at-a-time is plenty for a recruiter's working set.
- **`role_title` vs. individual job titles:** per the schema doc, treated `candidate.role_title` as the one editable "positioning title" field shown at the top of the review screen, distinct from any single `employment[].role`.
- **Empty `technology_used`/`client`/`project_name`/`project_description`:** rendered as simply absent in the UI (no "N/A" labels), matching the schema doc's guidance that these are always present-but-nullable in the JSON, never omitted.