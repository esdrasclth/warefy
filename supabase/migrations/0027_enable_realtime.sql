-- Habilitar Realtime para las tablas relevantes
ALTER PUBLICATION supabase_realtime ADD TABLE public.requisitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.requisition_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
