'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Search, Trash2, X, UserPlus, Building2, Printer } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
  committed_quantity?: number;
  price: number;
  categories?: { name: string };
  units?: { name: string };
}

interface PurchaseDraftItem {
  inventoryItem: InventoryItem;
  quantity: number;
  unitCost: number;
}

interface Supplier {
  id: string;
  name: string;
  tax_id?: string;
  email?: string;
}

interface ReportItem {
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

interface ReportData {
  consecutive: number;
  date: string;
  supplierName: string;
  total: number;
  manualRef: string | null;
  items: ReportItem[];
}

export default function NuevaCompraView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);

  // Supplier State
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);

  // Items State
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<InventoryItem[]>([]);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState<PurchaseDraftItem[]>([]);

  // Comments
  const [comments, setComments] = useState('');
  const [manualRequisitionNumber, setManualRequisitionNumber] = useState('');

  // Report modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  // Load draft from sugerencias
  useEffect(() => {
    if (searchParams.get('from') !== 'sugerencias') return;
    const raw = sessionStorage.getItem('warefy_oc_draft');
    if (!raw) return;

    const draft = JSON.parse(raw) as {
      supplier_id: string;
      supplier_name: string;
      items: { id: string; code: string; name: string; quantity: number; price: number }[];
    };
    sessionStorage.removeItem('warefy_oc_draft');

    const load = async () => {
      setIsLoadingDraft(true);
      // Fetch full supplier object
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', draft.supplier_id)
        .single();

      if (supplierData) {
        setSelectedSupplier(supplierData);
        setSupplierSearch(supplierData.name);
      }

      // Fetch full inventory items
      const ids = draft.items.map(i => i.id);
      const { data: invData } = await supabase
        .from('inventory_items')
        .select('*, categories(name), units!unit_id(name)')
        .in('id', ids);

      if (invData) {
        const mapped = draft.items.map(di => {
          const inv = invData.find(iv => iv.id === di.id);
          return inv
            ? { inventoryItem: inv as InventoryItem, quantity: di.quantity, unitCost: di.price }
            : null;
        }).filter(Boolean) as { inventoryItem: InventoryItem; quantity: number; unitCost: number }[];
        setSelectedItems(mapped);
      }
      setIsLoadingDraft(false);
    };
    load();
  }, []);

  // 1. Search Suppliers
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = supplierSearch.trim();
      if (!q || selectedSupplier) { setSupplierResults([]); return; }
      setIsSearchingSupplier(true);
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .ilike('name', `%${q}%`)
        .limit(5);
      setSupplierResults(data || []);
      setIsSearchingSupplier(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [supplierSearch, selectedSupplier]);

  // 2. Search Items
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = itemSearch.trim();
      if (!q) { setItemResults([]); return; }
      setIsSearchingItems(true);
      const { data } = await supabase
        .from('inventory_items')
        .select('*, categories(name), units!unit_id(name)')
        .eq('status', 'ACTIVE')
        .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(10);
      setItemResults(data || []);
      setIsSearchingItems(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  const handleSelectItem = (item: InventoryItem) => {
    const exists = selectedItems.find(si => si.inventoryItem.id === item.id);
    if (exists) {
      setSelectedItems(selectedItems.map(si =>
        si.inventoryItem.id === item.id ? { ...si, quantity: si.quantity + 1 } : si
      ));
    } else {
      setSelectedItems([...selectedItems, { inventoryItem: item, quantity: 1, unitCost: item.price }]);
    }
    setItemSearch('');
    setItemResults([]);
  };

  const handleUpdateItem = (id: string, field: 'quantity' | 'unitCost', value: number | string) => {
    setSelectedItems(selectedItems.map(si => {
      if (si.inventoryItem.id === id) {
        return { ...si, [field]: value === "" ? 0 : Number(value) };
      }
      return si;
    }));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier || selectedItems.length === 0) {
      toast.warning('Debes seleccionar un proveedor y agregar artículos.');
      return;
    }

    setIsSaving(true);
    try {
      const totalCost = selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost), 0);

      const { data: pData, error: pError } = await supabase
        .from('purchases')
        .insert({
          supplier_id: selectedSupplier.id,
          manual_requisition_number: manualRequisitionNumber.trim() || null,
          total_cost: totalCost,
          comments: comments.trim() || null,
          status: 'PENDIENTE'
        })
        .select()
        .single();

      if (pError) throw pError;

      const itemsToInsert = selectedItems.map(si => ({
        purchase_id: pData.id,
        inventory_item_id: si.inventoryItem.id,
        quantity: si.quantity,
        unit_cost: si.unitCost
      }));

      const { error: piError } = await supabase.from('purchase_items').insert(itemsToInsert);
      if (piError) throw piError;

      // Fetch report data
      setIsLoadingReport(true);
      setShowReportModal(true);

      const itemIds = selectedItems.map(si => si.inventoryItem.id);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const [
        { data: purchaseItemsData },
        { data: deliveredItems },
        { data: receivedItems },
        { data: pendingOCItems },
      ] = await Promise.all([
        supabase
          .from('purchase_items')
          .select('inventory_item_id, quantity, unit_cost, inventory_items(id, code, name, quantity, committed_quantity)')
          .eq('purchase_id', pData.id),
        // Consumo real: requisas entregadas en los últimos 90 días
        supabase
          .from('requisition_items')
          .select('inventory_item_id, quantity, delivered_quantity, requisitions!inner(status, created_at)')
          .eq('requisitions.status', 'ENTREGADA')
          .in('inventory_item_id', itemIds)
          .gte('requisitions.created_at', ninetyDaysAgo.toISOString()),
        // Última entrada: OCs recibidas
        supabase
          .from('purchase_items')
          .select('inventory_item_id, purchases!inner(status, created_at)')
          .eq('purchases.status', 'RECIBIDA')
          .in('inventory_item_id', itemIds),
        supabase
          .from('purchase_items')
          .select('inventory_item_id, quantity, purchases!inner(id, status)')
          .eq('purchases.status', 'PENDIENTE')
          .neq('purchases.id', pData.id)
          .in('inventory_item_id', itemIds),
      ]);

      // Build maps
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
      (pendingOCItems || []).forEach(m => {
        pendingOCMap[m.inventory_item_id] = (pendingOCMap[m.inventory_item_id] || 0) + (m.quantity || 0);
      });

      const reportItems: ReportItem[] = (purchaseItemsData || []).map(pi => {
        const inv = pi.inventory_items as unknown as { id: string; code: string; name: string; quantity: number; committed_quantity: number } | null;
        const currentStock = (inv?.quantity || 0) - (inv?.committed_quantity || 0);
        const totalOut90 = consumptionMap[pi.inventory_item_id] || 0;
        const avgMonthly = Math.round((totalOut90 / 3) * 10) / 10;
        const avgWeekly = Math.round((avgMonthly / 4.33) * 10) / 10;
        const projectedStock = currentStock + (pi.quantity || 0);
        const coverageWeeksCurrent = avgWeekly > 0 ? Math.round((currentStock / avgWeekly) * 10) / 10 : null;
        const coverageWeeksWithPurchase = avgWeekly > 0 ? Math.round((projectedStock / avgWeekly) * 10) / 10 : null;
        const lastIn = lastInMap[pi.inventory_item_id] || null;

        return {
          code: inv?.code || 'N/A',
          name: inv?.name || 'Item',
          quantitySolicited: pi.quantity || 0,
          unitCost: Number(pi.unit_cost) || 0,
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

      setReportData({
        consecutive: pData.consecutive,
        date: new Date(pData.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        supplierName: selectedSupplier.name,
        total: totalCost,
        manualRef: manualRequisitionNumber.trim() || null,
        items: reportItems,
      });
      setIsLoadingReport(false);

    } catch (error: any) {
      toast.error('Error: ' + error.message);
      setIsSaving(false);
      setIsLoadingReport(false);
      setShowReportModal(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/compras" className="p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-light text-primary tracking-tight">Nueva Compra</h1>
            <p className="text-gray-500 mt-1 text-sm">
              {isLoadingDraft ? 'Cargando sugerencia...' : searchParams.get('from') === 'sugerencias' ? 'Pre-cargada desde Sugerencias de Compra.' : 'Registra una nueva adquisición de suministros.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSubmit} disabled={isSaving || selectedItems.length === 0 || !selectedSupplier}
          className="flex items-center gap-2 bg-primary text-background px-6 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Guardar Compra
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: Supplier & Linking */}
        <div className="lg:col-span-1 space-y-6">

          {/* Box: Supplier */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">1. Proveedor</h3>
              <button
                onClick={() => setShowNewSupplierModal(true)}
                className="text-[10px] font-bold text-primary hover:text-primary-dark flex items-center gap-1 uppercase tracking-tighter"
              >
                <UserPlus size={12} /> Nuevo
              </button>
            </div>

            <div className="relative">
              {!selectedSupplier ? (
                <div className="flex items-center bg-gray-50 border border-gray-200 group focus-within:border-primary transition-colors">
                  <div className="pl-3 pr-2 text-gray-400">
                    <Building2 size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar proveedor..."
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-transparent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-primary">{selectedSupplier.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono italic">{selectedSupplier.tax_id || 'Sin RTN/ID'}</p>
                  </div>
                  <button onClick={() => setSelectedSupplier(null)} className="text-gray-500 hover:text-primary p-1 bg-gray-100/50">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Supplier Results */}
              {supplierResults.length > 0 && !selectedSupplier && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50">
                  {supplierResults.map(s => (
                    <div key={s.id} className="flex items-center hover:bg-gray-50 border-b border-gray-50 last:border-0 group">
                      <button
                        onClick={() => { setSelectedSupplier(s); setSupplierResults([]); }}
                        className="flex-1 text-left px-4 py-2 text-sm"
                      >
                        {s.name}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`¿Estás seguro de que deseas eliminar al proveedor "${s.name}"?`)) {
                            const { error } = await supabase.from('suppliers').delete().eq('id', s.id);
                            if (error) toast.error('Error al eliminar: ' + error.message);
                            else setSupplierResults(supplierResults.filter(sr => sr.id !== s.id));
                          }
                        }}
                        className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Box: Manual Reference */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">2. N° Talonario / Referencia Manual</h3>
            <input
              type="text"
              placeholder="Ej: TAL-9988"
              value={manualRequisitionNumber}
              onChange={e => setManualRequisitionNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-gray-400 mt-2 italic">Este número se visualizará en el listado para seguimiento.</p>
          </div>

          {/* Box: Comments */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">3. Comentarios</h3>
            <textarea
              placeholder="Notas internas sobre la compra..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              className="w-full h-32 p-3 text-sm bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:border-primary resize-none"
            />
          </div>

        </div>

        {/* Right: Items Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-100 p-6 shadow-sm flex flex-col min-h-[500px]">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-6">
              3. Detalle de Compra
            </h3>

            <div className="relative mb-6">
              <div className="flex gap-2 bg-gray-50 border border-gray-200 focus-within:border-primary transition-colors">
                <div className="pl-3 flex items-center text-gray-400">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder="Agregar producto manual por nombre o código..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none"
                />
              </div>

              {itemResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50 max-h-60 overflow-y-auto">
                  {itemResults.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 flex justify-between items-center"
                    >
                      <div>
                        <p className="text-sm font-bold text-primary">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.code} • {item.categories?.name}</p>
                      </div>
                      <span className="text-xs font-bold text-primary">${item.price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Producto</th>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24 text-center">Cantidad</th>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-center">Costo Unit.</th>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-right">Subtotal</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedItems.map((item) => (
                    <tr key={item.inventoryItem.id} className="group transition-colors hover:bg-blue-50/20">
                      <td className="py-4">
                        <p className="text-sm font-semibold text-primary">{item.inventoryItem.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{item.inventoryItem.code}</p>
                      </td>
                      <td className="py-4">
                        <input
                          type="number"
                          value={item.quantity || ""}
                          onChange={(e) => handleUpdateItem(item.inventoryItem.id, 'quantity', e.target.value)}
                          className="w-20 mx-auto block border border-gray-200 bg-white p-1.5 text-sm text-center focus:border-primary outline-none"
                        />
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-1 border border-gray-200 p-1.5 bg-gray-50">
                          <span className="text-xs text-gray-400">$</span>
                          <span className="w-full text-sm text-right text-gray-700">{(item.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </td>
                      <td className="py-4 text-sm font-bold text-primary text-right">
                        ${(item.quantity * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 text-center">
                        <button
                          onClick={() => setSelectedItems(selectedItems.filter(si => si.inventoryItem.id !== item.inventoryItem.id))}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {selectedItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-300 text-sm">Empieza agregando artículos o cargando una requisa.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedItems.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-end">
                <div className="flex justify-between w-64 text-sm text-gray-500 mb-2">
                  <span>Subtotal Compra:</span>
                  <span>${selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between w-64 text-xl font-bold text-primary">
                  <span>TOTAL USD:</span>
                  <span>${selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* New Supplier Modal */}
      {showNewSupplierModal && (
        <SupplierModal
          onClose={() => setShowNewSupplierModal(false)}
          onCreated={(s) => { setSelectedSupplier(s); setShowNewSupplierModal(false); }}
        />
      )}

      {/* Authorization Report Modal */}
      {showReportModal && (
        <AuthorizationReportModal
          isLoading={isLoadingReport}
          reportData={reportData}
          onClose={() => router.push('/compras')}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Authorization Report Modal
───────────────────────────────────────────── */
function AuthorizationReportModal({
  isLoading,
  reportData,
  onClose,
}: {
  isLoading: boolean;
  reportData: ReportData | null;
  onClose: () => void;
}) {
  const printedAt = new Date().toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const handlePrint = () => {
    if (!reportData) return;

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
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-primary text-white flex-shrink-0">
        <span className="text-sm font-bold uppercase tracking-widest">Reporte de Autorización de Compra</span>
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white text-primary px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-gray-100 transition-colors"
          >
            <Printer size={14} /> Imprimir
          </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 border border-white/40 text-white px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
            >
              <X size={14} /> Cerrar
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="report-scroll-container flex-1 overflow-y-auto bg-gray-100 p-6">
          <div id="authorization-report-print" className="bg-white max-w-5xl mx-auto shadow-sm">

            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm text-gray-400">Generando reporte...</p>
              </div>
            ) : reportData ? (
              <>
                {/* Report Header */}
                <div className="bg-primary p-6 text-white">
                  <h1 className="text-xl font-bold uppercase tracking-widest">Warefy — Reporte de Autorización de Compra</h1>
                  <p className="text-sm text-white/70 mt-1">Generado el {printedAt}</p>
                </div>

                <div className="p-6">
                  {/* Purchase Meta */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 border border-gray-100 p-4 bg-gray-50">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">N° Compra</p>
                      <p className="text-lg font-bold text-primary mt-0.5">COM-{String(reportData.consecutive).padStart(6, '0')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fecha</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{reportData.date}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Proveedor</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{reportData.supplierName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</p>
                      <p className="text-lg font-bold text-primary mt-0.5">
                        ${reportData.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    {reportData.manualRef && (
                      <div className="col-span-2 sm:col-span-4 border-t border-gray-200 pt-3 mt-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Referencia / Talonario</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{reportData.manualRef}</p>
                      </div>
                    )}
                  </div>

                  {/* Items Table */}
                  <div className="report-table-container overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-primary text-white">
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary">Código</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary">Descripción</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Cant. Solicitada</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-right">Precio Unit.</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-right">Subtotal</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Inv. Actual</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">OC Pendiente</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Cons. Mensual Prom.</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Cons. Semanal Prom.</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Sem. Disponibles</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Sem. a Cubrir</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-primary text-center">Última Compra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.items.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-2.5 text-xs font-mono text-gray-600 border border-gray-200">{item.code}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold text-gray-800 border border-gray-200">{item.name}</td>
                            <td className="px-3 py-2.5 text-xs text-center font-bold text-primary border border-gray-200">{item.quantitySolicited}</td>
                            <td className="px-3 py-2.5 text-xs text-right text-gray-700 border border-gray-200">${item.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-bold text-green-700 border border-gray-200">${(item.quantitySolicited * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-xs text-center text-gray-700 border border-gray-200">{item.currentStock}</td>
                            <td className="px-3 py-2.5 text-xs text-center font-bold border border-gray-200">
                              {item.pendingOC > 0 ? <span className="text-blue-600">{item.pendingOC}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-center text-gray-700 border border-gray-200">{item.avgMonthlyConsumption}</td>
                            <td className="px-3 py-2.5 text-xs text-center text-gray-700 border border-gray-200">{item.avgWeeklyConsumption}</td>
                            <td className="px-3 py-2.5 text-xs text-center font-bold border border-gray-200">
                              <span className={
                                item.coverageWeeksCurrent === null ? 'text-gray-400' :
                                item.coverageWeeksCurrent < 2 ? 'text-red-600' :
                                item.coverageWeeksCurrent < 4 ? 'text-amber-600' : 'text-green-600'
                              }>
                                {item.coverageWeeksCurrent === null ? '∞' : `${item.coverageWeeksCurrent} sem.`}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-center font-bold border border-gray-200">
                              <span className={
                                item.coverageWeeksWithPurchase === null ? 'text-gray-400' :
                                item.coverageWeeksWithPurchase < 2 ? 'text-red-600' :
                                item.coverageWeeksWithPurchase < 4 ? 'text-amber-600' : 'text-green-600'
                              }>
                                {item.coverageWeeksWithPurchase === null ? '∞' : `${item.coverageWeeksWithPurchase} sem.`}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-center text-gray-500 border border-gray-200">
                              {item.lastPurchaseDate || 'Sin historial'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Signature area */}
                  <div className="grid grid-cols-3 gap-8 mt-12 pt-6">
                    {['Solicitado por', 'Revisado por', 'Autorizado por'].map(label => (
                      <div key={label} className="text-center">
                        <div className="border-b border-gray-400 mb-2 h-10" />
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Print footer */}
                  <p className="text-[10px] text-gray-300 text-right mt-8">
                    Documento generado por Warefy · {printedAt}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
  );
}

/* ─────────────────────────────────────────────
   Supplier Modal
───────────────────────────────────────────── */
function SupplierModal({ onClose, onCreated }: { onClose: () => void, onCreated: (s: Supplier) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const orFilter = taxId.trim()
        ? `name.ilike."${name.trim().replace(/"/g, '\\"')}",tax_id.eq."${taxId.trim().replace(/"/g, '\\"')}"`
        : `name.ilike."${name.trim().replace(/"/g, '\\"')}"`;
      const { data: existing, error: checkError } = await supabase
        .from('suppliers')
        .select('id, name')
        .or(orFilter)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        toast.warning(`Ya existe un proveedor con ese nombre o RTN: ${existing.name}`);
        setIsSaving(false);
        return;
      }

      const { data, error } = await supabase
        .from('suppliers')
        .insert({ name: name.trim(), tax_id: taxId.trim(), email: email.trim() })
        .select()
        .single();

      if (error) throw error;
      onCreated(data);
    } catch (error: any) {
      toast.error('Error: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white border border-gray-100 shadow-sm p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
        <h2 className="text-2xl font-light text-primary mb-6">Nuevo Proveedor</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nombre Completo</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 bg-white p-3 text-sm focus:border-primary outline-none"
              placeholder="Ej. Suministros Industriales S.A."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">RTN / ID Fiscal</label>
            <input
              type="text" value={taxId} onChange={e => setTaxId(e.target.value)}
              className="w-full border border-gray-200 bg-white p-3 text-sm focus:border-primary outline-none"
              placeholder="0801-1999-XXXXXX"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email Contacto</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 bg-white p-3 text-sm focus:border-primary outline-none"
              placeholder="ventas@proveedor.com"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-gray-400 hover:bg-gray-50 uppercase tracking-widest transition-colors">Cancelar</button>
          <button
            onClick={handleSave} disabled={isSaving || !name}
            className="flex-1 py-3 text-sm font-bold bg-primary text-white hover:bg-primary-dark uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
