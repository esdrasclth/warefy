CREATE TABLE IF NOT EXISTS public.notification_states (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz,
  dismissed_at timestamptz,
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.notification_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_states_select ON public.notification_states;
DROP POLICY IF EXISTS notification_states_insert ON public.notification_states;
DROP POLICY IF EXISTS notification_states_update ON public.notification_states;
DROP POLICY IF EXISTS notification_states_delete ON public.notification_states;

CREATE POLICY notification_states_select ON public.notification_states
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notification_states_insert ON public.notification_states
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY notification_states_update ON public.notification_states
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notification_states_delete ON public.notification_states
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notification_states_user ON public.notification_states(user_id);

COMMENT ON TABLE public.notification_states IS 'Estado por usuario de cada notificacion: leida (read_at) y descartada/limpiada (dismissed_at). Permite que limpiar persista y sea por usuario, incluso para notificaciones dirigidas por rol.';

NOTIFY pgrst, 'reload schema';
