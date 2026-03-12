-- 0002_almacen_expansion.sql

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    abbreviation text,
    created_at timestamp with time zone DEFAULT now()
);

-- Note: We modify the existing inventory_items to add new columns
-- and change unit to reference unit_id. We drop the old 'unit' text column
-- since we are in early development and there is no critical production data.
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS unit;

ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS min_stock numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE';

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for anon users to categories" ON public.categories FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for anon users to units" ON public.units FOR ALL TO anon USING (true) WITH CHECK (true);
