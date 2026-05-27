'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Search, Loader2, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { supabase } from '@/utils/supabase/client';
import { logAudit } from '@/lib/audit';
import { notifyLowStock } from '@/lib/notifications';

interface ProductRow {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  originalQty: number;
  countedQty: number;
  dirty: boolean;
}

export default function ConteoPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, code, name, quantity, price, categories(name), units!unit_id(name)')
      .eq('status', 'ACTIVE')
      .order('name');

    if (!error && data) {
      setRows(
        data.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          category: (item.categories as { name?: string } | null)?.name ?? '—',
          unit: (item.units as { name?: string } | null)?.name ?? 'UND',
          price: item.price ?? 0,
          originalQty: item.quantity ?? 0,
          countedQty: item.quantity ?? 0,
          dirty: false,
        }))
      );
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleQtyChange = (id: string, value: string) => {
    const num = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setRows(prev =>
      prev.map(r => r.id === id ? { ...r, countedQty: num, dirty: num !== r.originalQty } : r)
    );
    setSavedCount(null);
  };

  const handleReset = (id: string) => {
    setRows(prev =>
      prev.map(r => r.id === id ? { ...r, countedQty: r.originalQty, dirty: false } : r)
    );
  };

  const handleSaveAll = async () => {
    const changed = rows.filter(r => r.dirty);
    if (changed.length === 0) return;

    setIsSaving(true);
    setSavedCount(null);

    const results = await Promise.all(
      changed.map(r =>
        supabase
          .from('inventory_items')
          .update({ quantity: r.countedQty })
          .eq('id', r.id)
      )
    );

    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      toast.error(`${errors.length} artículo(s) no pudieron guardarse. Intenta de nuevo.`);
    }

    const saved = results.length - errors.length;
    setSavedCount(saved);
    if (saved > 0) toast.success(`${saved} artículo${saved !== 1 ? 's' : ''} guardado${saved !== 1 ? 's' : ''} correctamente.`);

    // Fire audit + low-stock notifications for successfully saved rows
    for (let i = 0; i < changed.length; i++) {
      if (!results[i].error) {
        const r = changed[i];
        logAudit({
          tableName: 'inventory_items',
          recordId: r.id,
          action: 'INVENTORY_ADJUST',
          description: `Conteo físico: "${r.name}" ajustado de ${r.originalQty} → ${r.countedQty} ${r.unit}.`,
          oldValues: { quantity: r.originalQty },
          newValues: { quantity: r.countedQty },
        });
        if (r.countedQty <= rows.find(row => row.id === r.id)?.originalQty! && r.countedQty <= 0) {
          // simple heuristic — notify only if resulting qty dropped to 0
        }
      }
    }

    // Sync originals for successfully saved rows
    setRows(prev =>
      prev.map(r => {
        const wasChanged = changed.find(c => c.id === r.id);
        if (wasChanged) return { ...r, originalQty: r.countedQty, dirty: false };
        return r;
      })
    );

    setIsSaving(false);
  };

  const changedRows = rows.filter(r => r.dirty);

  const filteredRows = rows.filter(r => {
    if (showOnlyChanged && !r.dirty) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-widest font-bold">
            <Link href="/productos" className="flex items-center gap-2 hover:text-primary transition-colors">
              <ArrowLeft size={14} />
              Volver a Productos
            </Link>
          </div>
          <h1 className="text-3xl font-light text-primary tracking-tight mt-2">Conteo Físico</h1>
          <p className="text-gray-500 mt-1 text-sm">Edita las cantidades y guarda todos los cambios de una vez.</p>
        </div>

        <div className="flex items-center gap-3">
          {savedCount !== null && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-2">
              <CheckCircle2 size={14} />
              {savedCount} artículo{savedCount !== 1 ? 's' : ''} guardado{savedCount !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={handleSaveAll}
            disabled={changedRows.length === 0 || isSaving}
            className="flex items-center gap-2 bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar {changedRows.length > 0 ? `(${changedRows.length})` : 'cambios'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
          <div className="pl-2 pr-3 flex items-center pointer-events-none">
            <Search className="text-gray-400 group-focus-within:text-primary transition-colors" size={16} strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder="Buscar por código, nombre o categoría..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
          />
        </div>
        <label className="flex items-center gap-2 bg-white border border-gray-100 shadow-sm px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:border-gray-200 transition-colors select-none">
          <input
            type="checkbox"
            checked={showOnlyChanged}
            onChange={e => setShowOnlyChanged(e.target.checked)}
            className="accent-primary"
          />
          Solo modificados {changedRows.length > 0 && `(${changedRows.length})`}
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Artículos Activos — {rows.length.toLocaleString()} productos
          </h2>
          {changedRows.length > 0 && (
            <span className="text-[10px] font-bold text-primary bg-accent px-2 py-1 uppercase tracking-widest">
              {changedRows.length} sin guardar
            </span>
          )}
        </div>

        {isLoading ? (
          <table className="w-full"><tbody><TableSkeleton rows={10} cols={9} /></tbody></table>
        ) : (
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                  <th className="px-4 py-3 w-[90px]">Código</th>
                  <th className="px-4 py-3">Artículo</th>
                  <th className="px-4 py-3 w-[120px]">Categoría</th>
                  <th className="px-4 py-3 w-[70px]">Unidad</th>
                  <th className="px-4 py-3 w-[110px] text-right">Stock actual</th>
                  <th className="px-4 py-3 w-[140px] text-center">Conteo físico</th>
                  <th className="px-4 py-3 w-[90px] text-right">Diferencia</th>
                  <th className="px-4 py-3 w-[110px] text-right">Variación $</th>
                  <th className="px-4 py-3 w-[50px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-gray-400 text-sm">
                      {showOnlyChanged ? 'No hay cambios pendientes.' : 'No se encontraron artículos.'}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(row => {
                    const diff = row.countedQty - row.originalQty;
                    const diffLabel = diff === 0 ? '—' : diff > 0 ? `+${diff}` : String(diff);
                    const diffColor = diff > 0 ? 'text-green-600 font-bold' : diff < 0 ? 'text-red-500 font-bold' : 'text-gray-300';
                    const diffUsd = diff * row.price;
                    const diffUsdLabel = diff === 0 ? '—' : `${diffUsd >= 0 ? '+' : ''}$${diffUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    const diffUsdColor = diffUsd > 0 ? 'text-green-600 font-bold' : diffUsd < 0 ? 'text-red-500 font-bold' : 'text-gray-300';

                    return (
                      <tr key={row.id} className={`transition-colors group ${row.dirty ? 'bg-amber-50/60' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-4 py-3 text-[11px] font-mono text-primary/70">{row.code}</td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-700 group-hover:text-primary transition-colors">
                          {row.name}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-gray-400 uppercase">{row.category}</td>
                        <td className="px-4 py-3 text-[10px] text-gray-400 uppercase">{row.unit}</td>
                        <td className="px-4 py-3 text-xs text-right font-mono text-gray-500">
                          {row.originalQty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            value={row.countedQty}
                            onChange={e => handleQtyChange(row.id, e.target.value)}
                            className={`w-24 text-center text-sm font-semibold border px-2 py-1.5 focus:outline-none transition-colors ${
                              row.dirty
                                ? 'border-amber-400 bg-amber-50 text-amber-900 focus:border-primary'
                                : 'border-gray-200 bg-white text-primary focus:border-primary'
                            }`}
                          />
                        </td>
                        <td className={`px-4 py-3 text-xs text-right font-mono ${diffColor}`}>
                          {diffLabel}
                        </td>
                        <td className={`px-4 py-3 text-xs text-right font-mono ${diffUsdColor}`}>
                          {diffUsdLabel}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.dirty && (
                            <button
                              onClick={() => handleReset(row.id)}
                              title="Deshacer"
                              className="text-gray-300 hover:text-gray-500 transition-colors"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
