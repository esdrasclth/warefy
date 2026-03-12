-- 0004_employees.sql

CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    area_name text, -- To auto-fill requisition area depending on the requester
    position text,
    created_at timestamp with time zone DEFAULT now()
);

-- Note: In a larger DB, "area_name" might reference a "departments" or "budgets" table. We use text based on current constraints.

-- Adding Approver to the requisitions table alongside requester
ALTER TABLE public.requisitions 
  ADD COLUMN IF NOT EXISTS approver_name text,
  ADD COLUMN IF NOT EXISTS approver_code text;

-- Enable RLS and permissive policies
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Employees" ON public.employees;
CREATE POLICY "Public Access Employees" ON public.employees FOR ALL USING (true);
