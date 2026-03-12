-- 0008_robust_status_change.sql
-- Description: Fixes the handle_requisition_status_change trigger which was violating the stock_integrity_check constraint on older corrupted records, causing unhandled 500 errors (which manifest as CORS preflight failures in NextJS).

CREATE OR REPLACE FUNCTION handle_requisition_status_change()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- Only act if it was PENDING
    IF OLD.status = 'PENDIENTE' AND NEW.status = 'ENTREGADA' THEN
        -- Delivery: Reduce physical stock, clear committed stock (safely clamping to 0 to avoid constraint violations)
        FOR item IN SELECT inventory_item_id, quantity FROM public.requisition_items WHERE requisition_id = NEW.id LOOP
            UPDATE public.inventory_items
            SET 
                quantity = GREATEST(0, quantity - item.quantity),
                committed_quantity = GREATEST(0, committed_quantity - item.quantity)
            WHERE id = item.inventory_item_id;
        END LOOP;
        
    ELSIF OLD.status = 'PENDIENTE' AND NEW.status = 'CANCELADA' THEN
        -- Cancellation: Restore available stock by dropping the committed stock (safely clamping)
        FOR item IN SELECT inventory_item_id, quantity FROM public.requisition_items WHERE requisition_id = NEW.id LOOP
            UPDATE public.inventory_items
            SET committed_quantity = GREATEST(0, committed_quantity - item.quantity)
            WHERE id = item.inventory_item_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
