import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: items, error } = await supabase
      .from('inventory_items')
      .select('id, code, name, quantity, committed_quantity, min_stock')
      .eq('status', 'ACTIVE');

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const alerts = (items || [])
      .map(item => ({
        code: item.code as string,
        name: item.name as string,
        quantity: Number(item.quantity) || 0,
        minStock: Number(item.min_stock) || 0,
        available: (Number(item.quantity) || 0) - (Number(item.committed_quantity) || 0),
      }))
      .filter(item => item.available <= item.minStock)
      .sort((a, b) => a.available - b.available);

    if (alerts.length === 0) {
      return NextResponse.json({ message: 'No hay productos con stock bajo hoy.' });
    }

    const date = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const rows = alerts
      .map(item => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px;color:#374151;">${item.code}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;">${item.name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:center;">${item.quantity}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:center;">${item.minStock}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:700;text-align:center;color:${item.available <= 0 ? '#dc2626' : '#d97706'};">${item.available}</td>
        </tr>`)
      .join('');

    const html = `
      <div style="font-family:sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:24px;">
        <div style="background:#001d3d;padding:20px 24px;">
          <h1 style="color:#fff;font-size:18px;margin:0;text-transform:uppercase;letter-spacing:.05em;">
            Alerta de Stock Bajo — Warefy
          </h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;">
          <p style="color:#374151;font-size:14px;margin-top:0;">Reporte del día <strong>${date}</strong>.</p>
          <p style="color:#374151;font-size:14px;">Se encontraron <strong>${alerts.length}</strong> producto(s) por debajo del stock mínimo:</p>
          <table style="width:100%;border-collapse:collapse;font-family:sans-serif;margin-top:8px;">
            <thead>
              <tr style="background-color:#001d3d;">
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;">Código</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;">Producto</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;">Stock Actual</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;">Stock Mínimo</th>
                <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;">Disponible</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#6b7280;font-size:12px;margin-bottom:0;margin-top:24px;">— Sistema Warefy</p>
        </div>
      </div>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const recipients = (process.env.ALERT_EMAIL_TO || '').split(',').map(e => e.trim()).filter(Boolean);

    await transporter.sendMail({
      from: `"Warefy Alertas" <${process.env.GMAIL_USER}>`,
      to: recipients.join(', '),
      subject: `Alerta de Stock Bajo - Warefy (${alerts.length} productos) — ${date}`,
      html,
    });

    return NextResponse.json({ success: true, alertCount: alerts.length, recipients, date });
  } catch (err: any) {
    console.error('Stock alert error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
