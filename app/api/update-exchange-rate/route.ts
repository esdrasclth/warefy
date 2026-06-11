import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

// Indicador 620 del BCH: "Tipo de Cambio Nominal - Venta" (HNL por USD)
const BCH_VENTA_INDICATOR_ID = 620;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.BCH_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'BCH_API_KEY no configurada' }, { status: 500 });
    }

    const { data: settings } = await supabaseAdmin
      .from('global_settings')
      .select('rate_auto_update')
      .eq('id', 1)
      .single();

    if (settings && settings.rate_auto_update === false) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Actualización automática desactivada (tasa manual)' });
    }

    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url = `https://bchapi-am.azure-api.net/api/v1/indicadores/${BCH_VENTA_INDICATOR_ID}/cifras` +
      `?clave=${apiKey}&fechainicio=${fmt(from)}&fechafinal=${fmt(today)}`;

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`BCH API respondió ${response.status}`);
    }

    const cifras: Array<{ Fecha: string; Valor: number }> = await response.json();
    if (!Array.isArray(cifras) || cifras.length === 0) {
      throw new Error('BCH API no devolvió cifras para el rango consultado');
    }

    // La API devuelve las cifras ordenadas de más reciente a más antigua
    const latest = cifras[0];
    const rate = Number(latest.Valor);
    if (!rate || rate <= 0) {
      throw new Error(`Valor de tasa inválido: ${latest.Valor}`);
    }

    const { error } = await supabaseAdmin
      .from('global_settings')
      .update({ exchange_rate_usd_hnl: rate, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      rate,
      source: 'BCH - Tipo de Cambio Nominal - Venta',
      rateDate: latest.Fecha,
    });
  } catch (error: any) {
    console.error('Update exchange rate error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
