"""
CV Transformation Platform — FastAPI application entry point.

Boot sequence:
  1. Load settings from environment (pydantic-settings).
  2. Configure structured logging + OpenTelemetry.
  3. Mount all v1 routers under /v1/.
  4. Register lifespan hooks (DB pool, Redis, etc.).
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging
from app.api.v1.routers import (
    documents,
    candidates,
    generations,
    templates,
    orgs,
    jobs,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown hooks."""
    configure_logging()
    # TODO (Epic 1): initialise DB engine pool
    # TODO (Epic 9): initialise OpenTelemetry tracer
    yield
    # TODO (Epic 1): dispose DB engine pool


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI-powered CV transformation platform API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
API_PREFIX = "/v1"

app.include_router(documents.router,   prefix=API_PREFIX, tags=["documents"])
app.include_router(candidates.router,  prefix=API_PREFIX, tags=["candidates"])
app.include_router(generations.router, prefix=API_PREFIX, tags=["generations"])
app.include_router(templates.router,   prefix=API_PREFIX, tags=["templates"])
app.include_router(orgs.router,        prefix=API_PREFIX, tags=["orgs"])
app.include_router(jobs.router,        prefix=API_PREFIX, tags=["jobs"])


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness probe — always returns 200 if the process is alive."""
    return {"status": "ok", "version": "0.1.0"}
