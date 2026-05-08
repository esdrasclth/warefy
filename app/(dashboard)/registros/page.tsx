'use client';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Download, Calendar, FileSpreadsheet, Search } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import Pagination from '@/components/ui/Pagination';
import { supabase } from '@/utils/supabase/client';
import type { InventoryItem, Requisition, RequisitionItem } from '@/types';

const PAGE_SIZE = 50;

interface RegistroRow {
  fecha: string;
  numero_requisa: string;
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string;
  cantidad_solicitada: number;
  cantidad_entregada: number;
  codigo_solicitante: string;
  nombre_solicitante: string;
  area: string;
  precio_unitario: number;
  total: number;
  req_id: string;
  status: string;
  comments: string;
}

interface RegistroQueryItem extends RequisitionItem {
  requisitions?: Requisition;
  inventory_items?: InventoryItem;
}

export default function RegistrosPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RegistroRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Date range for Excel export
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [isExporting, setIsExporting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback((forExport = false, exportFrom?: string, exportTo?: string) => {
    let q = supabase
      .from('requisition_items')
      .select(`
        id,
        quantity,
        delivered_quantity,
        unit_cost,
        inventory_items (
          code,
          name,
          categories ( name )
        ),
        requisitions (
          id,
          created_at,
          requester_code,
          requester_name,
          area_name,
          status
        )
      `, forExport ? undefined : { count: 'exact' })
      .neq('requisitions.status', 'CANCELADA')
      .order('requisitions(created_at)', { ascending: false });

    if (forExport && exportFrom && exportTo) {
      q = q
        .gte('requisitions(created_at)', `${exportFrom}T00:00:00`)
        .lte('requisitions(created_at)', `${exportTo}T23:59:59`);
    }

    return q;
  }, []);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const searchValue = debouncedSearch.trim();

    let query = supabase
      .from('requisition_items')
      .select(`
        id,
        quantity,
        delivered_quantity,
        unit_cost,
        inventory_items (
          code,
          name,
          categories ( name )
        ),
        requisitions (
          id,
          consecutive,
          comments,
          created_at,
          requester_code,
          requester_name,
          area_name,
          status
        )
      `, { count: 'exact' })
      .not('requisitions', 'is', null)
      .neq('requisitions.status', 'CANCELADA');

    if (searchValue) {
      const q = searchValue.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `inventory_items.code.ilike.%${q}%` +
        `,inventory_items.name.ilike.%${q}%` +
        `,requisitions.requester_name.ilike.%${q}%` +
        `,requisitions.requester_code.ilike.%${q}%` +
        `,requisitions.area_name.ilike.%${q}%`
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching registros:', error);
      setIsLoading(false);
      return;
    }

    const mapped = (data as unknown as RegistroQueryItem[] || [])
      .map((item): RegistroRow => {
        const req = item.requisitions;
        const inv = item.inventory_items;
        const cat = inv?.categories;
        const precioUnit = Number(item.unit_cost) || 0;
        const cantEntregada = Number(item.delivered_quantity ?? item.quantity) || 0;
        return {
          fecha: req?.created_at ? new Date(req.created_at).toLocaleDateString('es-HN') : '—',
          numero_requisa: req?.consecutive ? `REQ-${String(req.consecutive).padStart(6, '0')}` : '—',
          codigo_producto: inv?.code || '—',
          descripcion_producto: inv?.name || '—',
          categoria: cat?.name || 'Sin Categoría',
          cantidad_solicitada: Number(item.quantity) || 0,
          cantidad_entregada: cantEntregada,
          codigo_solicitante: req?.requester_code || '—',
          nombre_solicitante: req?.requester_name || '—',
          area: req?.area_name || '—',
          precio_unitario: precioUnit,
          total: cantEntregada * precioUnit,
          req_id: req?.id || '',
          status: req?.status || '—',
          comments: req?.comments || '—',
        };
      });

    setRows(mapped);
    setTotalCount(count || 0);
    setIsLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExportExcel = async () => {
    if (!dateFrom || !dateTo) { toast.warning('Selecciona un rango de fechas válido.'); return; }
    setIsExporting(true);
    try {
      const { data, error } = await supabase
        .from('requisition_items')
        .select(`
          quantity,
          delivered_quantity,
          unit_cost,
          inventory_items (
            code,
            name,
            categories ( name )
          ),
          requisitions!inner (
            consecutive,
            comments,
            created_at,
            requester_code,
            requester_name,
            area_name,
            status
          )
        `)
        .neq('requisitions.status', 'CANCELADA')
        .gte('requisitions.created_at', `${dateFrom}T00:00:00Z`)
        .lte('requisitions.created_at', `${dateTo}T23:59:59Z`)
        .order('requisitions(created_at)', { ascending: false });

      if (error) { toast.error('Error al exportar: ' + error.message); return; }

      const exportRows = (data || []).map((item: any) => {
        const req = item.requisitions as any;
        const inv = item.inventory_items as any;
        const cat = inv?.categories as any;
        const precioUnit = Number(item.unit_cost) || 0;
        const cantEntregada = Number(item.delivered_quantity ?? item.quantity) || 0;
        return {
          'Fecha': req?.created_at ? new Date(req.created_at).toLocaleDateString('es-HN') : '—',
          'Número de Requisa': req?.consecutive ? `REQ-${String(req.consecutive).padStart(6, '0')}` : '—',
          'Estado': req?.status || '—',
          'Código Producto': inv?.code || '—',
          'Descripción Producto': inv?.name || '—',
          'Categoría': cat?.name || 'Sin Categoría',
          'Cantidad Solicitada': Number(item.quantity) || 0,
          'Cantidad Entregada': cantEntregada,
          'Código Solicitante': req?.requester_code || '—',
          'Nombre Solicitante': req?.requester_name || '—',
          'Área': req?.area_name || '—',
          'Precio Unitario (USD)': precioUnit,
          'Total (USD)': cantEntregada * precioUnit,
          'Comentarios': req?.comments || '—',
        };
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 20 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 22 },
        { wch: 20 }, { wch: 16 }, { wch: 40 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registros');
      XLSX.writeFile(wb, `registros_${dateFrom}_${dateTo}.xlsx`);
    } catch (e: any) {
      toast.error('Error inesperado: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Registros</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Historial completo de movimientos y solicitudes de material.
          </p>
        </div>

        {/* Excel Export */}
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-3 shadow-sm">
            <Calendar size={14} className="text-gray-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm text-primary bg-transparent focus:outline-none h-full"
            />
            <span className="text-gray-300 text-sm">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm text-primary bg-transparent focus:outline-none h-full"
            />
          </div>
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-5 py-3 text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
          >
            {isExporting
              ? <Loader2 size={16} className="animate-spin" />
              : <FileSpreadsheet size={16} />
            }
            {isExporting ? 'Exportando…' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white border border-gray-100 shadow-sm p-3 flex items-center gap-3 focus-within:border-gray-300 transition-colors">
        <Search size={18} className="text-gray-400 shrink-0" strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Buscar por requisa, código, producto, solicitante o área..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Movimientos — {totalCount.toLocaleString()} registros totales
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-white/60 font-medium">
              Página {page + 1} de {totalPages}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <table className="w-full text-left text-sm"><tbody><TableSkeleton rows={12} cols={14} /></tbody></table>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No se encontraron registros.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Fecha</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Requisa</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Estado</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Cód. Producto</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Descripción</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Categoría</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center whitespace-nowrap">Cant. Sol.</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center whitespace-nowrap">Cant. Ent.</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Cód. Solicitante</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Nombre Solicitante</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest whitespace-nowrap">Área</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right whitespace-nowrap">Precio Unit.</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right whitespace-nowrap">Total</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Comentarios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, idx) => (
                  <tr
                    key={`${row.req_id}-${idx}`}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono text-xs text-gray-500 whitespace-nowrap">{row.fecha}</td>
                    <td className="py-2.5 px-3 font-mono text-xs font-bold text-primary whitespace-nowrap">{row.numero_requisa}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {row.status === 'ENTREGADA' && <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 border border-green-200 uppercase tracking-widest">Entregada</span>}
                      {row.status === 'PENDIENTE' && <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-widest">Pendiente</span>}
                      {row.status === 'PENDIENTE DE APROBACION' && <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-200 uppercase tracking-widest">Pend. Aprobación</span>}
                      {!['ENTREGADA', 'PENDIENTE', 'PENDIENTE DE APROBACION'].includes(row.status) && <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 uppercase tracking-widest">{row.status}</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-gray-500 whitespace-nowrap">{row.codigo_producto}</td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-primary max-w-[220px]">{row.descripcion_producto}</td>
                    <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">{row.categoria}</td>
                    <td className="py-2.5 px-3 text-center text-sm font-bold text-gray-400">{row.cantidad_solicitada}</td>
                    <td className="py-2.5 px-3 text-center text-sm font-bold text-primary">{row.cantidad_entregada}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-gray-500 whitespace-nowrap">{row.codigo_solicitante}</td>
                    <td className="py-2.5 px-3 text-xs text-gray-700 whitespace-nowrap">{row.nombre_solicitante}</td>
                    <td className="py-2.5 px-3 text-xs text-gray-600 whitespace-nowrap">{row.area}</td>
                    <td className={`py-2.5 px-3 text-right font-mono text-xs whitespace-nowrap ${row.precio_unitario === 0 && row.cantidad_entregada > 0 ? 'text-orange-400 font-bold' : 'text-gray-500'}`}>
                      {row.precio_unitario === 0 && row.cantidad_entregada > 0
                        ? '⚠ $0.00'
                        : `$${row.precio_unitario.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono text-xs font-bold whitespace-nowrap ${row.precio_unitario === 0 && row.cantidad_entregada > 0 ? 'text-orange-400' : 'text-green-700'}`}>
                      ${row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-400 italic max-w-[200px] truncate" title={row.comments}>
                      {row.comments}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          itemLabel="registros"
          onPageChange={setPage}
        />

      </div>
    </div>
  );
}
