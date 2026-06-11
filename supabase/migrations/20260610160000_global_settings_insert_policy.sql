-- El upsert de /configuracion requiere política de INSERT (RLS la bloqueaba).
DROP POLICY IF EXISTS global_settings_insert_admin ON public.global_settings;
CREATE POLICY global_settings_insert_admin
  ON public.global_settings FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'ADMIN');
