-- 20260722010000_requisition_action_timestamps.sql
-- Marcas de tiempo de aprobación y entrega para mostrarlas en la impresión

ALTER TABLE public.requisitions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.requisitions.approved_at IS 'Fecha y hora en que el aprobador autorizó la requisa';
COMMENT ON COLUMN public.requisitions.delivered_at IS 'Fecha y hora en que almacén entregó la requisa';

NOTIFY pgrst, 'reload schema';
