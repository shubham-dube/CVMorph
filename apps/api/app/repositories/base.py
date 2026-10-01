"""
Base Repository providing standard tenant-isolated, soft-delete aware database queries.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Base


class BaseRepository[ModelT: Base]:
    """Generic async repository enforcing tenant isolation and soft-delete filtering."""

    def __init__(self, model_cls: type[ModelT], session: AsyncSession) -> None:
        self.model_cls = model_cls
        self.session = session

    async def get_by_id(self, entity_id: str, org_id: str) -> ModelT | None:
        """Fetch a single entity by ID within the caller's organization."""
        query = select(self.model_cls).where(
            self.model_cls.id == entity_id,  # type: ignore[attr-defined]
            self.model_cls.org_id == org_id,  # type: ignore[attr-defined]
        )
        if hasattr(self.model_cls, "is_deleted"):
            query = query.where(self.model_cls.is_deleted.is_(False))  # type: ignore[attr-defined]

        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        org_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[ModelT]:
        """List entities for an organization, ordered by created_at descending."""
        query = select(self.model_cls).where(
            self.model_cls.org_id == org_id,  # type: ignore[attr-defined]
        )
        if hasattr(self.model_cls, "is_deleted"):
            query = query.where(self.model_cls.is_deleted.is_(False))  # type: ignore[attr-defined]

        if hasattr(self.model_cls, "created_at"):
            query = query.order_by(self.model_cls.created_at.desc())  # type: ignore[attr-defined]

        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def count(self, org_id: str) -> int:
        """Count active entities for an organization."""
        query = select(func.count(self.model_cls.id)).where(  # type: ignore[attr-defined]
            self.model_cls.org_id == org_id,  # type: ignore[attr-defined]
        )
        if hasattr(self.model_cls, "is_deleted"):
            query = query.where(self.model_cls.is_deleted.is_(False))  # type: ignore[attr-defined]

        result = await self.session.execute(query)
        return result.scalar_one() or 0

    async def soft_delete(self, entity_id: str, org_id: str) -> bool:
        """Soft delete an entity if it supports is_deleted; returns True if updated."""
        entity = await self.get_by_id(entity_id, org_id)
        if not entity:
            return False

        if hasattr(entity, "is_deleted"):
            entity.is_deleted = True  # type: ignore[attr-defined]
            if hasattr(entity, "deleted_at"):
                entity.deleted_at = datetime.now(UTC)  # type: ignore[attr-defined]
            await self.session.flush()
            return True
        return False
