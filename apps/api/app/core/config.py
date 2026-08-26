"""
Application settings — loaded from environment variables via pydantic-settings.

All secrets live in .env (gitignored). Copy .env.example → .env to get started.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────────────────
    APP_NAME: str = "CV Transformation Platform"
    APP_ENV: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = Field(..., min_length=32)
    DEBUG: bool = False

    # ── CORS ───────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Database ───────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        "postgresql+asyncpg://cvplatform:cvplatform@localhost:5432/cvplatform"
    )
    DATABASE_URL_SYNC: str = Field(
        "postgresql+psycopg2://cvplatform:cvplatform@localhost:5432/cvplatform"
    )

    # ── Redis / Celery ─────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # ── AI Provider ────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    AI_DEFAULT_MODEL: str = "claude-sonnet-4-5"
    AI_EXTRACTION_VERSION: str = "v1"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ── Storage ────────────────────────────────────────────────────────────
    STORAGE_BACKEND: Literal["local", "s3", "gcs"] = "local"
    LOCAL_STORAGE_PATH: str = "./uploads"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = "cv-platform-dev"
    AWS_S3_REGION: str = "us-east-1"

    # ── Auth (JWT) ─────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ── Seed data ──────────────────────────────────────────────────────────
    SEED_ORG_NAME: str = "Copious"
    SEED_ADMIN_EMAIL: str = "admin@copious.com"
    SEED_ADMIN_PASSWORD: str = "CHANGE_ME_on_first_login"

    # ── Branding (PRD naming note — never hardcode product name in UI) ─────
    BRAND_NAME: str = "CV Platform"
    BRAND_TAGLINE: str = "AI-powered CV transformation"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (call this everywhere instead of Settings())."""
    return Settings()


#: Module-level shortcut — `from app.core.config import settings`
settings: Settings = get_settings()

# Convenience: expose branding dict so it can be imported by templates etc.
BRAND = {
    "name": settings.BRAND_NAME,
    "tagline": settings.BRAND_TAGLINE,
}
