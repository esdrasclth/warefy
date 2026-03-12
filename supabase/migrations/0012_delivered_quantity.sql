-- 0012_delivered_quantity.sql
-- Description: Adds a delivered_quantity column to requisition items to support partial fulfillments. Updates the status change trigger to deduct physical inventory based on the delivered amount, while freeing up the originally committed amount.

ALTER TABLE public.requisition_items ADD COLUMN IF NOT EXISTS delivered_quantity integer;

-- Update the handle_requisition_status_change trigger
CREATE OR REPLACE FUNCTION handle_requisition_status_change()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- Only act if it was PENDING
    IF OLD.status = 'PENDIENTE' AND NEW.status = 'ENTREGADA' THEN
        -- Delivery: Reduce physical stock by delivered quantity, clear committed stock by requested quantity
        FOR item IN SELECT inventory_item_id, quantity, COALESCE(delivered_quantity, quantity) as del_qty FROM public.requisition_items WHERE requisition_id = NEW.id LOOP
            UPDATE public.inventory_items
            SET 
                quantity = GREATEST(0, quantity - item.del_qty),
                committed_quantity = GREATEST(0, committed_quantity - item.quantity)
            WHERE id = item.inventory_item_id;
        END LOOP;
        
    ELSIF OLD.status = 'PENDIENTE' AND NEW.status = 'CANCELADA' THEN
        -- Cancellation: Restore available stock by dropping the committed stock (safely clamping)
        -- (This already effectively returns it to "available" inventory since available = quantity - committed)
        FOR item IN SELECT inventory_item_id, quantity FROM public.requisition_items WHERE requisition_id = NEW.id LOOP
            UPDATE public.inventory_items
            SET committed_quantity = GREATEST(0, committed_quantity - item.quantity)
            WHERE id = item.inventory_item_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
