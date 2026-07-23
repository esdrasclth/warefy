-- "Sus propias requisas" se identifica por el codigo de empleado del solicitante
-- (requester_code), no por user_id: las requisas pueden crearse por otro usuario
-- (admin/almacen) en nombre del solicitante, dejando user_id = creador.

CREATE OR REPLACE FUNCTION public.get_my_employee_code()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT e.code
  FROM public.profiles p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid();
$function$;

DROP POLICY IF EXISTS requisitions_select ON public.requisitions;

CREATE POLICY requisitions_select ON public.requisitions
  FOR SELECT USING (
    ((status <> 'PENDIENTE DE APROBACION') OR (get_my_role() <> 'ALMACEN'))
    AND (
      (get_my_role() = ANY (ARRAY['ADMIN'::text, 'ALMACEN'::text]))
      OR (get_my_role() = 'APROBADOR'::text AND area_id = ANY (get_my_area_ids()))
      OR (requester_code = get_my_employee_code())
    )
  );

NOTIFY pgrst, 'reload schema';
