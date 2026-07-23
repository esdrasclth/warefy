import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/supabase/requireAdmin';

const ALLOWED_ROLES = ['ADMIN', 'ALMACEN', 'APROBADOR', 'USER'];

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true, role });
  } catch (error: any) {
    console.error('Update role error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
