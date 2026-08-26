# Integrating Phase 2 (Parsing) & Phase 3 (AI Extraction)

This guide is for whoever is picking up **Epic 2 (document upload + parsing)** and **Epic 3 (AI extraction)**. Everything else in the backend is built and working. Your job is to fill in the two stubs — `parse_task.py` and `extract_task.py` — and implement the upload router. Once you do, the full pipeline will be end-to-end.

---

## What's already built that you'll use

| What | File | Your integration point |
|---|---|---|
| PDF text extractor | `app/services/parsing/pdf_parser.py` | Call `extract_text(bytes)` → `str` |
| DOCX text extractor | `app/services/parsing/docx_parser.py` | Call `extract_text(bytes)` → `str` |
| Object storage | `app/services/storage/object_store.py` | `get_object_store()` → put/get/delete |
| Claude API client | `app/services/extraction/claude_provider.py` | `ClaudeProvider().extract(...)` |
| Validator | `app/services/extraction/validator.py` | `validate(profile)` → raises on failure |
| Provider factory | `app/services/extraction/provider_factory.py` | `get_provider()` → AIProvider |
| DB session (with RLS) | `app/db/session.py` | `get_session_for_org(org_id)` |
| All ORM models | `app/models/__init__.py` | Document, Candidate, CandidateProfile |
| Celery app | `app/workers/celery_app.py` | Import and use `celery_app` decorator |

---

## Epic 2 — Upload & Parsing Pipeline

### 2.1 — `POST /v1/documents` (upload endpoint)

File: `apps/api/app/api/v1/routers/documents.py`

The stub already validates MIME type. You need to implement:

```python
@router.post("", response_model=DocumentUploadResponse, status_code=202)
async def upload_document(
    file: UploadFile,
    db: ScopedDB,          # use ScopedDB (has RLS set), NOT DBSession
    user: CurrentUser,
    candidate_id: str | None = None,
    extraction_instructions: str | None = None,
) -> DocumentUploadResponse:
    # Step 1: Read + size-check
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(413, "File too large")

    # Step 2: TODO (P1) — virus scan via ClamAV or cloud scanning API

    # Step 3: Create or reuse candidate
    if not candidate_id:
        candidate = Candidate(org_id=user.org_id, name=file.filename or "Unknown")
        db.add(candidate)
        await db.flush()
        candidate_id = candidate.id

    # Step 4: Store in object storage
    store = get_object_store()
    key = f"{user.org_id}/raw/{uuid.uuid4()}/{file.filename}"
    storage_url = await store.put(key, file_bytes, content_type=file.content_type)

    # Step 5: Create Document row
    doc = Document(
        org_id=user.org_id,
        candidate_id=candidate_id,
        type="original",
        original_filename=file.filename,
        mime_type=file.content_type,
        storage_url=storage_url,
        file_size_bytes=len(file_bytes),
        extraction_instructions=extraction_instructions,
        parse_status="queued",
        uploaded_by=user.user_id,
    )
    db.add(doc)
    await db.flush()

    # Step 6: Log usage event
    db.add(UsageEvent(org_id=user.org_id, event_type="cv_uploaded", reference_id=doc.id))

    # Step 7: Enqueue parse task
    job = parse_task.run.delay(doc.id, user.org_id)

    return DocumentUploadResponse(
        document_id=doc.id,
        job_id=job.id,
        status="queued",
    )
```

---

### 2.4 — `parse_task.py`

File: `apps/api/app/workers/tasks/parse_task.py`

Follow **exactly** the same pattern as `render_task.py` — that file is your reference implementation for how Celery tasks use `asyncio.run()`, `get_session_for_org()`, and handle errors.

