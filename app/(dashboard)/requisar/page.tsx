'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Printer, Trash2, Eye, Loader2, Check, X, TrendingUp, ClipboardList, Wallet, Activity, Calendar, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import type { Requisition, RequisitionItem, RequisitionStatus, UserProfile } from '@/types';

const ITEMS_PER_PAGE = 50;

interface AreaMetrics {
  consumoMes: number;
  requisasMes: number;
  presupuestoAsignado: number | null;
  presupuestoDisponible: number | null;
}

export default function RequisarPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | RequisitionStatus>('TODAS');

  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [areaMetrics, setAreaMetrics] = useState<AreaMetrics | null>(null);

  const profileRef = useRef<UserProfile | null>(null);
  const pageRef = useRef(0);
  useEffect(() => { pageRef.current = page; }, [page]);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const fetchAreaMetrics = async (profile: UserProfile) => {
    const startOfMonth = new Date(
      new Date().getFullYear(), new Date().getMonth(), 1
    ).toISOString();

    const isAdmin = profile.role === 'ADMIN';
    const areaId = profile.employees?.area_id;

    let consumoQuery = supabase
      .from('requisitions')
      .select('total_cost')
      .neq('status', 'CANCELADA')
      .gte('created_at', startOfMonth);
    if (!isAdmin && areaId) consumoQuery = consumoQuery.eq('area_id', areaId);
    const { data: consumoData } = await consumoQuery;
    const consumoMes = consumoData?.reduce(
      (acc, r) => acc + (Number(r.total_cost) || 0), 0
    ) || 0;

    let countQuery = supabase
      .from('requisitions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth);
    if (!isAdmin && areaId) countQuery = countQuery.eq('area_id', areaId);
    const { count: requisasMes } = await countQuery;

    let presupuestoAsignado: number | null = null;
    if (!isAdmin && areaId) {
      const { data: budgetData } = await supabase
        .from('area_budgets')
        .select('monthly_budget')
        .eq('area_id', areaId)
        .single();
      if (budgetData?.monthly_budget > 0) {
        presupuestoAsignado = Number(budgetData?.monthly_budget || 0);
      }
    } else if (isAdmin) {
      const { data: allBudgets } = await supabase
        .from('area_budgets')
        .select('monthly_budget');
      const total = allBudgets?.reduce(
        (acc, b) => acc + (Number(b.monthly_budget) || 0), 0
      ) || 0;
      presupuestoAsignado = total > 0 ? total : null;
    }

    const presupuestoDisponible = presupuestoAsignado !== null
      ? presupuestoAsignado - consumoMes
      : null;

    setAreaMetrics({ consumoMes, requisasMes: requisasMes || 0, presupuestoAsignado, presupuestoDisponible });
  };

  const fetchRequisitions = async (
    profile: UserProfile,
    opts: { page: number; search: string; status: 'TODAS' | RequisitionStatus }
  ) => {
    const offset = opts.page * ITEMS_PER_PAGE;
    setIsLoading(true);

    let query = supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items ( quantity, delivered_quantity, unit_cost, inventory_items ( name, code ) )
      `, { count: 'exact' });

    if (profile.role === 'USER' && profile.employees?.area_id) {
      query = query.eq('area_id', profile.employees.area_id);
    }

    if (opts.status !== 'TODAS') {
      query = query.eq('status', opts.status);
    }

    if (opts.search.trim()) {
      query = query.or(
        `id.ilike.%${opts.search}%,area_name.ilike.%${opts.search}%,requester_name.ilike.%${opts.search}%`
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1);

    if (!error && data) {
      setRequisitions(data);
      setTotalCount(count || 0);
    } else if (error) {
      console.error('Error fetching requisitions:', error);
    }

    setIsLoading(false);
  };

  // Carga inicial: perfil + métricas + primera página
  useEffect(() => {
    const init = async () => {
      // Mostrar nueva requisa de inmediato si viene de crear una
      const stored = sessionStorage.getItem('warefy_new_requisition');
      if (stored) {
        try {
          const newReq = JSON.parse(stored);
          sessionStorage.removeItem('warefy_new_requisition');
          setRequisitions([newReq]);
          setTotalCount(1);
        } catch {}
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*, employees(*)')
        .eq('id', session.user.id)
        .single();

      profileRef.current = profile;
      setUserProfile(profile);

      if (profile) {
        await fetchAreaMetrics(profile);
        await fetchRequisitions(profile, { page: 0, search: '', status: 'TODAS' });
      }
    };

    init();

    const channel = supabase
      .channel('requisitions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, () => {
        if (profileRef.current) {
          setSearchQuery(prev => { fetchRequisitions(profileRef.current!, { page: pageRef.current, search: prev, status: statusFilter }); return prev; });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch cuando cambian los filtros (resetea a página 0)
  useEffect(() => {
    if (!profileRef.current) return;
    setPage(0);
    fetchRequisitions(profileRef.current, { page: 0, search: searchQuery, status: statusFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter]);

  // Re-fetch cuando cambia la página
  useEffect(() => {
    if (!profileRef.current) return;
    fetchRequisitions(profileRef.current, { page, search: searchQuery, status: statusFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleDelete = async (id: string) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente la requisa?`)) {
      // Optimistic: remover inmediatamente de la UI
      const snapshot = requisitions;
      setRequisitions(prev => prev.filter(r => r.id !== id));
      setTotalCount(prev => prev - 1);

      const { error } = await supabase.from('requisitions').delete().eq('id', id);
      if (error) {
        // Revertir si falla
        setRequisitions(snapshot);
        setTotalCount(prev => prev + 1);
        alert('Error eliminando requisa: ' + error.message);
      }
    }
  };

  const updateStatus = async (id: string, newStatus: RequisitionStatus) => {
    if (confirm(`¿Estás seguro de marcar esta requisa como ${newStatus}?`)) {
      // Optimistic: actualizar estado en UI antes de esperar al servidor
      const snapshot = requisitions;
      setRequisitions(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));

      try {
        const response = await fetch('/api/requisitions/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requisitionId: id, status: newStatus })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
      } catch (error: any) {
        // Revertir si falla
        setRequisitions(snapshot);
        alert('Error actualizando estado: ' + error.message);
      }
    }
  };

  const getStatusColor = (status: RequisitionStatus) => {
    switch (status) {
      case 'ENTREGADA': return 'text-green-600 border-green-200 bg-green-50';
      case 'CANCELADA': return 'text-red-500 border-red-200 bg-red-50';
      case 'PENDIENTE': return 'text-blue-600 border-blue-200 bg-blue-50';
      case 'PENDIENTE DE APROBACION': return 'text-orange-600 border-orange-200 bg-orange-50';
      default: return 'text-gray-500 border-gray-200 bg-gray-50';
    }
  };

  const handleExportExcel = async () => {
    if (!dateFrom || !dateTo) return alert('Selecciona un rango de fechas válido.');
    setIsExporting(true);

    try {
      const isAdmin = userProfile?.role === 'ADMIN';
      const areaId = userProfile?.employees?.area_id;

      let query = supabase
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
            area_id,
            status
          )
        `)
        .gte('created_at', `${dateFrom}T00:00:00Z`)
        .lte('created_at', `${dateTo}T23:59:59Z`)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) { alert('Error al exportar: ' + error.message); return; }

      const exportRows = (data || [])
        .filter((item: any) => {
          const req = item.requisitions as any;
          if (!req || req.status === 'CANCELADA') return false;
          if (!isAdmin && areaId && req.area_id !== areaId) return false;
          return true;
        })
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
            'Área': req?.area_name || '—',
            'Código Producto': inv?.code || '—',
            'Descripción Producto': inv?.name || '—',
            'Categoría': cat?.name || 'Sin Categoría',
            'Cantidad Solicitada': Number(item.quantity) || 0,
            'Cantidad Entregada': cantEntregada,
            'Código Solicitante': req?.requester_code || '—',
            'Nombre Solicitante': req?.requester_name || '—',
            'Precio Unitario (USD)': precioUnit,
            'Total (USD)': cantEntregada * precioUnit,
            'Comentarios': req?.comments || '—',
          };
        });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 16 },
        { wch: 40 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 40 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Requisas');
      XLSX.writeFile(wb, `requisas_${dateFrom}_${dateTo}.xlsx`);

    } catch (e: any) {
      alert('Error inesperado: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Requisas</h1>
          <p className="text-gray-500 mt-2 text-sm">Creación y seguimiento de solicitudes de material.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 h-10 shadow-sm">
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
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 h-10 text-sm font-bold tracking-wide transition-colors shadow-sm disabled:opacity-60"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {isExporting ? 'Exportando…' : 'Descargar Excel'}
          </button>
          <Link
            href="/requisar/nueva"
            className="flex items-center gap-2 bg-primary text-background px-5 h-10 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nueva Requisa
          </Link>
        </div>
      </div>

      {/* Métricas del Área */}
      {!isLoading && areaMetrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Consumo del Mes</p>
                <p className="text-xl font-light text-primary tracking-tight truncate">
                  ${areaMetrics.consumoMes.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu área')}
                </p>
              </div>
              <div className="p-2 ml-3 shrink-0 bg-sky-500 text-white"><TrendingUp size={16} strokeWidth={2} /></div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Requisas del Mes</p>
                <p className="text-xl font-light text-primary tracking-tight truncate">
                  {areaMetrics.requisasMes.toLocaleString()}
                </p>
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu área')}
                </p>
              </div>
              <div className="p-2 ml-3 shrink-0 bg-blue-500 text-white"><ClipboardList size={16} strokeWidth={2} /></div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Presupuesto Asignado</p>
                {areaMetrics.presupuestoAsignado === null ? (
                  <p className="text-gray-400 text-sm italic">Sin límite</p>
                ) : (
                  <p className="text-xl font-light text-primary tracking-tight truncate">
                    ${areaMetrics.presupuestoAsignado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                )}
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu área')}
                </p>
              </div>
              <div className="p-2 ml-3 shrink-0 bg-primary text-white"><Wallet size={16} strokeWidth={2} /></div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Presupuesto Disponible</p>
                {areaMetrics.presupuestoDisponible === null ? (
                  <p className="text-gray-400 text-sm italic">Sin límite</p>
                ) : (
                  <p className={`text-xl font-light tracking-tight truncate ${areaMetrics.presupuestoDisponible < 0 ? 'text-red-600' : 'text-primary'}`}>
                    ${areaMetrics.presupuestoDisponible.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                )}
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu área')}
                </p>
              </div>
              <div className={`p-2 ml-3 shrink-0 text-white ${areaMetrics.presupuestoDisponible !== null && areaMetrics.presupuestoDisponible < 0 ? 'bg-red-500' : 'bg-green-500'}`}>
                <Activity size={16} strokeWidth={2} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
          <div className="pl-4 pr-3 flex items-center pointer-events-none">
            <Search className="text-gray-400 group-focus-within:text-primary transition-colors" size={20} strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder="Buscar por código, área o solicitante..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-2 bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(['TODAS', 'PENDIENTE', 'PENDIENTE DE APROBACION', 'ENTREGADA', 'CANCELADA'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${statusFilter === status
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden relative min-h-[400px]">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Listado de Requisas — {totalCount.toLocaleString()} resultados
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-white/60 font-medium">
              Página {page + 1} de {totalPages}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        )}

        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse table-fixed min-w-[1000px] lg:min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                <th className="py-2 px-6 w-[140px]">Código</th>
                <th className="py-2 px-6 w-[150px]">Área</th>
                <th className="py-2 px-6 w-[180px]">Solicitante</th>
                <th className="py-2 px-6 w-[100px]">Fecha</th>
                <th className="py-2 px-6 w-[100px] text-center">Artículos</th>
                <th className="py-2 px-6 w-[130px] text-center">Estado</th>
                <th className="py-2 px-6 w-[140px] text-center sticky right-0 bg-gray-50 border-l border-gray-100 z-10">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requisitions.length > 0 ? (
                requisitions.map((req) => {
                  const totalItems = req.requisition_items?.reduce((acc: number, curr: RequisitionItem) => acc + (curr.quantity || 0), 0) || 0;
                  const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString() : '-';
                  const isAdminOrAlmacen = userProfile?.role === 'ADMIN' || userProfile?.role === 'ALMACEN';
                  const isUser = userProfile?.role === 'USER';
                  const isOwnArea = req.area_id === userProfile?.employees?.area_id;

                  return (
                    <React.Fragment key={req.id}>
                      <tr className={`transition-colors group cursor-pointer ${expandedRows.has(req.id) ? 'bg-blue-50/30' : 'hover:bg-blue-50/20'}`} onClick={() => toggleRow(req.id)}>
                        <td className="py-2 px-6">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-primary">REQ-{String(req.consecutive || 0).padStart(6, '0')}</span>
                            <span className="text-[9px] text-gray-400 font-mono truncate">{req.id.split('-')[0]}...</span>
                          </div>
                        </td>
                        <td className="py-2 px-6">
                          <span className="text-xs text-gray-700 font-medium truncate block">{req.area_name || 'Sin Área'}</span>
                        </td>
                        <td className="py-2 px-6">
                          <span className="text-xs text-gray-600 truncate block">{req.requester_name || 'Anónimo'}</span>
                        </td>
                        <td className="py-2 px-6 text-xs text-gray-500 italic">{dateStr}</td>
                        <td className="py-2 px-6 text-xs text-center font-bold text-primary">{totalItems}</td>
                        <td className="py-2 px-6 text-center">
                          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border ${getStatusColor(req.status)}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="py-2 px-6 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => toggleRow(req.id)}
                              className={`transition-colors p-1 ${expandedRows.has(req.id) ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
                              title="Ver detalle"
                            >
                              {expandedRows.has(req.id) ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
                            </button>
                            {req.status === 'PENDIENTE' && (
                              <>
                                {isAdminOrAlmacen && (
                                  <button
                                    onClick={() => updateStatus(req.id, 'ENTREGADA')}
                                    className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                                    title="Entregar"
                                  >
                                    <Check size={14} strokeWidth={3} />
                                  </button>
                                )}
                                {(isAdminOrAlmacen || (isUser && isOwnArea)) && (
                                  <button
                                    onClick={() => updateStatus(req.id, 'CANCELADA')}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Cancelar"
                                  >
                                    <X size={14} strokeWidth={3} />
                                  </button>
                                )}
                              </>
                            )}
                            {req.status === 'PENDIENTE DE APROBACION' && isAdminOrAlmacen && (
                              <button
                                onClick={() => updateStatus(req.id, 'PENDIENTE')}
                                className="p-1 text-orange-400 hover:text-orange-600 transition-colors"
                                title="Autorizar"
                              >
                                <Check size={14} strokeWidth={3} />
                              </button>
                            )}
                            <Link
                              href={`/requisar/${req.id}?print=true`}
                              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                              title="Imprimir"
                              onClick={e => e.stopPropagation()}
                            >
                              <Printer size={14} />
                            </Link>
                            <Link href={`/requisar/${req.id}`} className="p-1 text-gray-400 hover:text-primary transition-colors" title="Detalles" onClick={e => e.stopPropagation()}>
                              <Eye size={14} />
                            </Link>
                            {userProfile?.role === 'ADMIN' && req.status !== 'ENTREGADA' && (
                              <button
                                onClick={() => handleDelete(req.id)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(req.id) && (
                        <tr key={`${req.id}-detail`} className="bg-gray-50/80 border-b border-gray-100">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="pl-4 border-l-2 border-primary/20">
                              {(req.requisition_items as any[])?.length > 0 ? (
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="text-[9px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200">
                                      <th className="pb-1.5 pr-4">Código</th>
                                      <th className="pb-1.5 pr-4">Producto</th>
                                      <th className="pb-1.5 pr-4 text-right">Cant. Solicitada</th>
                                      <th className="pb-1.5 pr-4 text-right">Cant. Entregada</th>
                                      <th className="pb-1.5 pr-4 text-right">Costo Unit. ($)</th>
                                      <th className="pb-1.5 text-right">Subtotal ($)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {(req.requisition_items as any[]).map((item: any, i: number) => {
                                      const qty = item.quantity ?? 0;
                                      const delivered = item.delivered_quantity ?? (req.status === 'ENTREGADA' ? qty : null);
                                      const unitCost = item.unit_cost ?? 0;
                                      return (
                                        <tr key={i} className="text-gray-600">
                                          <td className="py-1.5 pr-4 font-mono text-[10px] text-gray-400">{item.inventory_items?.code || '-'}</td>
                                          <td className="py-1.5 pr-4 font-medium text-gray-700">{item.inventory_items?.name || '-'}</td>
                                          <td className="py-1.5 pr-4 text-right">{qty}</td>
                                          <td className="py-1.5 pr-4 text-right">
                                            {delivered !== null
                                              ? <span className="text-green-600 font-semibold">{delivered}</span>
                                              : <span className="text-gray-300">—</span>}
                                          </td>
                                          <td className="py-1.5 pr-4 text-right font-mono">{unitCost > 0 ? unitCost.toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}</td>
                                          <td className="py-1.5 text-right font-bold text-primary">{unitCost > 0 ? (qty * unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}</td>
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
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                    {isLoading ? 'Cargando requisas...' : 'No se encontraron requisas con los filtros actuales.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={ITEMS_PER_PAGE}
          itemLabel="requisas"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
