import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

// Extrae la IP del cliente detrás de proxies (Vercel/Next envían x-forwarded-for).
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // segundos hasta el reinicio de la ventana
}

// Verifica e incrementa el contador de la clave vía RPC atómica en Postgres.
// Fail-open: si la verificación falla (DB caída), permite la solicitud y lo
// registra, para no dejar fuera a usuarios legítimos por un problema de infra.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error || !data) {
    console.error('Rate limit check failed (fail-open):', error);
    return { allowed: true, retryAfter: 0 };
  }

  const reset = new Date((data as { reset: string }).reset).getTime();
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { allowed: (data as { allowed: boolean }).allowed, retryAfter };
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: `Demasiadas solicitudes. Intenta de nuevo en ${retryAfter} segundos.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
