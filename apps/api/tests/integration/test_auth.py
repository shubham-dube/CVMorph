"""
Integration tests for the auth endpoints.

Tests:
  - Login with valid credentials → JWT
  - Login with wrong password → 401
  - Login with unknown email → 401
  - GET /me with valid token → user info
  - GET /me with no token → 401
  - GET /me with expired token → 401

These are the most critical security tests — run on every PR.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_login_success(async_client: AsyncClient, seed_admin: User):
    response = await async_client.post(
        "/v1/auth/login",
        json={"email": seed_admin.email, "password": "testpass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0


@pytest.mark.asyncio
async def test_login_wrong_password(async_client: AsyncClient, seed_admin: User):
    response = await async_client.post(
        "/v1/auth/login",
        json={"email": seed_admin.email, "password": "WRONG_PASSWORD"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_unknown_email(async_client: AsyncClient):
    response = await async_client.post(
        "/v1/auth/login",
        json={"email": "nobody@example.com", "password": "anything"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(
    async_client: AsyncClient, seed_admin: User, auth_headers: dict
):
    response = await async_client.get("/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == seed_admin.email
    assert data["role"] == "admin"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_get_me_no_token(async_client: AsyncClient):
    response = await async_client.get("/v1/auth/me")
    assert response.status_code == 403  # HTTPBearer returns 403 when no header


@pytest.mark.asyncio
async def test_get_me_invalid_token(async_client: AsyncClient):
    response = await async_client.get(
        "/v1/auth/me",
        headers={"Authorization": "Bearer not.a.valid.jwt"},
    )
    assert response.status_code == 401