```python
@celery_app.task(name="parse_task.run", bind=True, queue="default",
                 max_retries=3, acks_late=True, track_started=True)
def run(self, document_id: str, org_id: str) -> dict:
    return asyncio.run(_run_async(self, document_id, org_id))

async def _run_async(task, document_id: str, org_id: str) -> dict:
    async with get_session_for_org(org_id) as db:
        doc = await db.get(Document, document_id)
        doc.parse_status = "parsing"
        await db.flush()

    try:
        async with get_session_for_org(org_id) as db:
            doc = await db.get(Document, document_id)
            store = get_object_store()
            file_bytes = await store.get(doc.storage_url)

            # Route by MIME type
            if doc.mime_type == "application/pdf":
                raw_text = pdf_parser.extract_text(file_bytes)
            elif "wordprocessingml" in doc.mime_type:
                raw_text = docx_parser.extract_text(file_bytes)
            else:
                raise ValueError(f"Unsupported MIME type: {doc.mime_type}")

            # Guard: scanned/image PDFs produce empty text
            if not raw_text or len(raw_text.strip()) < 50:
                raise ValueError(
                    "Document appears to be image-only (OCR not supported in MVP). "
                    "Please upload a text-based PDF or DOCX."
                )

            doc.raw_text = raw_text
            doc.parse_status = "parsed"
            await db.flush()

        # Enqueue extraction immediately
        extract_task.run.delay(document_id, org_id)

        return {
            "status": "parsed",
            "entity_type": "document",
            "entity_id": document_id,
        }

    except Exception as exc:
        async with get_session_for_org(org_id) as db:
            doc = await db.get(Document, document_id)
            doc.parse_status = "failed"
            doc.raw_text = None
            await db.flush()
        raise  # Celery will handle retry logic
```

**Required imports you'll add to parse_task.py:**
```python
from app.services.parsing import pdf_parser, docx_parser
from app.services.storage.object_store import get_object_store
from app.workers.tasks import extract_task
```

---

### Epic 3 — `extract_task.py`

File: `apps/api/app/workers/tasks/extract_task.py`

```python
@celery_app.task(name="extract_task.run", bind=True, queue="default",
                 max_retries=2, acks_late=True, track_started=True)
def run(self, document_id: str, org_id: str) -> dict:
    return asyncio.run(_run_async(self, document_id, org_id))

async def _run_async(task, document_id: str, org_id: str) -> dict:
    async with get_session_for_org(org_id) as db:
        doc = await db.get(Document, document_id)

        if not doc or not doc.raw_text:
            raise RuntimeError(f"Document {document_id} has no raw_text to extract from")

        # Mark as extracting
        doc.parse_status = "extracting"
        await db.flush()

    try:
        # Get the provider
        provider = get_provider()

        # Call Claude — this is async and uses asyncio.to_thread internally
        profile = await provider.extract(
            raw_text=doc.raw_text,
            org_id=org_id,
            candidate_id=doc.candidate_id,
            source_document_id=document_id,
            instructions=doc.extraction_instructions,
        )

        # Validate (raises ValidationError on failure)
        validate(profile)

        # Store the profile
        async with get_session_for_org(org_id) as db:
            profile_row = CandidateProfile(
                org_id=org_id,
                candidate_id=doc.candidate_id,
                source_document_id=document_id,
                profile_json=profile.model_dump(mode="json"),
                extraction_status="ready_for_review",
                extraction_model=profile.meta.extraction_model,
                extraction_version=profile.meta.extraction_version,
                overall_confidence=profile.meta.overall_confidence,
            )
            db.add(profile_row)

            doc = await db.get(Document, document_id)
            doc.parse_status = "extracted"
            await db.flush()

        return {
            "status": "ready_for_review",
            "entity_type": "profile",
            "entity_id": profile_row.id,
        }

    except Exception as exc:
        async with get_session_for_org(org_id) as db:
            doc = await db.get(Document, document_id)
            doc.parse_status = "failed"
            await db.flush()
        raise
```

**Required imports for extract_task.py:**
```python
from app.services.extraction.provider_factory import get_provider
from app.services.extraction.validator import validate
from app.models import Document, CandidateProfile  # ORM model
from app.schemas.candidate_profile import CandidateProfile as CandidateProfileSchema
```

> ⚠️ Note the naming collision: the ORM model and the Pydantic schema are both called `CandidateProfile`. Import the ORM model as `CandidateProfileModel` to avoid confusion:
> ```python
> from app.models import CandidateProfile as CandidateProfileModel
> from app.schemas.candidate_profile import CandidateProfile
> ```

---

## Job status flow (what the frontend polls)

```
POST /v1/documents → job_id (parse_task)
GET  /v1/jobs/{job_id} → "queued" → "processing" → "success" (entity: document, "parsed")

Then extract_task starts automatically:
GET  /v1/jobs/{extract_job_id} → "queued" → "processing" → "success" (entity: profile, "ready_for_review")
```

> Currently the GET /v1/jobs response doesn't include the extract_task job_id.
> Consider: when parse_task completes, store the extract_task job_id on the Document row
> so the frontend can poll both. Or, the frontend can poll `GET /v1/candidates/{id}/profile`
> and watch `extraction_status` change from `pending` → `ready_for_review`.

