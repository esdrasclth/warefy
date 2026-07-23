import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIp, checkRateLimit, rateLimitResponse } from '@/utils/rateLimit';

// Cliente con la ANON KEY solo para autenticar; no persiste sesión en el servidor.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function POST(request: Request) {
  const ip = getClientIp(request);

  let email: string;
  let password: string;
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Correo y contraseña son obligatorios' }, { status: 400 });
  }

  // Doble límite: por IP (fuerza bruta distribuida) y por correo (ataque dirigido).
  const ipLimit = await checkRateLimit(`login:ip:${ip}`, 20, 300);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfter);

  const emailLimit = await checkRateLimit(`login:email:${email}`, 5, 300);
  if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfter);

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return NextResponse.json(
      { error: 'Credenciales inválidas. Verifica tu correo y contraseña.' },
      { status: 401 },
    );
  }

  // El cliente usará estos tokens con supabase.auth.setSession para persistir la sesión.
  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user.id,
  });
}
