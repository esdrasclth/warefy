-- Habilita paginación del lado del servidor en Productos y Asignaciones.
--
-- Hasta ahora ambas pantallas bajaban la tabla completa al navegador para
-- filtrar, contar y agregar en JS. Eso obliga a traer todas las filas y choca
-- con el límite de 1000 de PostgREST. Esta migración mueve a Postgres las tres
-- cosas que el cliente no puede resolver:
--
--   1. La comparación "bajo mínimo", que es columna-contra-columna y por eso
--      PostgREST no puede expresarla como filtro.
--   2. Los agregados de OC pendiente y consumo promedio, que hoy se calculan
--      descargando purchase_items y requisition_items enteros.
--   3. El conteo de empleados distintos con herramienta, que es un
--      COUNT(DISTINCT) y PostgREST tampoco sabe hacer.
--
-- Las vistas usan security_invoker para que las políticas RLS de las tablas
-- base sigan aplicando con el rol de quien consulta, no con el del dueño.

-- ---------------------------------------------------------------------------
-- 1. Columna generada: "bajo mínimo"
-- ---------------------------------------------------------------------------
-- Replica exactamente la fórmula que estaba en el cliente:
--   (quantity || 0) - (committed_quantity || 0) <= (min_stock || 0)
-- Los COALESCE son necesarios: las tres columnas son nullable, y sin ellos la
-- expresión daría NULL y el filtro `is_below_min = true` omitiría esas filas.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_below_min boolean
  GENERATED ALWAYS AS (
    (COALESCE(quantity, 0) - COALESCE(committed_quantity, 0)) <= COALESCE(min_stock, 0)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_inventory_items_below_min
  ON public.inventory_items (is_below_min)
  WHERE is_below_min;

-- Índices de apoyo para los agregados de la vista enriquecida.
CREATE INDEX IF NOT EXISTS idx_purchase_items_item
  ON public.purchase_items (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_requisition_items_item
  ON public.requisition_items (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_requisitions_status_created
  ON public.requisitions (status, created_at);

-- ---------------------------------------------------------------------------
-- 2. Vista enriquecida de inventario
-- ---------------------------------------------------------------------------
-- Expone i.* tal cual (incluidas category_id, unit_id y package_unit_id) para
-- que PostgREST siga resolviendo los embeds categories(...) y units(...) sobre
-- la vista: los detecta rastreando cada columna hasta su tabla base.
DROP VIEW IF EXISTS public.inventory_items_enriched;

CREATE VIEW public.inventory_items_enriched
WITH (security_invoker = on) AS
SELECT
  i.*,

  -- Campo de búsqueda unificado: permite filtrar por código, nombre y
  -- categoría con un solo ilike, en vez de un .or() entre la tabla base y una
  -- tabla embebida (que PostgREST no combina de forma fiable).
  lower(i.code || ' ' || i.name || ' ' || COALESCE(c.name, '')) AS search_text,

  COALESCE(oc.pending_oc, 0) AS pending_oc,
  COALESCE(cons.avg_consumption, 0) AS avg_consumption

FROM public.inventory_items i
LEFT JOIN public.categories c ON c.id = i.category_id

-- Unidades en órdenes de compra todavía pendientes de recibir.
LEFT JOIN LATERAL (
  SELECT SUM(pi.quantity) AS pending_oc
    FROM public.purchase_items pi
    JOIN public.purchases p ON p.id = pi.purchase_id
   WHERE pi.inventory_item_id = i.id
     AND p.status = 'PENDIENTE'
) oc ON true

-- Consumo promedio mensual de los últimos 6 meses. El divisor es la cantidad
-- de meses en los que el artículo tuvo movimiento (no 6 fijo), que es como lo
-- calculaba el cliente. El mes se deriva en UTC para coincidir con el
-- `created_at.substring(0, 7)` sobre el ISO string que hacía el JS.
LEFT JOIN LATERAL (
  SELECT SUM(m.qty)::numeric / NULLIF(COUNT(DISTINCT m.month_key), 0) AS avg_consumption
    FROM (
      SELECT COALESCE(ri.delivered_quantity, ri.quantity, 0) AS qty,
             to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key
        FROM public.requisition_items ri
        JOIN public.requisitions r ON r.id = ri.requisition_id
       WHERE ri.inventory_item_id = i.id
         AND r.status = 'ENTREGADA'
         AND r.created_at >= now() - interval '6 months'
    ) m
) cons ON true;

GRANT SELECT ON public.inventory_items_enriched TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Vista enriquecida de asignaciones
-- ---------------------------------------------------------------------------
-- Mismo motivo: la búsqueda cruza tool_assignments, inventory_items y
-- employees, y sin un campo unificado habría que traer todo al cliente.
DROP VIEW IF EXISTS public.tool_assignments_enriched;

CREATE VIEW public.tool_assignments_enriched
WITH (security_invoker = on) AS
SELECT
  ta.*,
  lower(
    COALESCE(ii.name, '')        || ' ' ||
    COALESCE(ii.code, '')        || ' ' ||
    COALESCE(ta.serial_number, '') || ' ' ||
    COALESCE(e.first_name, '')   || ' ' ||
    COALESCE(e.last_name, '')    || ' ' ||
    COALESCE(e.code, '')
  ) AS search_text
FROM public.tool_assignments ta
LEFT JOIN public.inventory_items ii ON ii.id = ta.inventory_item_id
LEFT JOIN public.employees e ON e.id = ta.employee_id;

GRANT SELECT ON public.tool_assignments_enriched TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Contadores de asignaciones
-- ---------------------------------------------------------------------------
-- "Empleados Responsables" es un COUNT(DISTINCT), imposible desde PostgREST.
-- Devolver los cuatro en una sola llamada evita cuatro round-trips.
-- SECURITY INVOKER a proposito: los contadores deben ver exactamente las mismas
-- filas que ve el usuario, que es lo que hacia el calculo en JS sobre datos ya
-- filtrados por RLS. Con DEFINER ademas quedaria una funcion privilegiada
-- expuesta en /rest/v1/rpc sin necesidad. search_path fijo por higiene.
CREATE OR REPLACE FUNCTION public.get_tool_assignment_stats()
RETURNS TABLE(active bigint, holders bigint, damaged bigint, lost bigint)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE status = 'ACTIVA'),
    COUNT(DISTINCT employee_id) FILTER (WHERE status = 'ACTIVA'),
    COUNT(*) FILTER (WHERE status = 'DANADA'),
    COUNT(*) FILTER (WHERE status = 'EXTRAVIADA')
  FROM public.tool_assignments;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tool_assignment_stats() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Áreas con asignaciones activas
-- ---------------------------------------------------------------------------
-- Alimenta el selector del reporte de inventario. Es un SELECT DISTINCT, que
-- PostgREST no expresa, y el criterio debe coincidir con el de la página del
-- reporte: el área sale del empleado, no de tool_assignments.area_name.
CREATE OR REPLACE FUNCTION public.get_active_assignment_areas()
RETURNS TABLE(area_name text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT DISTINCT COALESCE(ar.name, 'Sin Área')
    FROM public.tool_assignments ta
    LEFT JOIN public.employees e ON e.id = ta.employee_id
    LEFT JOIN public.areas ar ON ar.id = e.area_id
   WHERE ta.status = 'ACTIVA'
   ORDER BY 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_assignment_areas() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
