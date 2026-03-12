-- 0001_initial_schema.sql
-- Description: Creates initial tables for Inventory, Budgets and Requisitions, and enables RLS.

-- Create Budgets Table
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_name text NOT NULL,
    total_budget numeric(12,2) NOT NULL,
    spent_budget numeric(12,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create Inventory Items Table
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    name text NOT NULL,
    description text,
    quantity integer DEFAULT 0,
    unit text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create Requisitions Table
CREATE TABLE IF NOT EXISTS public.requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- UUID referencing auth.users if auth is enabled
    budget_id UUID REFERENCES public.budgets(id),
    status text DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, FULFILLED
    total_cost numeric(12,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Requisition Items (Many-to-Many map between Requisitions and Inventory Items)
CREATE TABLE IF NOT EXISTS public.requisition_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID REFERENCES public.requisitions(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity integer NOT NULL,
    unit_cost numeric(12,2),
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for all tables
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;

-- Creating basic policies (allowing all for now, assuming authenticated internal API usage)
-- In a real scenario, you'd restrict these based on role.
CREATE POLICY "Enable all access for anon users to budgets" ON public.budgets FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users to inventory_items" ON public.inventory_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users to requisitions" ON public.requisitions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users to requisition_items" ON public.requisition_items FOR ALL TO anon USING (true) WITH CHECK (true);
