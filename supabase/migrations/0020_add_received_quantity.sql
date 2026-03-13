-- 0020_add_received_quantity.sql
-- Description: Adds received_quantity to purchase_items to track actual receipt vs requested.

ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS received_quantity INTEGER;

-- Optionally initialize it with the requested quantity for existing records if needed,
-- but normally it should be NULL or 0 until received.
-- UPDATE public.purchase_items SET received_quantity = quantity WHERE received_at IS NOT NULL; -- if we had received_at
