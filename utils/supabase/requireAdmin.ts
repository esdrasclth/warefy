import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { getClientIp, checkRateLimit, rateLimitResponse } from '@/utils/rateLimit';

// Verifica que la petición provenga de un usuario autenticado con rol ADMIN.
// El cliente debe enviar el access token de la sesión en el header Authorization: Bearer <token>.
// Devuelve { user } si es válido, o { response } con el error HTTP a retornar.
export async function requireAdmin(request: Request): Promise<
  | { user: { id: string }; response?: never }
  | { user?: never; response: NextResponse }
> {
  // Rate limit por IP: protege todos los endpoints admin contra abuso/fuerza bruta.
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await checkRateLimit(`admin:ip:${ip}`, 60, 60);
  if (!allowed) {
    return { response: rateLimitResponse(retryAfter) };
  }

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { response: NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || profile?.role !== 'ADMIN') {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }

  return { user: { id: userData.user.id } };
}
