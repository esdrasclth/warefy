-- Las asignaciones de herramientas cuentan como gasto del mes y consumen presupuesto del área del empleado.
-- CAMBIO_ASIGNACION no genera gasto (la misma herramienta solo cambia de responsable).

-- 1. Snapshot de costo y área al momento de asignar
ALTER TABLE public.tool_assignments ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.tool_assignments ADD COLUMN IF NOT EXISTS area_name text;

CREATE OR REPLACE FUNCTION public.snapshot_tool_assignment_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.assignment_type = 'CAMBIO_ASIGNACION' THEN
    NEW.unit_cost := 0;
  ELSIF COALESCE(NEW.unit_cost, 0) = 0 THEN
    SELECT COALESCE(price, 0) INTO NEW.unit_cost
    FROM public.inventory_items WHERE id = NEW.inventory_item_id;
  END IF;

  IF NEW.area_name IS NULL THEN
    SELECT COALESCE(e.area_name, a.name) INTO NEW.area_name
    FROM public.employees e
    LEFT JOIN public.areas a ON a.id = e.area_id
    WHERE e.id = NEW.employee_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tool_assignment_snapshot_cost ON public.tool_assignments;
CREATE TRIGGER on_tool_assignment_snapshot_cost
  BEFORE INSERT ON public.tool_assignments
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_tool_assignment_cost();

-- 2. Backfill de asignaciones existentes
UPDATE public.tool_assignments ta
SET unit_cost = CASE WHEN ta.assignment_type = 'CAMBIO_ASIGNACION' THEN 0 ELSE COALESCE(i.price, 0) END
FROM public.inventory_items i
WHERE i.id = ta.inventory_item_id AND ta.unit_cost = 0;

UPDATE public.tool_assignments ta
SET area_name = COALESCE(e.area_name, a.name)
FROM public.employees e
LEFT JOIN public.areas a ON a.id = e.area_id
WHERE e.id = ta.employee_id AND ta.area_name IS NULL;

-- 3. RPCs del dashboard: incluir asignaciones en consumo
CREATE OR REPLACE FUNCTION public.get_dashboard_timeline(p_month_end timestamp with time zone, p_twelve_months_ago timestamp with time zone)
RETURNS TABLE(month_start timestamp with time zone, consumo numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT month_start, SUM(consumo) AS consumo FROM (
    SELECT
      date_trunc('month', r.created_at) AS month_start,
      SUM(COALESCE(ri.delivered_quantity, ri.quantity) * COALESCE(ri.unit_cost, 0)) AS consumo
    FROM requisition_items ri
    JOIN requisitions r ON r.id = ri.requisition_id
    WHERE r.status = 'ENTREGADA'
      AND r.created_at >= p_twelve_months_ago
      AND r.created_at < p_month_end
    GROUP BY date_trunc('month', r.created_at)
    UNION ALL
    SELECT
      date_trunc('month', ta.created_at) AS month_start,
      SUM(COALESCE(ta.unit_cost, 0)) AS consumo
    FROM tool_assignments ta
    WHERE ta.assignment_type <> 'CAMBIO_ASIGNACION'
      AND ta.created_at >= p_twelve_months_ago
      AND ta.created_at < p_month_end
    GROUP BY date_trunc('month', ta.created_at)
  ) combined
  GROUP BY month_start
  ORDER BY month_start;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_areas_12m(p_month_end timestamp with time zone, p_twelve_months_ago timestamp with time zone)
RETURNS TABLE(area_name text, month_start timestamp with time zone, consumido numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT area_name, month_start, SUM(consumido) AS consumido FROM (
    SELECT
      COALESCE(r.area_name, 'Sin Área') AS area_name,
      date_trunc('month', r.created_at) AS month_start,
      SUM(COALESCE(ri.delivered_quantity, ri.quantity) * COALESCE(ri.unit_cost, 0)) AS consumido
    FROM requisition_items ri
    JOIN requisitions r ON r.id = ri.requisition_id
    WHERE r.status = 'ENTREGADA'
      AND r.created_at >= p_twelve_months_ago
      AND r.created_at < p_month_end
    GROUP BY COALESCE(r.area_name, 'Sin Área'), date_trunc('month', r.created_at)
    UNION ALL
    SELECT
      COALESCE(ta.area_name, 'Sin Área') AS area_name,
      date_trunc('month', ta.created_at) AS month_start,
      SUM(COALESCE(ta.unit_cost, 0)) AS consumido
    FROM tool_assignments ta
    WHERE ta.assignment_type <> 'CAMBIO_ASIGNACION'
      AND ta.created_at >= p_twelve_months_ago
      AND ta.created_at < p_month_end
    GROUP BY COALESCE(ta.area_name, 'Sin Área'), date_trunc('month', ta.created_at)
  ) combined
  GROUP BY area_name, month_start;
$function$;

NOTIFY pgrst, 'reload schema';
