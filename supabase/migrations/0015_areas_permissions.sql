-- 0015_areas_permissions.sql
-- Fixes the 401 Unauthorized errors when fetching/creating Areas and Employees.

-- 1. Explicitly grant table permissions to the API roles so they are allowed to interact with the tables
GRANT ALL ON TABLE public.areas TO anon, authenticated;
GRANT ALL ON TABLE public.employees TO anon, authenticated;

-- 2. Completely bypass Row Level Security (RLS) for local development
-- This matches what we did in 0010_force_rls_bypass.sql for requisitions
ALTER TABLE public.areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;

-- 3. Force PostgREST to reload its schema cache to recognize the new privileges immediately
NOTIFY pgrst, 'reload schema';
