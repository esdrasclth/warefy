-- Guarda un snapshot inmutable de las analíticas del Reporte de Autorización de Compra
-- (stock, cobertura, consumo, OC pendiente) tal como estaban al generar la orden.
-- Permite reimprimir el reporte exacto sin recalcular con datos posteriores.

ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS auth_report_snapshot jsonb;

NOTIFY pgrst, 'reload schema';
