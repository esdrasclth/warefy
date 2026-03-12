-- 0014_employees_left_join.sql
-- Force the area_id to be nullable so PostgREST strictly uses a LEFT JOIN when querying `areas(...)`
-- This prevents employees created before the `areas` table from disappearing in the UI.

ALTER TABLE public.employees ALTER COLUMN area_id DROP NOT NULL;

-- 2. Optional: Attempt to auto-map old employees if an area with their text-name already exists
UPDATE public.employees e
SET area_id = a.id
FROM public.areas a
WHERE e.area_name = a.name
  AND e.area_id IS NULL;

NOTIFY pgrst, 'reload schema';
