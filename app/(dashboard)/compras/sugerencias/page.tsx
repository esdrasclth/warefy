'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, AlertTriangle, Package, RefreshCw } from 'lucide-react';
import { GroupedSkeleton } from '@/components/ui/TableSkeleton';
import { supabase } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/Toast';

interface CriticalItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
  min_stock: number;
  max_stock: number;
  price: number;
  unit: string;
  preferred_supplier_id: string | null;
  supplier_name: string | null;
  qty_to_order: number;
  estimated_cost: number;
}

interface SupplierGroup {
  supplier_id: string | null;
  supplier_name: string;
  items: CriticalItem[];
  total_cost: number;
}

export default function SugerenciasCompraPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<SupplierGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const fetchCritical = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .select(`
        id, code, name, quantity, min_stock, max_stock, price,
        units ( name ),
        preferred_supplier_id,
        suppliers:preferred_supplier_id ( id, name )
      `)
      .eq('status', 'ACTIVE')
      .lte('quantity', supabase.rpc as unknown as never);

    // Manual filter since lte on quantity vs min_stock needs a raw query
    const { data: rawData, error: rawError } = await supabase
      .from('inventory_items')
      .select(`
        id, code, name, quantity, min_stock, max_stock, price,
        units ( name ),
        preferred_supplier_id,
        suppliers:preferred_supplier_id ( id, name )
      `)
      .eq('status', 'ACTIVE')
      .order('name');

    if (rawError) { toast.error('Error cargando datos.'); setIsLoading(false); return; }

    const critical = (rawData || [])
      .filter((item: any) => (item.quantity ?? 0) <= (item.min_stock ?? 0))
      .map((item: any): CriticalItem => {
        const qty_to_order = Math.max(0, (item.max_stock ?? 0) - (item.quantity ?? 0));
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          quantity: item.quantity ?? 0,
          min_stock: item.min_stock ?? 0,
          max_stock: item.max_stock ?? 0,
          price: item.price ?? 0,
          unit: (item.units as any)?.name ?? 'UND',
          preferred_supplier_id: item.preferred_supplier_id ?? null,
          supplier_name: (item.suppliers as any)?.name ?? null,
          qty_to_order,
          estimated_cost: qty_to_order * (item.price ?? 0),
        };
      });

    // Group by supplier
    const map = new Map<string, SupplierGroup>();
    for (const item of critical) {
      const key = item.preferred_supplier_id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, {
          supplier_id: item.preferred_supplier_id,
          supplier_name: item.supplier_name ?? 'Sin proveedor asignado',
          items: [],
          total_cost: 0,
        });
      }
      const g = map.get(key)!;
      g.items.push(item);
      g.total_cost += item.estimated_cost;
    }

    // "Sin proveedor" always last
    const sorted = [...map.values()].sort((a, b) => {
      if (!a.supplier_id) return 1;
      if (!b.supplier_id) return -1;
      return a.supplier_name.localeCompare(b.supplier_name);
    });

    setGroups(sorted);
    // Select all by default
    const allIds = critical.map(i => i.id);
    setSelectedItems(new Set(allIds));
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchCritical(); }, [fetchCritical]);

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: SupplierGroup) => {
    const allSelected = group.items.every(i => selectedItems.has(i.id));
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) group.items.forEach(i => next.delete(i.id));
      else group.items.forEach(i => next.add(i.id));
      return next;
    });
  };

  const handleGenerateOC = (group: SupplierGroup) => {
    const items = group.items.filter(i => selectedItems.has(i.id));
    if (items.length === 0) { toast.warning('Selecciona al menos un artículo.'); return; }
    if (!group.supplier_id) { toast.warning('Asigna un proveedor a estos artículos antes de generar la OC.'); return; }

    const draft = {
      supplier_id: group.supplier_id,
      supplier_name: group.supplier_name,
      items: items.map(i => ({
        id: i.id,
        code: i.code,
        name: i.name,
        quantity: i.qty_to_order,
        price: i.price,
      })),
    };
    sessionStorage.setItem('warefy_oc_draft', JSON.stringify(draft));
    window.location.href = '/compras/nueva?from=sugerencias';
  };

  const totalItems = groups.reduce((acc, g) => acc + g.items.filter(i => selectedItems.has(i.id)).length, 0);
  const totalCost = groups.reduce((acc, g) => acc + g.items.filter(i => selectedItems.has(i.id)).reduce((s, i) => s + i.estimated_cost, 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-widest font-bold">
            <Link href="/compras" className="flex items-center gap-2 hover:text-primary transition-colors">
              <ArrowLeft size={14} /> Volver a Compras
            </Link>
          </div>
          <h1 className="text-3xl font-light text-primary tracking-tight mt-2">Sugerencias de Compra</h1>
          <p className="text-gray-500 mt-1 text-sm">Artículos con stock igual o por debajo del mínimo, agrupados por proveedor.</p>
        </div>
        <button onClick={fetchCritical} className="flex items-center gap-2 border border-gray-200 px-4 py-2.5 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Summary bar */}
      {!isLoading && totalItems > 0 && (
        <div className="bg-primary text-white px-6 py-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest">
            {totalItems} artículo{totalItems !== 1 ? 's' : ''} seleccionado{totalItems !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-bold font-mono">
            Costo estimado: ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {isLoading ? (
        <GroupedSkeleton groups={2} rowsPerGroup={4} />
      ) : groups.length === 0 ? (
        <div className="bg-white border border-gray-100 shadow-sm py-16 text-center">
          <Package size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-medium">Todo el stock está por encima del mínimo.</p>
          <p className="text-gray-300 text-xs mt-1">No hay sugerencias de compra en este momento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const groupSelected = group.items.filter(i => selectedItems.has(i.id));
            const allSelected = group.items.every(i => selectedItems.has(i.id));
            const groupCost = groupSelected.reduce((acc, i) => acc + i.estimated_cost, 0);

            return (
              <div key={group.supplier_id ?? '__none__'} className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleGroup(group)}
                      className="accent-accent w-3.5 h-3.5 cursor-pointer"
                    />
                    <div>
                      <h2 className="text-xs font-bold text-white uppercase tracking-widest">{group.supplier_name}</h2>
                      <p className="text-[10px] text-white/60 mt-0.5">{group.items.length} artículo{group.items.length !== 1 ? 's' : ''} · Est. ${groupCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleGenerateOC(group)}
                    disabled={groupSelected.length === 0 || !group.supplier_id}
                    className="flex items-center gap-2 bg-accent text-primary px-4 py-2 text-xs font-bold hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ShoppingCart size={13} />
                    Generar OC
                  </button>
                </div>

                {!group.supplier_id && (
                  <div className="flex items-center gap-2 px-6 py-2 bg-orange-50 border-b border-orange-100 text-orange-700 text-xs">
                    <AlertTriangle size={12} />
                    Asigna un proveedor a estos artículos en Productos para poder generar la OC.
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                        <th className="px-4 py-2.5 w-8"></th>
                        <th className="px-4 py-2.5 w-24">Código</th>
                        <th className="px-4 py-2.5">Artículo</th>
                        <th className="px-4 py-2.5 w-20 text-right">Actual</th>
                        <th className="px-4 py-2.5 w-20 text-right">Mínimo</th>
                        <th className="px-4 py-2.5 w-20 text-right">Máximo</th>
                        <th className="px-4 py-2.5 w-24 text-right">A pedir</th>
                        <th className="px-4 py-2.5 w-28 text-right">Est. $</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.items.map(item => (
                        <tr key={item.id} className={`transition-colors ${selectedItems.has(item.id) ? 'bg-white' : 'bg-gray-50/40 opacity-60'}`}>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              onChange={() => toggleItem(item.id)}
                              className="accent-primary w-3.5 h-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-[11px] font-mono text-primary/70">{item.code}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-700">
                            {item.name}
                            <span className="ml-1 text-[9px] text-gray-400 uppercase">{item.unit}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-red-500">{item.quantity}</td>
                          <td className="px-4 py-3 text-xs text-right text-gray-400">{item.min_stock}</td>
                          <td className="px-4 py-3 text-xs text-right text-gray-400">{item.max_stock}</td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-primary">{item.qty_to_order}</td>
                          <td className="px-4 py-3 text-xs text-right font-mono text-gray-600">
                            {item.price > 0 ? `$${item.estimated_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-orange-400">⚠ $0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
