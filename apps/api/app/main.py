"""
CV Transformation Platform — FastAPI application entry point.

Boot sequence:
  1. Load settings from environment (pydantic-settings).
  2. Configure structured logging.
  3. Initialise DB engine pool on startup, dispose on shutdown.
  4. Mount all v1 routers under /v1/.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import engine
from app.api.v1.routers import (
    auth,
    documents,
    candidates,
    generations,
    templates,
    orgs,
    jobs,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle hooks."""
    configure_logging()
    # DB engine is created lazily on first use — nothing to do here unless
    # you want an eager connection check.
    yield
    # Dispose the connection pool cleanly on shutdown.
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "AI-powered CV transformation platform. "
        "Upload CVs, extract structured profiles, review with confidence scores, "
        "and generate formatted documents — all via this API."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    # OpenAPI contact + license metadata (useful for the public API phase)
    contact={"name": "Platform Engineering", "email": "eng@example.com"},
    license_info={"name": "Proprietary"},
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
API_PREFIX = "/v1"

app.include_router(auth.router,        prefix=API_PREFIX)
app.include_router(documents.router,   prefix=API_PREFIX, tags=["documents"])
app.include_router(candidates.router,  prefix=API_PREFIX, tags=["candidates"])
app.include_router(generations.router, prefix=API_PREFIX, tags=["generations"])
app.include_router(templates.router,   prefix=API_PREFIX, tags=["templates"])
app.include_router(orgs.router,        prefix=API_PREFIX, tags=["orgs"])
app.include_router(jobs.router,        prefix=API_PREFIX, tags=["jobs"])


# ── Health + readiness probes ──────────────────────────────────────────────────

@app.get("/health", tags=["health"], summary="Liveness probe")
async def health() -> dict[str, str]:
    """Returns 200 if the process is alive. Used by Docker / load balancer."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/ready", tags=["health"], summary="Readiness probe")
async def ready() -> dict[str, str]:
    """
    Returns 200 when the application is ready to serve traffic.
    Checks DB connectivity — used by Kubernetes readiness probes.
    """
    from sqlalchemy import text
    from app.db.session import get_async_session

    async for db in get_async_session():
        await db.execute(text("SELECT 1"))
        break

    return {"status": "ready"}
