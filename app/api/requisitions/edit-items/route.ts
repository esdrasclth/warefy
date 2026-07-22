import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

async function getAuthenticatedProfile(
  request: Request
): Promise<{ userId: string; role: string; code: string | null } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, employees(code)')
    .eq('id', user.id)
    .single();

  if (!profile) return null;
  const employees = profile.employees as { code?: string } | { code?: string }[] | null;
  const code = Array.isArray(employees) ? employees[0]?.code ?? null : employees?.code ?? null;
  return { userId: user.id, role: profile.role, code };
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedProfile(request);
    if (!auth) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { requisitionId, updates, deletions } = await request.json() as {
      requisitionId?: string;
      updates?: Array<{ itemId: string; quantity: number }>;
      deletions?: string[];
    };

    if (!requisitionId) {
      return NextResponse.json({ error: 'Falta el identificador de la requisa' }, { status: 400 });
    }

    const validUpdates = (updates ?? []).filter(u => u && typeof u.itemId === 'string');
    const validDeletions = (deletions ?? []).filter(id => typeof id === 'string');

    for (const u of validUpdates) {
      if (!Number.isInteger(u.quantity) || u.quantity < 1) {
        return NextResponse.json({ error: 'Las cantidades deben ser enteros mayores o iguales a 1' }, { status: 400 });
      }
    }

    const { data: requisition, error: reqError } = await supabaseAdmin
      .from('requisitions')
      .select('status, approver_code')
      .eq('id', requisitionId)
      .single();

    if (reqError || !requisition) {
      return NextResponse.json({ error: 'Requisa no encontrada' }, { status: 404 });
    }
    if (requisition.status !== 'PENDIENTE DE APROBACION') {
      return NextResponse.json({ error: 'Solo se puede editar una requisa pendiente de aprobación' }, { status: 409 });
    }

    const canApprove =
      auth.role === 'ADMIN' ||
      (auth.role === 'APROBADOR' && auth.code && requisition.approver_code === auth.code);
    if (!canApprove) {
      return NextResponse.json({ error: 'Sin permisos para editar esta requisa' }, { status: 403 });
    }

    // Ítems actuales para validar pertenencia y evitar dejar la requisa vacía
    const { data: currentItems, error: itemsError } = await supabaseAdmin
      .from('requisition_items')
      .select('id')
      .eq('requisition_id', requisitionId);
    if (itemsError) throw itemsError;

    const currentIds = new Set((currentItems ?? []).map(i => i.id));
    const deletionSet = new Set(validDeletions.filter(id => currentIds.has(id)));

    if (currentIds.size - deletionSet.size < 1) {
      return NextResponse.json({ error: 'La requisa debe conservar al menos un artículo' }, { status: 400 });
    }

    if (deletionSet.size > 0) {
      const { error: delError } = await supabaseAdmin
        .from('requisition_items')
        .delete()
        .in('id', Array.from(deletionSet));
      if (delError) throw delError;
    }

    for (const u of validUpdates) {
      if (!currentIds.has(u.itemId) || deletionSet.has(u.itemId)) continue;
      const { error: updError } = await supabaseAdmin
        .from('requisition_items')
        .update({ quantity: u.quantity })
        .eq('id', u.itemId);
      if (updError) throw updError;
    }

    // Recalcular total_cost sobre los ítems restantes
    const { data: remaining, error: remError } = await supabaseAdmin
      .from('requisition_items')
      .select('quantity, unit_cost')
      .eq('requisition_id', requisitionId);
    if (remError) throw remError;

    const newTotal = (remaining ?? []).reduce(
      (sum, item) => sum + (item.quantity ?? 0) * (item.unit_cost ?? 0),
      0
    );

    const { error: totalError } = await supabaseAdmin
      .from('requisitions')
      .update({ total_cost: newTotal })
      .eq('id', requisitionId);
    if (totalError) throw totalError;

    return NextResponse.json({ success: true, total_cost: newTotal });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[requisitions/edit-items] Error:', msg);
    return NextResponse.json({ error: 'Error interno del servidor', detail: msg }, { status: 500 });
  }
}
