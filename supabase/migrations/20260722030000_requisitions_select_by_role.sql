-- Endurece la visibilidad de requisas por rol:
--   USER      -> solo sus propias requisas (user_id = auth.uid())
--   APROBADOR -> todas las requisas de sus areas asignadas/supervisadas
--   ADMIN/ALMACEN -> todas
DROP POLICY IF EXISTS requisitions_select ON public.requisitions;

CREATE POLICY requisitions_select ON public.requisitions
  FOR SELECT USING (
    ((status <> 'PENDIENTE DE APROBACION') OR (get_my_role() <> 'ALMACEN'))
    AND (
      (user_id = auth.uid())
      OR (get_my_role() = ANY (ARRAY['ADMIN'::text, 'ALMACEN'::text]))
      OR (get_my_role() = 'APROBADOR'::text AND area_id = ANY (get_my_area_ids()))
    )
  );

NOTIFY pgrst, 'reload schema';
