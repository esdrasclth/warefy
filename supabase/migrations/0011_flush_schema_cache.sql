-- 0011_flush_schema_cache.sql
-- Description: Flushes the PostgREST schema cache. PostgREST does not automatically detect GRANT changes or new views immediately without a reload.
-- This forces Supabase's API layer to refresh its permissions map and expose the PATCH method.

NOTIFY pgrst, 'reload schema';
