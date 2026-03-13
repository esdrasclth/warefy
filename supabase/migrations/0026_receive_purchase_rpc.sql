CREATE OR REPLACE FUNCTION public.receive_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  -- Verificar que la compra existe y está PENDIENTE
  IF NOT EXISTS (
    SELECT 1 FROM public.purchases
    WHERE id = p_purchase_id AND status = 'PENDIENTE'
  ) THEN
    RAISE EXCEPTION 'La compra no existe o no está en estado PENDIENTE';
  END IF;

  -- Actualizar el stock de cada ítem usando received_quantity si existe,
  -- de lo contrario usar quantity
  FOR item IN
    SELECT
      inventory_item_id,
      COALESCE(received_quantity, quantity) AS qty_to_add
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id
  LOOP
    UPDATE public.inventory_items
    SET quantity = quantity + item.qty_to_add
    WHERE id = item.inventory_item_id;
  END LOOP;

  -- Marcar la compra como RECIBIDA
  UPDATE public.purchases
  SET status = 'RECIBIDA'
  WHERE id = p_purchase_id;
END;
$$;
