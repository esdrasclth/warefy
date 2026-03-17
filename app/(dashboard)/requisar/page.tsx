'use client';
import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Printer, Trash2, Eye, Loader2, Check, X, TrendingUp, ClipboardList, Wallet, Activity, Calendar, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import type { Requisition, RequisitionItem, RequisitionStatus, UserProfile } from '@/types';

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
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [areaMetrics, setAreaMetrics] = useState<AreaMetrics | null>(null);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [isExporting, setIsExporting] = useState(false);

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

    setAreaMetrics({
      consumoMes,
      requisasMes: requisasMes || 0,
      presupuestoAsignado,
      presupuestoDisponible,
    });
  };

  const fetchProfileAndRequisitions = async () => {
    setIsLoading(true);

    // 1. Obtener perfil
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, employees(*)')
      .eq('id', session.user.id)
      .single();

    setUserProfile(profile);
    if (profile) {
      await fetchAreaMetrics(profile);
    }

    // 2. Obtener requisas con filtro opcional
    let query = supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items ( quantity )
      `);

    // Si es Usuario Normal, filtrar por su Ã¡rea
    if (profile?.role === 'USER' && profile.employees?.area_id) {
      query = query.eq('area_id', profile.employees.area_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching requisitions:', error);
    } else if (data) {
      setRequisitions(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProfileAndRequisitions();

    const channel = supabase
      .channel('requisitions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requisitions' },
        () => {
          fetchProfileAndRequisitions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDelete = async (id: string) => {
    // SECURITY: RLS policy 'requisitions_delete_admin' garantiza que
    // solo ADMIN puede eliminar en la BD. Este botÃ³n solo se muestra
    // en el frontend para ADMIN, pero el backend lo refuerza tambiÃ©n.
    if (confirm(`Â¿EstÃ¡s seguro de eliminar permanentemente la requisa?`)) {
      const { error } = await supabase.from('requisitions').delete().eq('id', id);
      if (error) alert('Error eliminando requisa: ' + error.message);
      else fetchProfileAndRequisitions();
    }
  };

  const updateStatus = async (id: string, newStatus: RequisitionStatus) => {
    if (confirm(`¿Estás seguro de marcar esta requisa como ${newStatus}?`)) {
      try {
        const response = await fetch('/api/requisitions/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requisitionId: id, status: newStatus })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        fetchProfileAndRequisitions();
      } catch (error: any) {
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

  const filteredRequisitions = requisitions.filter(req => {
    const statusStr = (req.status || '').toUpperCase() as RequisitionStatus;
    const areaStr = req.area_name || '';

    // items count calculation
    const totalItems = req.requisition_items?.reduce((acc: number, curr: RequisitionItem) => acc + (curr.quantity || 0), 0) || 0;

    // 1. Status Filter
    if (statusFilter !== 'TODAS' && statusStr !== statusFilter) return false;

    // 2. Search Query (ID, Area, Status, Items)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = req.id.toLowerCase().includes(q)
        || areaStr.toLowerCase().includes(q)
        || statusStr.toLowerCase().includes(q)
        || totalItems.toString().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const handleExportExcel = async () => {
    if (!dateFrom || !dateTo) return alert('Selecciona un rango de fechas vÃ¡lido.');
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
            'Fecha': req?.created_at
              ? new Date(req.created_at).toLocaleDateString('es-HN') : 'â€”',
            'NÃºmero de Requisa': req?.consecutive
              ? `REQ-${String(req.consecutive).padStart(6, '0')}` : 'â€”',
            'Estado': req?.status || 'â€”',
            'Ãrea': req?.area_name || 'â€”',
            'CÃ³digo Producto': inv?.code || 'â€”',
            'DescripciÃ³n Producto': inv?.name || 'â€”',
            'CategorÃ­a': cat?.name || 'Sin CategorÃ­a',
            'Cantidad Solicitada': Number(item.quantity) || 0,
            'Cantidad Entregada': cantEntregada,
            'CÃ³digo Solicitante': req?.requester_code || 'â€”',
            'Nombre Solicitante': req?.requester_name || 'â€”',
            'Precio Unitario (USD)': precioUnit,
            'Total (USD)': cantEntregada * precioUnit,
            'Comentarios': req?.comments || 'â€”',
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Requisas</h1>
          <p className="text-gray-500 mt-2 text-sm">CreaciÃ³n y seguimiento de solicitudes de material.</p>
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
            <span className="text-gray-300 text-sm">â€”</span>
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
            {isExporting
              ? <Loader2 size={16} className="animate-spin" />
              : <FileSpreadsheet size={16} />
            }
            {isExporting ? 'Exportandoâ€¦' : 'Descargar Excel'}
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

      {/* MÃ©tricas del Ãrea */}
      {!isLoading && areaMetrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 border-l-4 border-l-sky-500 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Consumo del Mes
                </p>
                <p className="text-xl font-light text-primary tracking-tight truncate">
                  ${areaMetrics.consumoMes.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu Ã¡rea')}
                </p>
              </div>
              <div className="p-2 ml-3 shrink-0 bg-sky-500 text-white">
                <TrendingUp size={16} strokeWidth={2} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 border-l-4 border-l-blue-500 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Requisas del Mes
                </p>
                <p className="text-xl font-light text-primary tracking-tight truncate">
                  {areaMetrics.requisasMes.toLocaleString()}
                </p>
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu Ã¡rea')}
                </p>
              </div>
              <div className="p-2 ml-3 shrink-0 bg-blue-500 text-white">
                <ClipboardList size={16} strokeWidth={2} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 border-l-4 border-l-primary p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Presupuesto Asignado
                </p>
                {areaMetrics.presupuestoAsignado === null ? (
                  <p className="text-gray-400 text-sm italic">Sin lÃ­mite</p>
                ) : (
                  <p className="text-xl font-light text-primary tracking-tight truncate">
                    ${areaMetrics.presupuestoAsignado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                )}
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu Ã¡rea')}
                </p>
              </div>
              <div className="p-2 ml-3 shrink-0 bg-primary text-white">
                <Wallet size={16} strokeWidth={2} />
              </div>
            </div>
          </div>

          <div className={`bg-white border border-gray-100 border-l-4 p-4 shadow-sm ${areaMetrics.presupuestoDisponible !== null && areaMetrics.presupuestoDisponible < 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Presupuesto Disponible
                </p>
                {areaMetrics.presupuestoDisponible === null ? (
                  <p className="text-gray-400 text-sm italic">Sin lÃ­mite</p>
                ) : (
                  <p className={`text-xl font-light tracking-tight truncate ${areaMetrics.presupuestoDisponible < 0 ? 'text-red-600' : 'text-primary'}`}>
                    ${areaMetrics.presupuestoDisponible.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                )}
                <p className="text-[9px] text-gray-400 mt-1 truncate">
                  {userProfile?.role === 'ADMIN' ? 'Global' : (userProfile?.employees?.area_name || 'Tu Ã¡rea')}
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
            placeholder="Buscar por cÃ³digo, Ã¡rea, solicitante o estado..."
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
            Listado de Requisas â€” {filteredRequisitions.length.toLocaleString()} resultados
          </h2>
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
                <th className="py-2 px-6 w-[140px]">CÃ³digo</th>
                <th className="py-2 px-6 w-[150px]">Ãrea</th>
                <th className="py-2 px-6 w-[180px]">Solicitante</th>
                <th className="py-2 px-6 w-[100px]">Fecha</th>
                <th className="py-2 px-6 w-[100px] text-center">ArtÃ­culos</th>
                <th className="py-2 px-6 w-[130px] text-center">Estado</th>
                <th className="py-2 px-6 w-[140px] text-center sticky right-0 bg-gray-50 border-l border-gray-100 z-10">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRequisitions.length > 0 ? (
                filteredRequisitions.map((req) => {
                  const totalItems = req.requisition_items?.reduce((acc: number, curr: RequisitionItem) => acc + (curr.quantity || 0), 0) || 0;
                  const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString() : '-';
                  const isAdminOrAlmacen = userProfile?.role === 'ADMIN' || userProfile?.role === 'ALMACEN';
                  const isUser = userProfile?.role === 'USER';
                  const isOwnArea = req.area_id === userProfile?.employees?.area_id;

                  return (
                    <tr key={req.id} className="hover:bg-blue-50/20 transition-colors group">
                      <td className="py-2 px-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-primary">REQ-{String(req.consecutive || 0).padStart(6, '0')}</span>
                          <span className="text-[9px] text-gray-400 font-mono truncate">{req.id.split('-')[0]}...</span>
                        </div>
                      </td>
                      <td className="py-2 px-6">
                        <span className="text-xs text-gray-700 font-medium truncate block">{req.area_name || 'Sin Ãrea'}</span>
                      </td>
                      <td className="py-2 px-6">
                        <span className="text-xs text-gray-600 truncate block">{req.requester_name || 'AnÃ³nimo'}</span>
                      </td>
                      <td className="py-2 px-6 text-xs text-gray-500 italic">
                        {dateStr}
                      </td>
                      <td className="py-2 px-6 text-xs text-center font-bold text-primary">
                        {totalItems}
                      </td>
                      <td className="py-2 px-6 text-center">
                        <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border ${getStatusColor(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="py-2 px-6 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10">
                        <div className="flex items-center justify-center gap-2">
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
                          >
                            <Printer size={14} />
                          </Link>
                          <Link href={`/requisar/${req.id}`} className="p-1 text-gray-400 hover:text-primary transition-colors" title="Detalles">
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
      </div>
    </div>
  );
}
