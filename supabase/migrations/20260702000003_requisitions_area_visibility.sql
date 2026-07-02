-- Permite que un empleado vea las requisas de su área principal y de las áreas
-- que supervisa (employee_areas). Sin esto, un USER solo veía sus propias requisas
-- por RLS, así que un gerente no podía visualizar las de otros en sus áreas.

CREATE OR REPLACE FUNCTION public.get_my_area_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT aid), '{}')
  FROM (
    SELECT e.area_id AS aid
    FROM public.profiles p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid() AND e.area_id IS NOT NULL
    UNION
    SELECT ea.area_id
    FROM public.profiles p
    JOIN public.employees e ON e.id = p.employee_id
    JOIN public.employee_areas ea ON ea.employee_id = e.id
    WHERE p.id = auth.uid()
  ) s;
$function$;

DROP POLICY IF EXISTS requisitions_select ON public.requisitions;

CREATE POLICY requisitions_select ON public.requisitions
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (get_my_role() = ANY (ARRAY['ADMIN'::text, 'ALMACEN'::text]))
    OR (area_id = ANY (public.get_my_area_ids()))
  );

NOTIFY pgrst, 'reload schema';
