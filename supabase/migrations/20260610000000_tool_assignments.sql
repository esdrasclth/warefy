-- ============================================================
-- Módulo de Asignación de Herramientas
-- 1. Flag is_assignable en inventory_items
-- 2. Tabla tool_assignments (asignaciones a empleados)
-- 3. Triggers de stock (entrega descuenta, devolución reingresa)
-- 4. RPC update_inventory_item actualizado con todos los campos
-- ============================================================

-- 1. Flag en artículos
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_assignable boolean NOT NULL DEFAULT false;

-- 2. Tabla de asignaciones
CREATE TABLE IF NOT EXISTS public.tool_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consecutive integer GENERATED ALWAYS AS IDENTITY,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  serial_number text,
  item_state text NOT NULL DEFAULT 'NUEVO' CHECK (item_state IN ('NUEVO', 'USADO')),
  condition_notes text,
  assignment_type text NOT NULL DEFAULT 'NUEVA'
    CHECK (assignment_type IN ('NUEVA', 'REEMPLAZO_DANO', 'REEMPLAZO_EXTRAVIO', 'CAMBIO_ASIGNACION')),
  previous_assignment_id uuid REFERENCES public.tool_assignments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVA'
    CHECK (status IN ('ACTIVA', 'DEVUELTA', 'TRANSFERIDA', 'DANADA', 'EXTRAVIADA')),
  return_date date,
  return_notes text,
  notes text,
  assigned_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_assignments_employee ON public.tool_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_tool_assignments_item ON public.tool_assignments(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_tool_assignments_status ON public.tool_assignments(status);

-- 3. Triggers de stock
-- Al crear una asignación que entrega herramienta desde almacén
-- (todo excepto CAMBIO_ASIGNACION, donde la herramienta física solo cambia de manos)
CREATE OR REPLACE FUNCTION public.handle_new_tool_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assignment_type <> 'CAMBIO_ASIGNACION' THEN
    UPDATE public.inventory_items
    SET quantity = GREATEST(quantity - 1, 0), updated_at = now()
    WHERE id = NEW.inventory_item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tool_assignment_created ON public.tool_assignments;
CREATE TRIGGER on_tool_assignment_created
  AFTER INSERT ON public.tool_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_tool_assignment();

-- Al devolver la herramienta al almacén reingresa al stock.
-- DANADA / EXTRAVIADA / TRANSFERIDA no reingresan stock.
CREATE OR REPLACE FUNCTION public.handle_tool_assignment_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'ACTIVA' AND NEW.status = 'DEVUELTA' THEN
    UPDATE public.inventory_items
    SET quantity = quantity + 1, updated_at = now()
    WHERE id = NEW.inventory_item_id;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tool_assignment_status_change ON public.tool_assignments;
CREATE TRIGGER on_tool_assignment_status_change
  BEFORE UPDATE ON public.tool_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_tool_assignment_status_change();

-- Permisos (mismo esquema permisivo del resto del proyecto)
ALTER TABLE public.tool_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to tool_assignments" ON public.tool_assignments;
CREATE POLICY "Allow all access to tool_assignments"
  ON public.tool_assignments FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.tool_assignments TO anon, authenticated, service_role;

-- 4. RPC actualizado: incluye campos de logística, empaque y asignación
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
    code                  = COALESCE((p_updates->>'code'),                          code),
    name                  = COALESCE((p_updates->>'name'),                          name),
    description           = COALESCE((p_updates->>'description'),                   description),
    category_id           = COALESCE((p_updates->>'category_id')::uuid,             category_id),
    unit_id               = COALESCE((p_updates->>'unit_id')::uuid,                 unit_id),
    quantity              = COALESCE((p_updates->>'quantity')::int,                 quantity),
    min_stock             = COALESCE((p_updates->>'min_stock')::numeric,            min_stock),
    max_stock             = COALESCE((p_updates->>'max_stock')::numeric,            max_stock),
    price                 = COALESCE((p_updates->>'price')::numeric,                price),
    status                = COALESCE((p_updates->>'status'),                        status),
    origin                = COALESCE((p_updates->>'origin'),                        origin),
    lead_time_days        = COALESCE((p_updates->>'lead_time_days')::int,           lead_time_days),
    min_order_qty         = COALESCE((p_updates->>'min_order_qty')::numeric,        min_order_qty),
    is_assignable         = COALESCE((p_updates->>'is_assignable')::boolean,        is_assignable),
    preferred_supplier_id = CASE WHEN p_updates ? 'preferred_supplier_id'
                                 THEN (p_updates->>'preferred_supplier_id')::uuid
                                 ELSE preferred_supplier_id END,
    package_unit_id       = CASE WHEN p_updates ? 'package_unit_id'
                                 THEN (p_updates->>'package_unit_id')::uuid
                                 ELSE package_unit_id END,
    units_per_package     = CASE WHEN p_updates ? 'units_per_package'
                                 THEN (p_updates->>'units_per_package')::numeric
                                 ELSE units_per_package END,
    updated_at            = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artículo no encontrado: %', p_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
