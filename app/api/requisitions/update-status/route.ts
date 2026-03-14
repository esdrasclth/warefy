import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

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
    }

    const { error } = await supabaseAdmin
      .from('requisitions')
      .update({ status })
      .eq('id', requisitionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update requisition status error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
