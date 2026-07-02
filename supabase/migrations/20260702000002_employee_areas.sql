-- Áreas adicionales que un empleado (típicamente un gerente) supervisa además de su área principal.
-- Permite que un USER visualice y gestione requisas de varias áreas sin cambiar su área de casa.

CREATE TABLE IF NOT EXISTS public.employee_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (employee_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_areas_employee ON public.employee_areas(employee_id);

ALTER TABLE public.employee_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_areas_select_authenticated ON public.employee_areas
  FOR SELECT USING (true);

CREATE POLICY employee_areas_write_admin ON public.employee_areas
  FOR ALL
  USING (get_my_role() = 'ADMIN'::text)
  WITH CHECK (get_my_role() = 'ADMIN'::text);

NOTIFY pgrst, 'reload schema';
