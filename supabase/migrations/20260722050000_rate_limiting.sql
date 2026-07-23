-- Rate limiting basado en Postgres: funciona de forma correcta entre instancias
-- serverless (a diferencia de un contador en memoria por instancia). Usa una
-- ventana fija: cada clave (p.ej. "login:ip:1.2.3.4") acumula un contador dentro
-- del bucket temporal actual y se rechaza cuando supera el límite.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Solo los flujos SECURITY DEFINER / service_role tocan esta tabla.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Chequeo atómico e incremento en una sola sentencia (INSERT ... ON CONFLICT
-- ... RETURNING). Devuelve si la solicitud está permitida y cuándo se reinicia
-- la ventana. Al ser SECURITY DEFINER, corre bajo el owner y omite RLS.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  -- Bucket de ventana fija alineado a p_window_seconds.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  -- Limpieza barata: elimina ventanas viejas de esta misma clave.
  DELETE FROM public.rate_limits
  WHERE key = p_key AND window_start < v_window_start;

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count',   v_count,
    'limit',   p_limit,
    'reset',   v_window_start + make_interval(secs => p_window_seconds)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
