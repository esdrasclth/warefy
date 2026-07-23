'use client';
import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Search, Trash2, Eye, Loader2, Check, X, FileSpreadsheet, Edit, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import type { Purchase } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { TableSkeleton } from '@/components/ui/TableSkeleton';

type PurchaseStatus = 'PENDIENTE' | 'RECIBIDA' | 'CANCELADA';

export default function ComprasPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | PurchaseStatus>('TODAS');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPurchases = async (silent = false) => {
    if (!silent) setIsLoading(true);
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers ( name ),
        requisitions ( consecutive ),
        purchase_items ( quantity, unit_cost, received_quantity, inventory_items ( name, code ) )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching purchases:', error);
    } else if (data) {
      setPurchases(data);
    }
    if (!silent) setIsLoading(false);
  };

  useEffect(() => {
    fetchPurchases();

    const channel = supabase
      .channel('compras-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases' },
        () => {
          // Refresco silencioso + debounce: evita el parpadeo del skeleton
          // cuando otros usuarios cambian compras.
          if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
          realtimeTimer.current = setTimeout(() => fetchPurchases(true), 400);
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar compra',
      message: '¿Estás seguro de eliminar esta compra permanentemente?',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (ok) {
      const { error } = await supabase.from('purchases').delete().eq('id', id);
      if (error) toast.error('Error: ' + error.message);
      else fetchPurchases();
    }
  };

  const handleReceive = async (purchase: Purchase) => {
    const ok = await confirm({
      title: 'Registrar recepción',
      message: '¿Deseas registrar la recepción de esta compra? Esto incrementará el stock en el inventario.',
      confirmText: 'Registrar',
    });
    if (!ok) return;

    try {
      // SECURITY: Operación atómica en BD para evitar inconsistencias de inventario
      const { error } = await supabase.rpc('receive_purchase', {
        p_purchase_id: purchase.id
      });

      if (error) throw error;

      toast.success('Compra recibida e inventario actualizado con éxito.');
      fetchPurchases();
    } catch (error: any) {
      toast.error('Error al recibir compra: ' + error.message);
    }
  };

  const updateStatus = async (id: string, newStatus: PurchaseStatus) => {
    const { error } = await supabase.from('purchases').update({ status: newStatus }).eq('id', id);
    if (error) toast.error('Error: ' + error.message);
    else fetchPurchases();
  };

  const [isExporting, setIsExporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      // Fresh fetch with full detail — ensures inventory_items and received_quantity are always present
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          id, consecutive, status, total_cost, comments, created_at, manual_requisition_number,
          suppliers ( name ),
          requisitions ( consecutive ),
          purchase_items ( quantity, unit_cost, received_quantity, inventory_items ( name, code ) )
        `)
        .order('created_at', { ascending: false });

      if (error || !data) throw error ?? new Error('Sin datos');

      // Apply current filters
      const q = searchQuery.toLowerCase();
      const dataFiltered = data.filter(p => {
        const matchesSearch =
          String(p.consecutive).includes(q) ||
          ((p.suppliers as any)?.name || '').toLowerCase().includes(q) ||
          (p.comments || '').toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'TODAS' || p.status === statusFilter;
        return matchesSearch && matchesStatus;
      });

      // Sheet 1: Resumen
      const summary = dataFiltered.map(p => ({
        'Código': `COM-${String(p.consecutive).padStart(6, '0')}`,
        'Ref./Requisa': (p.requisitions as any)
          ? `REQ-${String((p.requisitions as any).consecutive).padStart(6, '0')}`
          : p.manual_requisition_number || '',
        'Proveedor': (p.suppliers as any)?.name || 'N/A',
        'Fecha': new Date(p.created_at ?? '').toLocaleDateString(),
        'Monto Total ($)': p.total_cost,
        'Estado': p.status,
        'Comentarios': p.comments || '',
      }));

      // Sheet 2: Detalle de items
      const detail: Record<string, unknown>[] = [];
      dataFiltered.forEach(p => {
        const codigo = `COM-${String(p.consecutive).padStart(6, '0')}`;
        const proveedor = (p.suppliers as any)?.name || 'N/A';
        const fecha = new Date(p.created_at ?? '').toLocaleDateString();
        const refRequisa = (p.requisitions as any)
          ? `REQ-${String((p.requisitions as any).consecutive).padStart(6, '0')}`
          : p.manual_requisition_number || '';
        ((p.purchase_items as any[]) ?? []).forEach((item: any) => {
          const qty = item.quantity ?? 0;
          const unitCost = item.unit_cost ?? 0;
          const receivedQty = item.received_quantity ?? (p.status === 'RECIBIDA' ? qty : '');
          detail.push({
            'Código Compra': codigo,
            'Ref./Requisa': refRequisa,
            'Proveedor': proveedor,
            'Fecha': fecha,
            'Código Producto': item.inventory_items?.code || '',
            'Producto': item.inventory_items?.name || '',
            'Cantidad Solicitada': qty,
            'Cantidad Recibida': receivedQty,
            'Costo Unitario ($)': unitCost,
            'Subtotal ($)': +(qty * unitCost).toFixed(2),
            'Estado Compra': p.status,
          });
        });
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Resumen');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Detalle');
      XLSX.writeFile(wb, `Reporte_Compras_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      toast.error('Error al exportar: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusColor = (status: PurchaseStatus) => {
    switch (status) {
      case 'RECIBIDA': return 'text-green-600 border-green-200 bg-green-50';
      case 'CANCELADA': return 'text-red-500 border-red-200 bg-red-50';
      case 'PENDIENTE': return 'text-blue-600 border-blue-200 bg-blue-50';
      default: return 'text-gray-500 border-gray-200 bg-gray-50';
    }
  };

  const filteredPurchases = purchases.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      String(p.consecutive).includes(q) ||
      (p.suppliers?.name || '').toLowerCase().includes(q) ||
      (p.comments || '').toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'TODAS' || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Compras</h1>
          <p className="text-gray-500 mt-2 text-sm">Registro de adquisición de productos y control de proveedores.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            disabled={isExporting}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-3 text-sm font-semibold transition-colors shadow-sm"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {isExporting ? 'Exportando...' : 'Descargar Excel'}
          </button>
          <Link
            href="/compras/nueva"
            className="flex items-center gap-2 bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nueva Compra
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
          <div className="pl-4 pr-3 flex items-center pointer-events-none">
            <Search className="text-gray-400 group-focus-within:text-primary transition-colors" size={20} strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder="Buscar por código, proveedor o comentario..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-2 bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(['TODAS', 'PENDIENTE', 'RECIBIDA', 'CANCELADA'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${statusFilter === f
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden relative min-h-[400px]">
        {/* Table Header Bar - MATCHING ALMACEN */}
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Registro de Compras — {filteredPurchases.length.toLocaleString()} resultados
          </h2>
        </div>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : null}

        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse table-fixed min-w-[1000px] lg:min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                <th className="py-2 px-6 w-[120px]">Código</th>
                <th className="py-2 px-6 w-[130px]">Ref./Requisa</th>
                <th className="py-2 px-6 w-[200px]">Proveedor</th>
                <th className="py-2 px-6 w-[100px]">Fecha</th>
                <th className="py-2 px-6 w-[120px] text-right">Monto ($)</th>
                <th className="py-2 px-6 w-[100px] text-center">Estado</th>
                <th className="py-2 px-6 w-[140px] text-center sticky right-0 bg-gray-50 border-l border-gray-100 z-10">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <TableSkeleton rows={8} cols={8} />
              ) : filteredPurchases.length > 0 ? (
                filteredPurchases.map((p) => (
                  <React.Fragment key={p.id}>
                  <tr className={`transition-colors group cursor-pointer ${expandedRows.has(p.id) ? 'bg-blue-50/30' : 'hover:bg-blue-50/20'}`} onClick={() => toggleRow(p.id)}>
                    <td className="py-2 px-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-primary truncate">COM-{String(p.consecutive).padStart(6, '0')}</span>
                        <span className="text-[9px] text-gray-400 font-mono tracking-wider truncate">{p.id.split('-')[0]}...</span>
                      </div>
                    </td>
                    <td className="py-2 px-6">
                      {p.requisitions ? (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 border border-blue-100 uppercase tracking-tighter truncate block">
                          REQ-{String(p.requisitions.consecutive).padStart(6, '0')}
                        </span>
                      ) : p.manual_requisition_number ? (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 border border-orange-100 uppercase tracking-tighter truncate block">
                          {p.manual_requisition_number}
                        </span>
                      ) : (
                        <span className="text-[9px] text-gray-300 italic">S/R</span>
                      )}
                    </td>
                    <td className="py-2 px-6">
                      <span className="text-xs text-gray-700 font-medium group-hover:text-primary transition-colors truncate block">
                        {p.suppliers?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="py-2 px-6 text-[11px] text-gray-500 italic">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-2 px-6 text-xs font-bold text-primary font-mono text-right">
                      {p.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-6 text-center">
                      <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${getStatusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 px-6 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => toggleRow(p.id)}
                          className={`transition-colors p-1 ${expandedRows.has(p.id) ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
                          title="Ver detalle"
                        >
                          {expandedRows.has(p.id) ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
                        </button>
                        {p.status === 'PENDIENTE' && (
                          <>
                            <button
                              onClick={() => handleReceive(p)}
                              className="text-gray-400 hover:text-green-600 transition-colors p-1"
                              title="Recibir"
                            >
                              <Check size={14} strokeWidth={3} />
                            </button>
                            <Link
                              href={`/compras/editar/${p.id}`}
                              className="text-gray-400 hover:text-primary transition-colors p-1"
                              title="Editar"
                            >
                              <Edit size={14} strokeWidth={2} />
                            </Link>
                            <button
                              onClick={() => updateStatus(p.id, 'CANCELADA')}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Anular"
                            >
                              <X size={14} strokeWidth={3} />
                            </button>
                          </>
                        )}
                        {p.status !== 'RECIBIDA' && (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <Link
                          href={`/compras/${p.id}`}
                          className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                          title="Ver"
                        >
                          <Eye size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(p.id) && (
                    <tr key={`${p.id}-detail`} className="bg-gray-50/80 border-b border-gray-100">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="pl-4 border-l-2 border-primary/20">
                          {(p.purchase_items as any[])?.length > 0 ? (
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="text-[9px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200">
                                  <th className="pb-1.5 pr-4">Código</th>
                                  <th className="pb-1.5 pr-4">Producto</th>
                                  <th className="pb-1.5 pr-4 text-right">Cant. Solicitada</th>
                                  <th className="pb-1.5 pr-4 text-right">Cant. Recibida</th>
                                  <th className="pb-1.5 pr-4 text-right">Costo Unit. ($)</th>
                                  <th className="pb-1.5 text-right">Subtotal ($)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(p.purchase_items as any[]).map((item: any, i: number) => {
                                  const qty = item.quantity ?? 0;
                                  const received = item.received_quantity ?? (p.status === 'RECIBIDA' ? qty : null);
                                  const unitCost = item.unit_cost ?? 0;
                                  return (
                                    <tr key={i} className="text-gray-600">
                                      <td className="py-1.5 pr-4 font-mono text-[10px] text-gray-400">{item.inventory_items?.code || '-'}</td>
                                      <td className="py-1.5 pr-4 font-medium text-gray-700">{item.inventory_items?.name || '-'}</td>
                                      <td className="py-1.5 pr-4 text-right">{qty}</td>
                                      <td className="py-1.5 pr-4 text-right">
                                        {received !== null
                                          ? <span className="text-green-600 font-semibold">{received}</span>
                                          : <span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="py-1.5 pr-4 text-right font-mono">{unitCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                      <td className="py-1.5 text-right font-bold text-primary">{(qty * unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-gray-400 italic py-1">Sin productos registrados.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                    No se encontraron compras.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
