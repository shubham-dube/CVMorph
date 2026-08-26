-- Postgres initialization script
-- Runs once when the container is first created.
-- Epic 1.4: Row-Level Security (RLS) policies are added here or in Alembic migrations.

-- Enable the pgcrypto extension (used for UUID generation in some edge cases)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- RLS helper function: returns the current org_id from the session variable
-- set by the FastAPI application layer before executing any query.
-- Usage in RLS policy: org_id = current_setting('app.current_org_id')::uuid
-- Set at query time: SET LOCAL app.current_org_id = '<uuid>';
-- NOTE: The API layer ALWAYS filters by org_id in queries. RLS is defence-in-depth.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_org_id', true)::UUID;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies are added per-table in Alembic migrations (see Epic 1.4).
-- Pattern for each table:
--   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON <table>
--     USING (org_id = current_org_id());
