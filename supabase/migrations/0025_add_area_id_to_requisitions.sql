-- 0025_add_area_id_to_requisitions.sql
-- Description: Add area_id column to requisitions table and patch existing data.

-- 1. Add the column
ALTER TABLE public.requisitions 
ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL;

-- 2. Patch existing requisitions based on area_name text match
UPDATE public.requisitions r
SET area_id = a.id
FROM public.areas a
WHERE r.area_name = a.name
AND r.area_id IS NULL;

-- 3. Grant permissions to existing roles
GRANT ALL ON TABLE public.requisitions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.requisition_items TO anon, authenticated, service_role;

-- 4. Force schema reload
NOTIFY pgrst, 'reload schema';
