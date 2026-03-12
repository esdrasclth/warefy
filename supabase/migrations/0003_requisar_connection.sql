-- 0003_requisar_connection.sql
-- Enables unauthenticated "testing" creations by relaxing foreign key constraints on requisitions.

-- 1. Relax Requisitions table constraints to allow testing without Auth
ALTER TABLE public.requisitions
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS requester_code text,
  ADD COLUMN IF NOT EXISTS area_name text;

-- 2. Drop existing restrictive policies to avoid conflicts
DROP POLICY IF EXISTS "Enable all access for anon users to budgets" ON public.budgets;
DROP POLICY IF EXISTS "Enable all access for anon users to requisitions" ON public.requisitions;
DROP POLICY IF EXISTS "Enable all access for anon users to requisition_items" ON public.requisition_items;

-- 3. Create permissive MASTER policies for the Requisar module elements
CREATE POLICY "Activar Todo Presupuestos" ON public.budgets FOR ALL USING (true);
CREATE POLICY "Activar Todo Requisas" ON public.requisitions FOR ALL USING (true);
CREATE POLICY "Activar Todo Detalles Requisa" ON public.requisition_items FOR ALL USING (true);
