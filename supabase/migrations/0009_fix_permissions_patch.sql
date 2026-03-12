-- 0009_fix_permissions_patch.sql
-- Description: Explicitly grants UPDATE permissions to the 'anon' and 'authenticated' roles. 
-- PostgREST (Supabase) removes 'PATCH' from the allowed CORS methods if the requesting role lacks the specific table-level UPDATE privilege.

-- 1. Explicitly grant data modification privileges to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisitions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO anon, authenticated;

-- 2. Fully reconstruct the RLS policy to explicitly include WITH CHECK, guaranteeing UPDATE DML works
DROP POLICY IF EXISTS "Activar Todo Requisas" ON public.requisitions;
CREATE POLICY "Activar Todo Requisas" ON public.requisitions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Activar Todo Detalles Requisa" ON public.requisition_items;
CREATE POLICY "Activar Todo Detalles Requisa" ON public.requisition_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for anon users to inventory_items" ON public.inventory_items;
CREATE POLICY "Enable all access for anon users to inventory_items" ON public.inventory_items FOR ALL USING (true) WITH CHECK (true);
