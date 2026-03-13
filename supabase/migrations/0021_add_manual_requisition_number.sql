-- 0021_add_manual_requisition_number.sql
-- Description: Adds a manual_requisition_number column to purchases table to allow users to input a manual reference.

ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS manual_requisition_number TEXT;
