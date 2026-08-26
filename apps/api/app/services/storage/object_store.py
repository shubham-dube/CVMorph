"""
Object storage abstraction — S3 / GCS / local filesystem.

All file I/O goes through this interface. Swap STORAGE_BACKEND in .env to change backends.

Epic 0 / 2 — local backend is fully implemented; S3 backend is a stub for Epic 2.
"""

from __future__ import annotations

import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


class ObjectStore(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Store bytes at key. Returns the storage key/URL."""
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


class LocalObjectStore(ObjectStore):
    """
    Local filesystem store for development.
    Files are stored under settings.LOCAL_STORAGE_PATH.
    Signed URLs are just file:// paths in dev (not real signed URLs).
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
        # In dev, return a local path — not a real signed URL
        return f"file://{(self._root / key).resolve()}"


class S3ObjectStore(ObjectStore):
    """AWS S3 backend — Epic 2 / Epic 9 implementation."""

    async def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        raise NotImplementedError("S3 backend not yet implemented (Epic 2).")

    async def get(self, key: str) -> bytes:
        raise NotImplementedError("S3 backend not yet implemented (Epic 2).")

    async def delete(self, key: str) -> None:
        raise NotImplementedError("S3 backend not yet implemented (Epic 2).")

    async def signed_url(self, key: str, expires_in: int = 3600) -> str:
        raise NotImplementedError("S3 backend not yet implemented (Epic 2).")


def get_object_store() -> ObjectStore:
    backend = settings.STORAGE_BACKEND
    if backend == "local":
        return LocalObjectStore()
    elif backend == "s3":
        return S3ObjectStore()
    raise ValueError(f"Unknown storage backend: {backend!r}")
