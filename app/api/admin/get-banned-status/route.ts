import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/supabase/requireAdmin';

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const { userIds } = await request.json();
    if (!userIds || userIds.length === 0) {
      return NextResponse.json({ bannedIds: [] });
    }

    const idSet = new Set<string>(userIds);
    const now = new Date();
    const bannedIds: string[] = [];

    // El esquema `auth` no está expuesto vía PostgREST, así que leemos el
    // estado de baneo con la Admin API paginando sobre auth.users.
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      for (const u of data.users as any[]) {
        if (idSet.has(u.id) && u.banned_until && new Date(u.banned_until) > now) {
          bannedIds.push(u.id);
        }
      }

      if (data.users.length < perPage) break;
      page += 1;
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    const roles: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { roles[p.id] = p.role; });

    return NextResponse.json({ bannedIds, roles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
