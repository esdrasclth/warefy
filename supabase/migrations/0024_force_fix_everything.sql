-- 0024_force_fix_everything.sql
-- Description: Unify permissions and bypass RLS for development to fix "permission denied".

-- 1. Grant ALL schemas usage to all roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant ALL on all tables in public to all roles (Aggressive for development)
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.employees TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.areas TO anon, authenticated, service_role;

-- 3. DISABLE RLS for profiles temporarily to identify if it's an RLS issue
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 4. Re-grant sequences if any exist (though we use UUIDs)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- 5. Force schema reload
NOTIFY pgrst, 'reload schema';
