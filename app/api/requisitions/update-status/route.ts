import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { notifyRequisitionRequester } from '@/lib/serverNotifications';

export async function POST(request: Request) {
  try {
    const { requisitionId, status, deliveredQuantities } = await request.json();

    if (!requisitionId || !status) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    if (status === 'ENTREGADA' && deliveredQuantities && typeof deliveredQuantities === 'object') {
      const entries = Object.entries(deliveredQuantities) as Array<[string, number]>;
      const updates = entries.map(([itemId, qty]) =>
        supabaseAdmin
          .from('requisition_items')
          .update({ delivered_quantity: qty })
          .eq('id', itemId)
      );
      const results = await Promise.all(updates);
      const updateError = results.find(r => r.error)?.error;
      if (updateError) throw updateError;

      // Recalculate total_cost based on delivered quantities
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('requisition_items')
        .select('id, quantity, unit_cost, delivered_quantity')
        .eq('requisition_id', requisitionId);
      if (itemsError) throw itemsError;
      const newTotal = (items ?? []).reduce((sum, item) => {
        const qty = item.delivered_quantity ?? item.quantity ?? 0;
        return sum + qty * (item.unit_cost ?? 0);
      }, 0);
      const { error: totalError } = await supabaseAdmin
        .from('requisitions')
        .update({ total_cost: newTotal })
        .eq('id', requisitionId);
      if (totalError) throw totalError;
    }

    const statusUpdate: Record<string, unknown> = { status };
    if (status === 'ENTREGADA') {
      statusUpdate.delivered_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('requisitions')
      .update(statusUpdate)
      .eq('id', requisitionId);

    if (error) throw error;

    if (status === 'ENTREGADA') {
      await notifyRequisitionRequester(requisitionId, 'delivered');
    } else if (status === 'CANCELADA') {
      await notifyRequisitionRequester(requisitionId, 'cancelled');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update requisition status error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
