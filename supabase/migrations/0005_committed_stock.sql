-- 0005_committed_stock.sql
-- Description: Adds committed_quantity to inventory and sets up triggers to automatically manage stock logistics on requisition creation, fulfillment, and deletion.

ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS committed_quantity integer DEFAULT 0;

-- 1. Trigger when a new item is requested
CREATE OR REPLACE FUNCTION handle_new_requisition_item()
RETURNS TRIGGER AS $$
DECLARE
    req_status text;
BEGIN
    SELECT status INTO req_status FROM public.requisitions WHERE id = NEW.requisition_id;
    -- If the requisition is active (PENDIENTE), we commit the stock
    IF req_status = 'PENDIENTE' THEN
        UPDATE public.inventory_items
        SET committed_quantity = committed_quantity + NEW.quantity
        WHERE id = NEW.inventory_item_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_requisition_item_added ON public.requisition_items;
CREATE TRIGGER on_requisition_item_added
AFTER INSERT ON public.requisition_items
FOR EACH ROW EXECUTE FUNCTION handle_new_requisition_item();

-- 2. Trigger when a requisition status changes (Fulfillment or Cancellation)
CREATE OR REPLACE FUNCTION handle_requisition_status_change()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- Only act if it was PENDING
    IF OLD.status = 'PENDIENTE' AND NEW.status = 'ENTREGADA' THEN
        -- Delivery: Reduce physical stock, clear committed stock
        FOR item IN SELECT inventory_item_id, quantity FROM public.requisition_items WHERE requisition_id = NEW.id LOOP
            UPDATE public.inventory_items
            SET 
                quantity = quantity - item.quantity,
                committed_quantity = committed_quantity - item.quantity
            WHERE id = item.inventory_item_id;
        END LOOP;
        
    ELSIF OLD.status = 'PENDIENTE' AND NEW.status = 'CANCELADA' THEN
        -- Cancellation: Restore available stock by dumping the committed stock
        FOR item IN SELECT inventory_item_id, quantity FROM public.requisition_items WHERE requisition_id = NEW.id LOOP
            UPDATE public.inventory_items
            SET committed_quantity = committed_quantity - item.quantity
            WHERE id = item.inventory_item_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_requisition_status_changed ON public.requisitions;
CREATE TRIGGER on_requisition_status_changed
AFTER UPDATE OF status ON public.requisitions
FOR EACH ROW EXECUTE FUNCTION handle_requisition_status_change();


-- 3. Trigger when a requisition is deleted entirely (cleanup)
CREATE OR REPLACE FUNCTION handle_deleted_requisition_item()
RETURNS TRIGGER AS $$
DECLARE
    req_status text;
BEGIN
    -- We must check if the parent requisition still exists or what its status was.
    -- Since requisition deletes CASCADE down to requisition_items, the parent might be gone or being deleted.
    -- However, we can just release committed stock if we are deleting an item that belonged to a PENDING requisition.
    IF EXISTS (SELECT 1 FROM public.requisitions WHERE id = OLD.requisition_id AND status = 'PENDIENTE') THEN
        UPDATE public.inventory_items
        SET committed_quantity = committed_quantity - OLD.quantity
        WHERE id = OLD.inventory_item_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_requisition_item_deleted ON public.requisition_items;
CREATE TRIGGER on_requisition_item_deleted
AFTER DELETE ON public.requisition_items
FOR EACH ROW EXECUTE FUNCTION handle_deleted_requisition_item();
