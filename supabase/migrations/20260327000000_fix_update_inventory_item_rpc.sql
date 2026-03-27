DROP FUNCTION IF EXISTS public.update_inventory_item(uuid, jsonb);

CREATE FUNCTION public.update_inventory_item(
  p_id      uuid,
  p_updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

  IF v_role NOT IN ('ADMIN', 'ALMACEN') THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol ADMIN o ALMACEN';
  END IF;

  UPDATE inventory_items
  SET
    code        = COALESCE((p_updates->>'code'),               code),
    name        = COALESCE((p_updates->>'name'),               name),
    description = COALESCE((p_updates->>'description'),        description),
    category_id = COALESCE((p_updates->>'category_id')::uuid,  category_id),
    unit_id     = COALESCE((p_updates->>'unit_id')::uuid,      unit_id),
    quantity    = COALESCE((p_updates->>'quantity')::int,      quantity),
    min_stock   = COALESCE((p_updates->>'min_stock')::numeric, min_stock),
    max_stock   = COALESCE((p_updates->>'max_stock')::numeric, max_stock),
    price       = COALESCE((p_updates->>'price')::numeric,     price),
    status      = COALESCE((p_updates->>'status'),             status),
    updated_at  = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artículo no encontrado: %', p_id;
  END IF;
END;
$$;
