# My Copious · Coding Standards & Quality Guidelines

## 1. Universal Standards

### 1.1 File Size & Complexity Limits
- **Max file size**: 300 lines for components, 400 lines for backend services/routers. Files exceeding 400 lines must be split into sub-modules.
- **Max function length**: 40 lines. Functions exceeding 40 lines must extract helper routines.
- **Cyclomatic complexity**: Keep below 10 per function. Avoid deeply nested conditionals (guard clauses preferred).

### 1.2 Comments & Documentation
- **Self-documenting code**: Code should explain *what* is happening through descriptive naming; comments explain *why* non-obvious business decisions or trade-offs were made.
- **Docstrings & JSDoc**:
  - All public backend service methods and repository methods require Python docstrings detailing arguments, returns, and raised exceptions.
  - All shared frontend library hooks and utilities require JSDoc comments.
- **No commented-out dead code**: Delete dead code immediately; Git history preserves past implementations.

---

## 2. Backend (Python 3.12 / FastAPI)

### 2.1 Typing & Static Analysis
- **Strict Typing**: All function signatures must have full type annotations (`def func(param: str) -> CandidateResponse:`).
- **No `Any` without justification**: Avoid `typing.Any`. Use generic types, `TypeVar`, or specific Pydantic models.
- **Pydantic Validation**: All external inputs (request body, query parameters, external API responses) must be parsed through Pydantic models with explicit field constraints.
- **Linter & Typechecker**: Every commit must pass `ruff check .` and `mypy app/`.

### 2.2 Import Ordering
Imports must follow standard Python PEP 8 grouping, managed automatically by `ruff`:
1. Standard library imports (`os`, `sys`, `typing`, `uuid`).
2. Third-party package imports (`fastapi`, `pydantic`, `sqlalchemy`).
3. Local application imports using absolute imports (`from app.core.config import settings`).

### 2.3 Async & Database Conventions
- **Pure Async**: Use `async`/`await` consistently throughout the backend. Never call blocking synchronous I/O functions (`time.sleep()`, synchronous `requests.get()`, or blocking file operations) inside async endpoints. Use `asyncio.sleep()`, `httpx.AsyncClient()`, or `run_in_threadpool()` when invoking legacy synchronous libraries (like `docxtpl` or LibreOffice).
- **Database Sessions**: Never instantiate `Session()` directly in route handlers. Always inject via `db: AsyncSession = Depends(get_db)`.
- **Transactions**: Explicitly commit or rollback. Wrap multi-table state mutations in `async with session.begin():` blocks.

### 2.4 Structured Logging
- **Logger**: Use the central structured logger `from app.core.logging import logger`.
- **Request Context**: Logs must automatically attach request ID, user ID, and tenant ID where available.
- **PII Safety**: Never log raw candidate resumes, email addresses, phone numbers, or authentication tokens. Log candidate IDs and profile versions instead.
- **Format**: Structured JSON output in production; readable colored output in local development.

---

## 3. Frontend (TypeScript / Next.js 16 / React 19)

### 3.1 TypeScript Rigor
- **Strict Mode Enabled**: `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true` in `tsconfig.json`.
- **No Type Assertions (`as any`)**: Treat type casting as a smell. If dealing with unknown API payloads, parse with Zod or validate with type guards.
- **Shared Types**: Use canonical types from `@my-copious/shared-types` or `lib/types.ts`. Do not redefine Candidate or Generation structures locally inside components.

### 3.2 React 19 & Next.js App Router Rules
- **Server Components by Default**: Pages and layout components are Server Components unless interactivity (state, event listeners, effects) is strictly required. Mark client components explicitly with `'use client'`.
- **Thin Route Handlers**: `app/` routes should only handle routing, layout metadata, and render feature roots. All logic lives in `features/`.
- **Custom Hooks for State & Side Effects**: Isolate complex UI logic or data synchronization inside dedicated hooks (`useCandidateReview.ts`, `useGenerationHistory.ts`).

### 3.3 Styling & UI Consistency
- **Tailwind Utility Discipline**: Use Tailwind CSS variables defined in the design system (`globals.css`). Do not introduce arbitrary inline styles or hex codes (`style={{ color: '#1A2B3C' }}`).
- **Component Classes**: Use `cn()` helper (`clsx` + `tailwind-merge`) for conditional class merging.

---

## 4. Error Handling & Guardrails
- **No Swallowed Exceptions**: Never use bare `except:` or empty `catch (err) {}` blocks. Every error must be logged with context and either recovered gracefully or surfaced to the caller.
- **Standardized API Error Envelopes**: All error responses from the backend adhere to:
  ```json
  {
    "error": {
      "code": "CANDIDATE_NOT_FOUND",
      "message": "Candidate with ID cnd_123 was not found in this organization.",
      "details": {}
    }
  }
  ```
