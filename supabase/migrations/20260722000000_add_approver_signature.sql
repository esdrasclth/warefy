-- 20260722000000_add_approver_signature.sql
-- Adds the approver signature URL (stored in Cloudflare R2) to requisitions

ALTER TABLE public.requisitions
ADD COLUMN IF NOT EXISTS approver_signature_url TEXT;

COMMENT ON COLUMN public.requisitions.approver_signature_url IS 'URL pública en R2 de la firma manuscrita del aprobador, capturada al autorizar la requisa';

-- PostgREST no detecta la nueva columna hasta refrescar su caché de esquema
NOTIFY pgrst, 'reload schema';
