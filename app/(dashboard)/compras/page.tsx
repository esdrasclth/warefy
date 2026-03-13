'use client';
import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Search, Trash2, Eye, Loader2, Check, X, FileSpreadsheet, Edit } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import type { Purchase } from '@/types';

type PurchaseStatus = 'PENDIENTE' | 'RECIBIDA' | 'CANCELADA';

export default function ComprasPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | PurchaseStatus>('TODAS');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPurchases = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers ( name ),
        requisitions ( consecutive ),
        purchase_items ( quantity, unit_cost )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching purchases:', error);
    } else if (data) {
      setPurchases(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPurchases();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta compra permanentemente?')) {
      const { error } = await supabase.from('purchases').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else fetchPurchases();
    }
  };

  const handleReceive = async (purchase: Purchase) => {
    if (!confirm('¿Deseas registrar la recepción de esta compra? Esto incrementará el stock en el inventario.')) return;

    try {
      // SECURITY: Operación atómica en BD para evitar inconsistencias de inventario
      const { error } = await supabase.rpc('receive_purchase', {
        p_purchase_id: purchase.id
      });

      if (error) throw error;

      alert('Compra recibida e inventario actualizado con éxito.');
      fetchPurchases();
    } catch (error: any) {
      alert('Error al recibir compra: ' + error.message);
    }
  };

  const updateStatus = async (id: string, newStatus: PurchaseStatus) => {
    const { error } = await supabase.from('purchases').update({ status: newStatus }).eq('id', id);
    if (error) alert('Error: ' + error.message);
    else fetchPurchases();
  };

  const exportToExcel = () => {
    const dataToExport = filteredPurchases.map(p => ({
      'Código': `COM-${String(p.consecutive).padStart(6, '0')}`,
      'Proveedor': p.suppliers?.name || 'N/A',
      'Fecha': new Date(p.created_at).toLocaleDateString(),
      'Monto Total': p.total_cost,
      'Estado': p.status,
      'Comentarios': p.comments || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compras');
    XLSX.writeFile(wb, `Reporte_Compras_${new Date().toISOString().split('T')[0]}.xlsx`);
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
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 h-10 text-sm font-bold tracking-wide transition-colors shadow-sm"
          >
            <FileSpreadsheet size={16} />
            Descargar Excel
          </button>
          <Link 
            href="/compras/nueva"
            className="flex items-center gap-2 bg-primary text-background px-5 h-10 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
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
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                statusFilter === f 
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
              {filteredPurchases.length > 0 ? (
                filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50/20 transition-colors group">
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
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-6 text-xs font-bold text-primary font-mono text-right">
                      {p.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-6 text-center">
                      <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${getStatusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 px-6 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10">
                      <div className="flex items-center justify-center gap-2">
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
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                    {isLoading ? 'Cargando compras...' : 'No se encontraron compras.'}
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
