'use client';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Download, ChevronLeft, ChevronRight, Calendar, FileSpreadsheet, Search } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

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

export default function RegistrosPage() {
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

    const { data, error, count } = await supabase
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
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching registros:', error);
      setIsLoading(false);
      return;
    }

    const mapped = (data || [])
      .filter((item: any) => item.requisitions && item.requisitions.status !== 'CANCELADA')
      .filter((item: any) => {
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        const r = item.requisitions as any;
        const inv = item.inventory_items as any;
        return (
          (r?.id || '').toLowerCase().includes(q) ||
          (inv?.code || '').toLowerCase().includes(q) ||
          (inv?.name || '').toLowerCase().includes(q) ||
          (r?.requester_name || '').toLowerCase().includes(q) ||
          (r?.requester_code || '').toLowerCase().includes(q) ||
          (r?.area_name || '').toLowerCase().includes(q)
        );
      })
      .map((item: any): RegistroRow => {
        const req = item.requisitions as any;
        const inv = item.inventory_items as any;
        const cat = inv?.categories as any;
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
    if (!dateFrom || !dateTo) return alert('Selecciona un rango de fechas válido.');
    setIsExporting(true);
    try {
      const { data, error } = await supabase
        .from('requisition_items')
        .select(`
          id,
          quantity,
          delivered_quantity,
          unit_cost,
          created_at,
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
        `)
        .gte('created_at', `${dateFrom}T00:00:00Z`)
        .lte('created_at', `${dateTo}T23:59:59Z`)
        .order('created_at', { ascending: false });

      if (error) { alert('Error al exportar: ' + error.message); return; }

      const exportRows = (data || [])
        .filter((item: any) => item.requisitions && item.requisitions.status !== 'CANCELADA')
        .map((item: any) => {
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

      // Column widths
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 20 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 22 },
        { wch: 20 }, { wch: 16 }, { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registros');
      XLSX.writeFile(wb, `registros_${dateFrom}_${dateTo}.xlsx`);
    } catch (e: any) {
      alert('Error inesperado: ' + e.message);
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
          <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-gray-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm text-primary bg-transparent focus:outline-none"
            />
            <span className="text-gray-300 text-sm">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm text-primary bg-transparent focus:outline-none"
            />
          </div>
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 text-sm font-bold tracking-wide transition-colors shadow-sm disabled:opacity-60"
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
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
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
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-gray-500 whitespace-nowrap">
                      ${row.precio_unitario.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-green-700 whitespace-nowrap">
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              Mostrando{' '}
              <span className="font-bold text-primary">{page * PAGE_SIZE + 1}</span>
              {' '}–{' '}
              <span className="font-bold text-primary">
                {Math.min((page + 1) * PAGE_SIZE, totalCount)}
              </span>
              {' '}de{' '}
              <span className="font-bold text-primary">{totalCount}</span> registros
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-gray-200 text-gray-600 hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (page < 4) {
                    pageNum = i;
                  } else if (page > totalPages - 5) {
                    pageNum = totalPages - 7 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-xs font-bold border transition-colors ${pageNum === page
                        ? 'bg-primary text-white border-primary'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-gray-200 text-gray-600 hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
