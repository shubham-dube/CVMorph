# My Copious · Database Conventions & Standards

## 1. Primary Keys & Identifiers
- **UUIDs everywhere**: All primary keys must use UUID v4. Never use autoincrementing integers (`BIGSERIAL`) for user-facing or multi-tenant entities.
- **SQLAlchemy Declaration**:
  ```python
  id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  ```
- **Foreign Keys**: Always define explicit `ForeignKey` constraints with indexed columns and appropriate `ondelete` actions (`CASCADE`, `SET NULL`, or `RESTRICT`).

---

## 2. Multi-Tenancy & Data Isolation
- **Organization Column**: Every domain table (candidates, profiles, generations, audit logs, custom templates) MUST include an `org_id` column:
  ```python
  org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
  ```
- **Exception**: System-level global templates provided out-of-the-box by Copious may set `org_id = None` (nullable) to indicate global availability.

---

## 3. Auditing & Timestamps
- **Automatic Timestamps**: Every table must include standard timestamp tracking:
  ```python
  created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
  updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
  ```
- Always use timezone-aware timestamps (`DateTime(timezone=True)`).

---

## 4. Soft Delete Pattern
To prevent accidental data loss and support candidate audit trails, domain records are soft-deleted rather than hard-deleted.
- **Columns**:
  ```python
  is_deleted = Column(Boolean, default=False, nullable=False, index=True)
  deleted_at = Column(DateTime(timezone=True), nullable=True)
  ```
- **Repository Enforcement**: All `select()` statements in repositories must include `where(Model.is_deleted.is_(False))` by default, unless explicitly querying historical or soft-deleted records.

---

## 5. Structured Data & JSONB
- **PostgreSQL JSONB**: All semi-structured JSON columns (e.g. `profile_json` in `candidate_profiles`, `parameters_used` in `cv_generations`, `metadata` in `audit_logs`) MUST use PostgreSQL `JSONB` (`from sqlalchemy.dialects.postgresql import JSONB`), NOT generic `JSON`.
- **Reasoning**: `JSONB` stores data in decomposed binary format, enabling indexed lookups (`GIN` indexes) and significantly faster parsing than plain text `JSON`.

---

## 6. Indexing Strategy
- **Foreign Keys**: Always create an index on every foreign key column (`org_id`, `candidate_id`, `created_by_user_id`).
- **Composite Indexes**: When querying entities by organization and status/date, use composite indexes:
  ```python
  Index("ix_candidates_org_created", "org_id", "created_at")
  Index("ix_generations_candidate_created", "candidate_id", "created_at")
  ```

---

## 7. Migration Conventions (Alembic)
1. **Never edit existing, deployed migrations**: Once an Alembic migration is committed and merged into a shared branch, never edit it. Always write a forward migration.
2. **Deterministic naming**: Migration files must use sequential numbering and descriptive names:
   - `001_initial_schema.py`
   - `006_production_foundation_integrity.py`
3. **Reversible**: Every migration must have both a working `upgrade()` and `downgrade()` function.
4. **Execution in CI**: Migrations are applied via `alembic upgrade head`. Test suites run against a cleanly migrated database.
