-- 0016_budgets_and_limits.sql
-- Description: Creates the Area Budgets (monthly limit in $) and Product Limits (monthly limit in units) tables.

-- 1. Area Budgets Table (Limits total $ spend per area per month)
CREATE TABLE IF NOT EXISTS public.area_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID REFERENCES public.areas(id) ON DELETE CASCADE UNIQUE NOT NULL,
    monthly_budget numeric(12,2) NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Product Limits Table (Limits total units requested of a specific item per month system-wide)
CREATE TABLE IF NOT EXISTS public.product_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE UNIQUE NOT NULL,
    monthly_limit_units integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 3. Explicit permissions for API Access (Anon and Authenticated roles)
GRANT ALL ON TABLE public.area_budgets TO anon, authenticated;
GRANT ALL ON TABLE public.product_limits TO anon, authenticated;

-- 4. Disable RLS for smooth local development (matching the rest of the application)
ALTER TABLE public.area_budgets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_limits DISABLE ROW LEVEL SECURITY;

-- 5. Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
