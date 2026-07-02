import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/supabase/requireAdmin';

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const { userId, action } = await request.json();

    if (!userId || !action) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    if (action === 'disable') {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: '876600h'
      });
      if (error) throw error;
      return NextResponse.json({ success: true, status: 'disabled' });
    }

    if (action === 'enable') {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: 'none'
      });
      if (error) throw error;
      return NextResponse.json({ success: true, status: 'enabled' });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('Toggle access error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
