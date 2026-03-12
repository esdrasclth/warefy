-- 0006_strict_stock_constraint.sql

-- 1. Reset any corrupted committed stock that exceeds available physical stock
UPDATE public.inventory_items
SET committed_quantity = quantity
WHERE committed_quantity > quantity;

-- Reset any negative committed stock (just in case)
UPDATE public.inventory_items
SET committed_quantity = 0
WHERE committed_quantity < 0;

-- 2. Add an iron-clad CHECK constraint to the table to ensure 
-- the database NEVER allows committed > physical stock, even if the Frontend fails.
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS stock_integrity_check;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT stock_integrity_check 
  CHECK (committed_quantity >= 0 AND committed_quantity <= quantity);
