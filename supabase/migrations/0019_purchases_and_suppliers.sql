-- 0019_purchases_and_suppliers.sql
-- Description: Creates Suppliers, Purchases and Purchase Items tables.

-- 1. Create Suppliers Table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create Purchases Table
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consecutive BIGINT GENERATED ALWAYS AS IDENTITY,
    requisition_id UUID REFERENCES public.requisitions(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    status TEXT DEFAULT 'PENDIENTE', -- PENDIENTE, RECIBIDA, CANCELADA
    total_cost NUMERIC(12,2) DEFAULT 0,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Create Purchase Items Table
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- 5. permissive policies
CREATE POLICY "Activar Todo Proveedores" ON public.suppliers FOR ALL USING (true);
CREATE POLICY "Activar Todo Compras" ON public.purchases FOR ALL USING (true);
CREATE POLICY "Activar Todo Detalles Compras" ON public.purchase_items FOR ALL USING (true);
