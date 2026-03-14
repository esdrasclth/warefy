import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  try {
    const { userIds } = await request.json();
    if (!userIds || userIds.length === 0) {
      return NextResponse.json({ bannedIds: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('auth.users')
      .select('id, banned_until')
      .in('id', userIds);

    if (error) throw error;

    const now = new Date();
    const bannedIds = (data || [])
      .filter((u: any) => u.banned_until && new Date(u.banned_until) > now)
      .map((u: any) => u.id);

    return NextResponse.json({ bannedIds });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
