"""
Object storage abstraction — local / S3 / Cloudflare R2.

All file I/O goes through this interface.
Set STORAGE_BACKEND in .env to switch backends:
  local — local filesystem (development)
  s3    — AWS S3
  r2    — Cloudflare R2 (S3-compatible, zero egress fees)
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


class ObjectStore(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Store bytes at key. Returns the storage key."""
        ...

    @abstractmethod
    async def get(self, key: str) -> bytes:
        """Retrieve bytes by key."""
        ...

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete object by key."""
        ...

    @abstractmethod
    async def signed_url(self, key: str, expires_in: int = 3600) -> str:
        """Return a time-limited URL for downloading the object."""
        ...


# ── Local filesystem ──────────────────────────────────────────────────────────


class LocalObjectStore(ObjectStore):
    """
    Local filesystem store for development.
    Signed URLs are file:// paths (not real signed URLs).
    """

    def __init__(self) -> None:
        self._root = Path(settings.LOCAL_STORAGE_PATH)
        self._root.mkdir(parents=True, exist_ok=True)

    async def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        dest = self._root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return key

    async def get(self, key: str) -> bytes:
        path = self._root / key
        if not path.exists():
            raise FileNotFoundError(f"Object not found: {key}")
        return path.read_bytes()

    async def delete(self, key: str) -> None:
        path = self._root / key
        if path.exists():
            path.unlink()

    async def signed_url(self, key: str, expires_in: int = 3600) -> str:
        return f"file://{(self._root / key).resolve()}"


# ── AWS S3 ────────────────────────────────────────────────────────────────────


class S3ObjectStore(ObjectStore):
    """AWS S3 backend using boto3."""

    def __init__(self) -> None:
        import boto3
        self._client = boto3.client(
            "s3",
            region_name=settings.AWS_S3_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        self._bucket = settings.AWS_S3_BUCKET

    async def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    async def get(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    async def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    async def signed_url(self, key: str, expires_in: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )


# ── Cloudflare R2 ─────────────────────────────────────────────────────────────


class R2ObjectStore(ObjectStore):
    """
    Cloudflare R2 backend.

    R2 is S3-compatible, so we use boto3 with a custom endpoint URL:
      https://{account_id}.r2.cloudflarestorage.com

    Advantages over S3:
    - Zero egress fees (free outbound bandwidth)
    - S3-compatible API — drop-in replacement
    - Signed URLs supported via the S3 presigned URL API
    """

    def __init__(self) -> None:
        import boto3
        if not settings.R2_ACCOUNT_ID:
            raise RuntimeError(
                "R2_ACCOUNT_ID is required when STORAGE_BACKEND=r2. "
                "Set it in .env or switch to STORAGE_BACKEND=local."
            )
        endpoint = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",  # R2 uses "auto" as region
        )
        self._bucket = settings.R2_BUCKET
        self._public_url = settings.R2_PUBLIC_URL.rstrip("/") if settings.R2_PUBLIC_URL else None

    async def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    async def get(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    async def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    async def signed_url(self, key: str, expires_in: int = 3600) -> str:
        # If a public URL is configured (R2 bucket with public access), use that
        if self._public_url:
            return f"{self._public_url}/{key}"

        # Otherwise generate a presigned URL (works for private buckets)
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )


# ── Factory ───────────────────────────────────────────────────────────────────


def get_object_store() -> ObjectStore:
    backend = settings.STORAGE_BACKEND
    if backend == "local":
        return LocalObjectStore()
    elif backend == "s3":
        return S3ObjectStore()
    elif backend == "r2":
        return R2ObjectStore()
    raise ValueError(f"Unknown storage backend: {backend!r}")
