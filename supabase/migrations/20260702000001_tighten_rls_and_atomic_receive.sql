-- Cierra dos políticas RLS permisivas y hace la recepción de compra totalmente atómica.

-- 1) tool_assignments: reemplaza la política abierta USING(true)/WITH CHECK(true)
--    por lectura para autenticados y escritura solo para ADMIN/ALMACEN.
DROP POLICY IF EXISTS "Allow all access to tool_assignments" ON public.tool_assignments;

CREATE POLICY tool_assignments_select_authenticated ON public.tool_assignments
  FOR SELECT USING (true);

CREATE POLICY tool_assignments_write_almacen_admin ON public.tool_assignments
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['ADMIN'::text, 'ALMACEN'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['ADMIN'::text, 'ALMACEN'::text]));

-- 2) stock_movements: el INSERT directo estaba abierto (WITH CHECK true).
--    Los movimientos reales los generan triggers SECURITY DEFINER (bypass RLS),
--    así que restringir el INSERT del cliente a ADMIN/ALMACEN no rompe el flujo.
DROP POLICY IF EXISTS "Autenticados pueden insertar stock_movements" ON public.stock_movements;

CREATE POLICY stock_movements_insert_almacen_admin ON public.stock_movements
  FOR INSERT
  WITH CHECK (get_my_role() = ANY (ARRAY['ADMIN'::text, 'ALMACEN'::text]));

-- 3) receive_purchase: además de sumar stock y marcar RECIBIDA, calcula y
--    persiste total_cost dentro de la misma transacción (evita el read-then-write
--    no atómico del detalle de compra).
CREATE OR REPLACE FUNCTION public.receive_purchase(p_purchase_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
  v_total numeric := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.purchases
    WHERE id = p_purchase_id AND status = 'PENDIENTE'
  ) THEN
    RAISE EXCEPTION 'La compra no existe o no está en estado PENDIENTE';
  END IF;

  FOR item IN
    SELECT
      inventory_item_id,
      COALESCE(received_quantity, quantity) AS qty_to_add,
      unit_cost
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id
  LOOP
    UPDATE public.inventory_items
    SET quantity = quantity + item.qty_to_add
    WHERE id = item.inventory_item_id;

    v_total := v_total + (item.qty_to_add * COALESCE(item.unit_cost, 0));
  END LOOP;

  UPDATE public.purchases
  SET status = 'RECIBIDA',
      total_cost = v_total
  WHERE id = p_purchase_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
