-- 0013_empleados_areas.sql
-- Description: Creates the 'areas' table and modifies the 'employees' table to reference it.
-- Provides a clean organizational structure with strict relational integrity.

-- 1. Create the robust Areas table
CREATE TABLE IF NOT EXISTS public.areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Insert absolute default active areas (based on what usually exists or was used so far)
INSERT INTO public.areas (name, description)
VALUES 
    ('Almacen General', 'Área principal de almacenamiento'),
    ('Contabilidad', 'Departamento de finanzas y contabilidad'),
    ('Ventas', 'Departamento comercial y de ventas'),
    ('Administración', 'Gestión general de la empresa')
ON CONFLICT (name) DO NOTHING;

-- 3. Modify Employees Table to include the foreign key
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL;

-- 4. Enable RLS and permissive policies for local development
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Areas" ON public.areas;
CREATE POLICY "Public Access Areas" ON public.areas FOR ALL USING (true) WITH CHECK (true);

-- Explicitly ensure Employees is permissive
DROP POLICY IF EXISTS "Public Access Employees" ON public.employees;
CREATE POLICY "Public Access Employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- Force POSTGREST Scheme reload to ensure UI can immediately query / insert
NOTIFY pgrst, 'reload schema';
