-- 0007_fix_delete_commitment.sql

-- 1. DROP the faulty child trigger that was failing to find its deleted parent
DROP TRIGGER IF EXISTS on_requisition_item_deleted ON public.requisition_items;
DROP FUNCTION IF EXISTS handle_deleted_requisition_item();

-- 2. CREATE a correct PARENT trigger that acts BEFORE the requisition is actually deleted
CREATE OR REPLACE FUNCTION handle_deleted_requisition()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- If the requisition being deleted was still PENDING, its items were committing stock.
    -- We must release that stock before the relation to the items is severed by CASCADE.
    IF OLD.status = 'PENDIENTE' THEN
        FOR item IN SELECT inventory_item_id, quantity FROM public.requisition_items WHERE requisition_id = OLD.id LOOP
            UPDATE public.inventory_items
            SET committed_quantity = GREATEST(committed_quantity - item.quantity, 0)
            WHERE id = item.inventory_item_id;
        END LOOP;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_requisition_deleted ON public.requisitions;
CREATE TRIGGER on_requisition_deleted
BEFORE DELETE ON public.requisitions
FOR EACH ROW EXECUTE FUNCTION handle_deleted_requisition();

-- 3. The Ultimate Fix: Force recalculate ALL committed stock across the entire inventory 
-- based ONLY on requisitions that currently exist and are PENDIENTE. 
-- This will instantly eliminate any "ghost" committed stock from the previous deleted test.
UPDATE public.inventory_items i
SET committed_quantity = COALESCE(
  (
    SELECT SUM(ri.quantity)
    FROM public.requisition_items ri
    JOIN public.requisitions r ON r.id = ri.requisition_id
    WHERE r.status = 'PENDIENTE' AND ri.inventory_item_id = i.id
  ), 
  0
);
