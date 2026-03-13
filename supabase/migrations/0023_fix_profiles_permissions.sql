-- 0023_fix_profiles_permissions.sql
-- Description: Grant explicit permissions to profiles table to fix "permission denied" errors.

-- 1. Explicitly grant permissions to anon and authenticated roles
GRANT ALL ON TABLE public.profiles TO anon, authenticated;

-- 2. Ensure RLS is enabled but permissive (matching the existing style)
-- This was already in 0022 but we re-verify and fix the grant.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Profiles" ON public.profiles;
CREATE POLICY "Public Access Profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- 3. Force schema reload
NOTIFY pgrst, 'reload schema';
