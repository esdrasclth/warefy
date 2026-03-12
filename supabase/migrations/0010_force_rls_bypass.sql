-- 0010_force_rls_bypass.sql
-- Description: Completely disables Row Level Security on requisitions and inventory items to eliminate RLS-based CORS errors when saving state from the client side during local testing.

-- Temporarily bypass RLS completely on these tables for anon testing
ALTER TABLE public.requisitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisition_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items DISABLE ROW LEVEL SECURITY;

-- If we MUST have RLS, this ensures NO RESTRICTIONS at all exist for ANON updates.
-- Sometimes 'true' evaluates with restricted scope if the DB auth context is completely missing.
DROP POLICY IF EXISTS "Activar Todo Requisas" ON public.requisitions;
CREATE POLICY "Activar Todo Requisas" ON public.requisitions 
  AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Activar Todo Detalles Requisa" ON public.requisition_items;
CREATE POLICY "Activar Todo Detalles Requisa" ON public.requisition_items 
  AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for anon users to inventory_items" ON public.inventory_items;
CREATE POLICY "Enable all access for anon users to inventory_items" ON public.inventory_items 
  AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);
