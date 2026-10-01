# My Copious · Module Templates & Developer Guide

This guide describes how to create new modules across the My Copious monorepo, maintaining architectural consistency.

---

## 1. Backend Module Architecture

Every backend domain follows a strict 4-layer structure:
```
apps/api/app/
├── api/v1/routers/<module>.py     # 1. Transport Layer (HTTP / FastApi)
├── schemas/<module>.py            # 2. Contract Layer (Pydantic DTOs)
├── services/<module>.py           # 3. Service Layer (Business Logic & Transactions)
├── repositories/<module>.py       # 4. Repository Layer (SQLAlchemy Data Access)
└── models/<module>.py             # Database Entity (DeclarativeBase)
```

### Step 1: Define Model & Schema
```python
# app/models/client.py
from app.db.base import Base
from sqlalchemy import Column, String, UUID, Boolean, DateTime, func
import uuid

class Client(Base):
    __tablename__ = "clients"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

```python
# app/schemas/client.py
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class ClientBase(BaseModel):
    name: str

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: UUID
    org_id: UUID
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
```

### Step 2: Implement Repository
```python
# app/repositories/client.py
from typing import Sequence, Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.client import Client

class ClientRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_org(self, org_id: UUID) -> Sequence[Client]:
        stmt = (
            select(Client)
            .where(Client.org_id == org_id, Client.is_deleted.is_(False))
            .order_by(Client.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_id(self, client_id: UUID, org_id: UUID) -> Optional[Client]:
        stmt = select(Client).where(
            Client.id == client_id,
            Client.org_id == org_id,
            Client.is_deleted.is_(False)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
```

### Step 3: Implement Service
```python
# app/services/client.py
from uuid import UUID
from typing import Sequence
from app.repositories.client import ClientRepository
from app.models.client import Client
from app.schemas.client import ClientCreate
from fastapi import HTTPException, status

class ClientService:
    def __init__(self, repo: ClientRepository) -> None:
        self.repo = repo

    async def list_clients(self, org_id: UUID) -> Sequence[Client]:
        return await self.repo.list_by_org(org_id)

    async def create_client(self, data: ClientCreate, org_id: UUID) -> Client:
        client = Client(name=data.name, org_id=org_id)
        self.repo.session.add(client)
        await self.repo.session.commit()
        await self.repo.session.refresh(client)
        return client
```

### Step 4: Implement Route Handler
```python
# app/api/v1/routers/clients.py
from fastapi import APIRouter, Depends, status
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user, CurrentUser
from app.schemas.client import ClientResponse, ClientCreate
from app.repositories.client import ClientRepository
from app.services.client import ClientService

router = APIRouter(prefix="/clients", tags=["Clients"])

def get_client_service(db: AsyncSession = Depends(get_db)) -> ClientService:
    return ClientService(ClientRepository(db))

@router.get("/", response_model=List[ClientResponse])
async def list_clients(
    service: ClientService = Depends(get_client_service),
    current_user: CurrentUser = Depends(get_current_user),
):
    return await service.list_clients(current_user.org_id)
```

---

## 2. Frontend Feature Module Architecture

All UI domains are encapsulated under `apps/web/features/<feature>/`:
```
apps/web/features/clients/
├── components/
│   ├── ClientList.tsx             # Domain UI component
│   ├── ClientCard.tsx
│   └── ClientCreateModal.tsx
├── hooks/
│   └── useClients.ts              # Data fetching, mutations, local state
├── api/
│   └── clientService.ts           # Axios / fetch client calls
├── types/
│   └── index.ts                   # Feature-specific types
└── schemas/
    └── clientFormSchema.ts        # Zod validation schema for client forms
```

### Hook Pattern
```typescript
// features/clients/hooks/useClients.ts
import { useState, useEffect } from 'react';
import { clientService } from '../api/clientService';
import type { Client } from '../types';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    clientService.list()
      .then((data) => { if (isMounted) setClients(data); })
      .catch((err) => { if (isMounted) setError(err.message); })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, []);

  return { clients, isLoading, error };
}
```

### Thin Page Wrapper
```typescript
// app/(dashboard)/clients/page.tsx
import { ClientList } from '@/features/clients/components/ClientList';

export const metadata = {
  title: 'Clients | My Copious',
};

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-white">Clients</h1>
      <ClientList />
    </div>
  );
}
```
