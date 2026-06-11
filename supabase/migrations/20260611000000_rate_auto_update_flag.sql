-- Flag para controlar si el cron del BCH actualiza la tasa o si rige un valor manual.
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS rate_auto_update boolean NOT NULL DEFAULT true;
