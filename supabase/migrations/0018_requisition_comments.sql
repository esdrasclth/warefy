-- 0018_requisition_comments.sql
-- Adds a comments column to requisitions

ALTER TABLE public.requisitions 
ADD COLUMN IF NOT EXISTS comments TEXT;

COMMENT ON COLUMN public.requisitions.comments IS 'Notas o justificaciones del requisitor';
