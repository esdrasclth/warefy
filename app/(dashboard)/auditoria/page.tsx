'use client';
import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Search, RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/TableSkeleton';

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  description: string;
  changed_by_name: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE:           'bg-green-100 text-green-700',
  UPDATE:           'bg-blue-100 text-blue-700',
  DELETE:           'bg-red-100 text-red-700',
  STATUS_CHANGE:    'bg-orange-100 text-orange-700',
  INVENTORY_ADJUST: 'bg-purple-100 text-purple-700',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE:           'Creación',
  UPDATE:           'Edición',
  DELETE:           'Eliminación',
  STATUS_CHANGE:    'Cambio Estado',
  INVENTORY_ADJUST: 'Ajuste Stock',
};

const PAGE_SIZE = 30;

export default function AuditoriaPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (actionFilter) query = query.eq('action', actionFilter);
    if (search.trim()) query = query.ilike('description', `%${search.trim()}%`);

    const { data, error, count } = await query;

    if (error) {
      toast.error('Error cargando auditoría.');
    } else {
      setLogs((data as AuditLog[]) ?? []);
      setTotal(count ?? 0);
    }
    setIsLoading(false);
  }, [page, actionFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary/40 mb-2">
            <ScrollText size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Administración</span>
          </div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Auditoría</h1>
          <p className="text-gray-500 mt-1 text-sm">Historial completo de cambios en el sistema.</p>
        </div>
        <button onClick={fetchLogs} className="flex items-center gap-2 border border-gray-200 px-4 py-2.5 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 bg-white border border-gray-100 shadow-sm p-3 flex items-center gap-2 focus-within:border-gray-300 transition-colors">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar en descripción..."
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700"
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(0); }}
          className="border border-gray-100 bg-white shadow-sm px-4 py-3 text-sm text-gray-600 focus:outline-none focus:border-primary transition-colors"
        >
          <option value="">Todas las acciones</option>
          {Object.keys(ACTION_LABELS).map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">Registros de Auditoría</h2>
          <span className="text-[10px] text-white/60 font-mono">{total.toLocaleString()} entradas</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                <th className="px-4 py-2.5 w-36">Fecha</th>
                <th className="px-4 py-2.5 w-28">Acción</th>
                <th className="px-4 py-2.5 w-32">Tabla</th>
                <th className="px-4 py-2.5">Descripción</th>
                <th className="px-4 py-2.5 w-32">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <TableSkeleton rows={8} cols={5} />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-gray-400 text-sm">
                    No hay registros de auditoría.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-[11px] font-mono text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-bold px-2 py-0.5 uppercase tracking-widest ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-500'}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{log.table_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{log.description}</td>
                    <td className="px-4 py-3 text-[11px] text-gray-500">{log.changed_by_name ?? <span className="text-gray-300 italic">Sistema</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50/50">
            <span className="text-[10px] text-gray-400">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 border border-gray-200 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 border border-gray-200 text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
