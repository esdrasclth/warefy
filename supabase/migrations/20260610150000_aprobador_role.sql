-- Agrega el rol APROBADOR: usuarios que aprueban requisas antes de llegar a almacén.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('ADMIN', 'ALMACEN', 'USER', 'APROBADOR'));
