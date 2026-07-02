import { supabase } from '@/utils/supabase/client';

export interface ReportItem {
  code: string;
  name: string;
  quantitySolicited: number;
  unitCost: number;
  currentStock: number;
  pendingOC: number;
  avgMonthlyConsumption: number;
  avgWeeklyConsumption: number;
  coverageWeeksCurrent: number | null;
  coverageWeeksWithPurchase: number | null;
  lastPurchaseDate: string | null;
}

export interface ReportData {
  consecutive: number;
  date: string;
  supplierName: string;
  total: number;
  manualRef: string | null;
  items: ReportItem[];
}

// Persiste el snapshot inmutable del reporte al generar la orden.
export async function savePurchaseAuthReportSnapshot(purchaseId: string, data: ReportData): Promise<void> {
  await supabase.from('purchases').update({ auth_report_snapshot: data }).eq('id', purchaseId);
}

// Obtiene los datos del reporte de una compra existente.
// Prioriza el snapshot guardado al crear la orden (valores exactos de ese momento).
// Solo recalcula con datos actuales como respaldo para órdenes previas sin snapshot.
export async function fetchPurchaseAuthReportData(purchaseId: string): Promise<ReportData | null> {
  const { data: purchase, error } = await supabase
    .from('purchases')
    .select(`
      consecutive,
      created_at,
      total_cost,
      manual_requisition_number,
      auth_report_snapshot,
      suppliers ( name ),
      purchase_items (
        inventory_item_id,
        quantity,
        unit_cost,
        inventory_items ( id, code, name, quantity, committed_quantity )
      )
    `)
    .eq('id', purchaseId)
    .single();

  if (error || !purchase) return null;

  // Snapshot exacto guardado al crear la orden
  if (purchase.auth_report_snapshot) {
    return purchase.auth_report_snapshot as unknown as ReportData;
  }

  const purchaseItems = (purchase.purchase_items || []) as unknown as Array<{
    inventory_item_id: string;
    quantity: number;
    unit_cost: number;
    inventory_items: { id: string; code: string; name: string; quantity: number; committed_quantity: number } | null;
  }>;

  const itemIds = purchaseItems.map(pi => pi.inventory_item_id);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [{ data: deliveredItems }, { data: receivedItems }, { data: pendingOCItems }] = await Promise.all([
    supabase
      .from('requisition_items')
      .select('inventory_item_id, quantity, delivered_quantity, requisitions!inner(status, created_at)')
      .eq('requisitions.status', 'ENTREGADA')
      .in('inventory_item_id', itemIds)
      .gte('requisitions.created_at', ninetyDaysAgo.toISOString()),
    supabase
      .from('purchase_items')
      .select('inventory_item_id, purchases!inner(status, created_at)')
      .eq('purchases.status', 'RECIBIDA')
      .in('inventory_item_id', itemIds),
    supabase
      .from('purchase_items')
      .select('inventory_item_id, quantity, purchases!inner(id, status)')
      .eq('purchases.status', 'PENDIENTE')
      .neq('purchases.id', purchaseId)
      .in('inventory_item_id', itemIds),
  ]);

  const consumptionMap: Record<string, number> = {};
  (deliveredItems || []).forEach((m: any) => {
    const qty = (m.delivered_quantity ?? m.quantity) || 0;
    consumptionMap[m.inventory_item_id] = (consumptionMap[m.inventory_item_id] || 0) + qty;
  });

  const lastInMap: Record<string, string> = {};
  (receivedItems || []).forEach((m: any) => {
    const receivedAt = m.purchases?.created_at;
    if (!receivedAt) return;
    if (!lastInMap[m.inventory_item_id] || receivedAt > lastInMap[m.inventory_item_id]) {
      lastInMap[m.inventory_item_id] = receivedAt;
    }
  });

  const pendingOCMap: Record<string, number> = {};
  (pendingOCItems || []).forEach((m: any) => {
    pendingOCMap[m.inventory_item_id] = (pendingOCMap[m.inventory_item_id] || 0) + (m.quantity || 0);
  });

  let total = 0;
  const items: ReportItem[] = purchaseItems.map(pi => {
    const inv = pi.inventory_items;
    const currentStock = (inv?.quantity || 0) - (inv?.committed_quantity || 0);
    const totalOut90 = consumptionMap[pi.inventory_item_id] || 0;
    const avgMonthly = Math.round((totalOut90 / 3) * 10) / 10;
    const avgWeekly = Math.round((avgMonthly / 4.33) * 10) / 10;
    const projectedStock = currentStock + (pi.quantity || 0);
    const coverageWeeksCurrent = avgWeekly > 0 ? Math.round((currentStock / avgWeekly) * 10) / 10 : null;
    const coverageWeeksWithPurchase = avgWeekly > 0 ? Math.round((projectedStock / avgWeekly) * 10) / 10 : null;
    const lastIn = lastInMap[pi.inventory_item_id] || null;
    const unitCost = Number(pi.unit_cost) || 0;
    total += (pi.quantity || 0) * unitCost;

    return {
      code: inv?.code || 'N/A',
      name: inv?.name || 'Item',
      quantitySolicited: pi.quantity || 0,
      unitCost,
      currentStock,
      pendingOC: pendingOCMap[pi.inventory_item_id] || 0,
      avgMonthlyConsumption: avgMonthly,
      avgWeeklyConsumption: avgWeekly,
      coverageWeeksCurrent,
      coverageWeeksWithPurchase,
      lastPurchaseDate: lastIn
        ? new Date(lastIn).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : null,
    };
  });

  const supplier = purchase.suppliers as unknown as { name: string } | null;

  return {
    consecutive: purchase.consecutive,
    date: new Date(purchase.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
    supplierName: supplier?.name || '—',
    total,
    manualRef: purchase.manual_requisition_number || null,
    items,
  };
}

// Genera y abre en una ventana nueva el documento imprimible del reporte de autorización.
export function openPurchaseAuthReport(reportData: ReportData) {
  const printedAt = new Date().toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const coverageColor = (val: number | null) =>
    val === null ? '#6b7280' : val < 2 ? '#dc2626' : val < 4 ? '#d97706' : '#16a34a';

  const rows = reportData.items.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="font-family:monospace">${item.code}</td>
      <td style="font-weight:600">${item.name}</td>
      <td style="text-align:center;font-weight:700;color:#1e40af">${item.quantitySolicited}</td>
      <td style="text-align:right;font-weight:600">$${item.unitCost.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="text-align:right;font-weight:700;color:#15803d">$${(item.quantitySolicited * item.unitCost).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="text-align:center">${item.currentStock}</td>
      <td style="text-align:center;font-weight:700;color:${item.pendingOC > 0 ? '#1e40af' : '#9ca3af'}">${item.pendingOC > 0 ? item.pendingOC : '—'}</td>
      <td style="text-align:center">${item.avgMonthlyConsumption}</td>
      <td style="text-align:center">${item.avgWeeklyConsumption}</td>
      <td style="text-align:center;font-weight:700;color:${coverageColor(item.coverageWeeksCurrent)}">
        ${item.coverageWeeksCurrent === null ? '∞' : `${item.coverageWeeksCurrent} sem.`}
      </td>
      <td style="text-align:center;font-weight:700;color:${coverageColor(item.coverageWeeksWithPurchase)}">
        ${item.coverageWeeksWithPurchase === null ? '∞' : `${item.coverageWeeksWithPurchase} sem.`}
      </td>
      <td style="text-align:center;color:#6b7280">${item.lastPurchaseDate || 'Sin historial'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>COM-${String(reportData.consecutive).padStart(6, '0')} — Warefy</title>
  <style>
    @page { size: letter landscape; margin: 1cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: white; }
    @media print { body { zoom: 0.72; } }
    .header { background: #001d3d; color: white; padding: 14px 20px; margin-bottom: 16px; }
    .header h1 { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: .05em; }
    .header p { font-size: 8pt; color: rgba(255,255,255,.7); margin-top: 3px; }
    .meta { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px 16px; margin-bottom: 16px; }
    .meta-item label { display: block; font-size: 7pt; font-weight: bold; color: #9ca3af; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
    .meta-item span { font-size: 10pt; font-weight: 600; color: #111; }
    .meta-item .big { font-size: 12pt; font-weight: 800; color: #001d3d; }
    .meta-ref { grid-column: 1 / -1; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { background: #001d3d; color: white; padding: 7px 8px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; border: 1px solid #001d3d; text-align: center; }
    th:first-child, th:nth-child(2) { text-align: left; }
    td { padding: 6px 8px; border: 1px solid #d1d5db; vertical-align: middle; }
    .signatures { display: grid; grid-template-columns: repeat(3,1fr); gap: 40px; margin-top: 40px; }
    .sig-line { border-bottom: 1px solid #9ca3af; height: 36px; margin-bottom: 6px; }
    .sig-label { text-align: center; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
    .footer { text-align: right; font-size: 7pt; color: #d1d5db; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Warefy — Reporte de Autorización de Compra</h1>
    <p>Generado el ${printedAt}</p>
  </div>
  <div class="meta">
    <div class="meta-item">
      <label>N° Compra</label>
      <span class="big">COM-${String(reportData.consecutive).padStart(6, '0')}</span>
    </div>
    <div class="meta-item">
      <label>Fecha</label>
      <span>${reportData.date}</span>
    </div>
    <div class="meta-item">
      <label>Proveedor</label>
      <span>${reportData.supplierName}</span>
    </div>
    <div class="meta-item">
      <label>Total</label>
      <span class="big">$${reportData.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
    </div>
    ${reportData.manualRef ? `<div class="meta-item meta-ref"><label>Referencia / Talonario</label><span>${reportData.manualRef}</span></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Descripción</th>
        <th>Cant. Solicitada</th>
        <th>Precio Unit.</th>
        <th>Subtotal</th>
        <th>Inv. Actual</th>
        <th>OC Pendiente</th>
        <th>Cons. Mensual Prom.</th>
        <th>Cons. Semanal Prom.</th>
        <th>Sem. Disponibles</th>
        <th>Sem. a Cubrir</th>
        <th>Última Compra</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="signatures">
    ${['Solicitado por', 'Revisado por', 'Autorizado por'].map(l => `
      <div><div class="sig-line"></div><div class="sig-label">${l}</div></div>`).join('')}
  </div>
  <div class="footer">Documento generado por Warefy · ${printedAt}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=650');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