**Recommended approach:** have parse_task store the extract_job_id on the Document row, and the upload endpoint return both `parse_job_id` and optionally a websocket/SSE channel URI for real-time status updates (future).

---

## Integration test you should write

```python
# tests/integration/test_upload_pipeline.py
async def test_upload_and_extract_pdf(async_client, db_session, fixture_pdf):
    # 1. Upload
    response = await async_client.post("/v1/documents", files={"file": fixture_pdf})
    assert response.status_code == 202
    job_id = response.json()["job_id"]
    document_id = response.json()["document_id"]

    # 2. Run parse_task synchronously (no Celery broker needed in tests)
    from app.workers.tasks.parse_task import _run_async
    result = await _run_async(None, document_id, SEED_ORG_ID)
    assert result["status"] == "parsed"

    # 3. Check document has raw_text
    doc = await db_session.get(Document, document_id)
    assert doc.raw_text and len(doc.raw_text) > 100

    # 4. Run extract_task with mocked Claude
    with patch("app.services.extraction.claude_provider.ClaudeProvider.extract") as mock:
        mock.return_value = fixture_profile  # use rupesh_g.json fixture
        from app.workers.tasks.extract_task import _run_async as extract_async
        result = await extract_async(None, document_id, SEED_ORG_ID)
        assert result["status"] == "ready_for_review"
```

---

## Key files to know

```
apps/api/
├── app/
│   ├── models/__init__.py              ← ORM: Document, CandidateProfile
│   ├── schemas/candidate_profile.py    ← Pydantic: canonical schema (DON'T CHANGE)
│   ├── services/
│   │   ├── parsing/
│   │   │   ├── pdf_parser.py           ← DONE: extract_text(bytes) -> str
│   │   │   └── docx_parser.py          ← DONE: extract_text(bytes) -> str
│   │   ├── extraction/
│   │   │   ├── claude_provider.py      ← DONE: ClaudeProvider.extract(...)
│   │   │   ├── provider_factory.py     ← DONE: get_provider()
│   │   │   └── validator.py            ← DONE: validate(profile)
│   │   └── storage/
│   │       └── object_store.py         ← DONE: get_object_store() -> ObjectStore
│   ├── workers/tasks/
│   │   ├── parse_task.py               ← ← ← YOUR WORK
│   │   ├── extract_task.py             ← ← ← YOUR WORK
│   │   └── render_task.py              ← DONE (reference implementation)
│   └── api/v1/routers/
│       └── documents.py                ← ← ← YOUR WORK (POST endpoint)
└── tests/
    └── fixtures/
        ├── reference_cvs/              ← Put sample PDFs/DOCXs here
        └── profiles/rupesh_g.json      ← Mock extraction output for testing
```

---

## Contract: what extract_task must write to the DB

The rest of the pipeline (candidates router, generations, render_task) expects a `candidate_profiles` row with:

```
candidate_profiles.profile_json    = CandidateProfile.model_dump(mode="json")
candidate_profiles.extraction_status = "ready_for_review"
candidate_profiles.overall_confidence = profile.meta.overall_confidence
candidate_profiles.extraction_model  = profile.meta.extraction_model
```

If `extraction_status != "approved"`, the generate endpoint will refuse to start rendering.
The recruiter review UI (already built) reads this row and drives the confidence badges.

**Do not change the `CandidateProfile` Pydantic schema** without coordinating — it is the
contract between your work and both the review UI and the renderer.

---

## Local testing without Celery

Run tasks directly as async functions — no broker needed:

```bash
# Start just Postgres + Redis
docker-compose up -d postgres redis

# Run the parse task directly
python -c "
import asyncio
from app.workers.tasks.parse_task import _run_async
asyncio.run(_run_async(None, '<document-id>', '<org-id>'))
"
```

---

## When you're done

1. Open a PR into `main` with:
   - Implemented `parse_task.py` and `extract_task.py`
   - Implemented `POST /v1/documents`
   - Integration tests in `tests/integration/test_upload_pipeline.py`

2. The end-to-end test is:
   - `POST /v1/documents` (upload Rupesh's CV)
   - Poll until `GET /v1/candidates/{id}/profile` returns `extraction_status = "ready_for_review"`
   - Verify confidence scores and evidence text are populated

3. Tag me for a quick review of the extraction output quality on the three reference CVs before merging.
