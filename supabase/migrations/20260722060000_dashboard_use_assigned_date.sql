-- Los gráficos del dashboard deben imputar el gasto de una asignación de herramienta
-- al mes de su FECHA DE ASIGNACIÓN (assigned_date), no a la fecha en que se creó el
-- registro (created_at). Redefine las dos RPCs de series de 12 meses cambiando
-- únicamente la rama de tool_assignments para usar assigned_date.

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
      date_trunc('month', ta.assigned_date::timestamptz) AS month_start,
      SUM(COALESCE(ta.unit_cost, 0)) AS consumo
    FROM tool_assignments ta
    WHERE ta.assignment_type <> 'CAMBIO_ASIGNACION'
      AND ta.assigned_date::timestamptz >= p_twelve_months_ago
      AND ta.assigned_date::timestamptz < p_month_end
    GROUP BY date_trunc('month', ta.assigned_date::timestamptz)
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
      date_trunc('month', ta.assigned_date::timestamptz) AS month_start,
      SUM(COALESCE(ta.unit_cost, 0)) AS consumido
    FROM tool_assignments ta
    WHERE ta.assignment_type <> 'CAMBIO_ASIGNACION'
      AND ta.assigned_date::timestamptz >= p_twelve_months_ago
      AND ta.assigned_date::timestamptz < p_month_end
    GROUP BY COALESCE(ta.area_name, 'Sin Área'), date_trunc('month', ta.assigned_date::timestamptz)
  ) combined
  GROUP BY area_name, month_start;
$function$;

NOTIFY pgrst, 'reload schema';
