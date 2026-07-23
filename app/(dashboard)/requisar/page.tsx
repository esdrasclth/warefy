'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Printer, Trash2, Eye, Loader2, Check, X, TrendingUp, ClipboardList, Wallet, Activity, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import Pagination from '@/components/ui/Pagination';
import { supabase } from '@/utils/supabase/client';
import { useUrlFilterState } from '@/utils/useUrlFilterState';
import Link from 'next/link';
import type { Requisition, RequisitionItem, RequisitionStatus, UserProfile } from '@/types';
import SignaturePad, { type SignaturePadHandle } from '@/components/ui/SignaturePad';

const ITEMS_PER_PAGE = 50;

interface AreaMetrics {
  consumoMes: number;
  requisasMes: number;
  presupuestoAsignado: number | null;
  presupuestoDisponible: number | null;
}

export default function RequisarPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [searchQuery, setSearchQuery] = useUrlFilterState('q', '', { debounceMs: 300 });
  const [statusFilterRaw, setStatusFilter] = useUrlFilterState('estado', 'TODAS');
  const statusFilter = statusFilterRaw as 'TODAS' | RequisitionStatus;
  const [monthFilter, setMonthFilter] = useUrlFilterState('mes', currentMonth);

  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [areaMetrics, setAreaMetrics] = useState<AreaMetrics | null>(null);

  const profileRef = useRef<UserProfile | null>(null);
  const pageRef = useRef(0);
  useEffect(() => { pageRef.current = page; }, [page]);
  const monthRef = useRef(monthFilter);
  useEffect(() => { monthRef.current = monthFilter; }, [monthFilter]);
  const statusRef = useRef<'TODAS' | RequisitionStatus>(statusFilter);
  useEffect(() => { statusRef.current = statusFilter; }, [statusFilter]);
  const searchRef = useRef(searchQuery);
  useEffect(() => { searchRef.current = searchQuery; }, [searchQuery]);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [signReqId, setSignReqId] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const signatureRef = useRef<SignaturePadHandle>(null);

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Área principal + áreas supervisadas (gerentes). Vacío para ADMIN (ve todo).
  const monthLabel = (m: string) => {
    if (!m) return 'Todos los meses';
    const [y, mm] = m.split('-').map(Number);
    return new Date(y, mm - 1, 1).toLocaleDateString('es-HN', { month: 'long', year: 'numeric' });
  };

  const getAreaIds = (profile: UserProfile): string[] => {
    const ids = new Set<string>();
    if (profile.employees?.area_id) ids.add(profile.employees.area_id);
    (profile.employees?.managed_areas || []).forEach(a => { if (a?.id) ids.add(a.id); });
    return Array.from(ids);
  };

  const fetchAreaMetrics = async (profile: UserProfile, month: string) => {
    const [my, mm] = (month || currentMonth).split('-').map(Number);
    const startOfMonth = new Date(my, mm - 1, 1).toISOString();
    const endOfMonth = new Date(my, mm, 1).toISOString();

    const isAdmin = profile.role === 'ADMIN';
    const isUser = profile.role === 'USER';
    const areaIds = getAreaIds(profile);
    const scopedByArea = !isAdmin && !isUser && areaIds.length > 0;

    const scope = <T extends { in: (c: string, v: string[]) => T; eq: (c: string, v: string) => T }>(q: T): T => {
      if (isUser) return q.eq('requester_code', profile.employees?.code ?? '__none__');
      if (scopedByArea) return q.in('area_id', areaIds);
      return q;
    };

    let consumoQuery = supabase
      .from('requisitions')
      .select('total_cost')
      .neq('status', 'CANCELADA')
      .gte('created_at', startOfMonth)
      .lt('created_at', endOfMonth);
    consumoQuery = scope(consumoQuery);
    const { data: consumoData } = await consumoQuery;
    const consumoMes = consumoData?.reduce(
      (acc, r) => acc + (Number(r.total_cost) || 0), 0
    ) || 0;

    let countQuery = supabase
      .from('requisitions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth)
      .lt('created_at', endOfMonth);
    countQuery = scope(countQuery);
    const { count: requisasMes } = await countQuery;

    let presupuestoAsignado: number | null = null;
    if (!isAdmin && areaIds.length > 0) {
      const { data: budgetData } = await supabase
        .from('area_budgets')
        .select('monthly_budget')
        .in('area_id', areaIds);
      const total = budgetData?.reduce(
        (acc, b) => acc + (Number(b.monthly_budget) || 0), 0
      ) || 0;
      presupuestoAsignado = total > 0 ? total : null;
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
    opts: { page: number; search: string; status: 'TODAS' | RequisitionStatus; month: string; silent?: boolean }
  ) => {
    const offset = opts.page * ITEMS_PER_PAGE;
    if (!opts.silent) setIsLoading(true);

    let query = supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items ( quantity, delivered_quantity, unit_cost, inventory_items ( name, code ) )
      `, { count: 'exact' });

    if (profile.role === 'USER') {
      query = query.eq('requester_code', profile.employees?.code ?? '__none__');
    } else if (profile.role === 'APROBADOR') {
      const areaIds = getAreaIds(profile);
      if (areaIds.length > 0) query = query.in('area_id', areaIds);
    }

    if (opts.status !== 'TODAS') {
      query = query.eq('status', opts.status);
    }

    if (opts.month) {
      const [y, m] = opts.month.split('-').map(Number);
      const start = new Date(y, m - 1, 1).toISOString();
      const end = new Date(y, m, 1).toISOString();
      query = query.gte('created_at', start).lt('created_at', end);
    }

    if (opts.search.trim()) {
      const term = opts.search.trim();
      const conditions = [
        `area_name.ilike.%${term}%`,
        `requester_name.ilike.%${term}%`,
      ];
      const digits = term.replace(/\D/g, '');
      if (digits) conditions.push(`consecutive.eq.${Number(digits)}`);
      query = query.or(conditions.join(','));
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

    if (!opts.silent) setIsLoading(false);
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

      const { data: rawProfile } = await supabase
        .from('profiles')
        .select('*, employees(*, employee_areas(areas(id, name)))')
        .eq('id', session.user.id)
        .single();

      const profile = rawProfile
        ? {
            ...rawProfile,
            employees: rawProfile.employees
              ? {
                  ...rawProfile.employees,
                  managed_areas: ((rawProfile.employees as any).employee_areas || [])
                    .map((ea: any) => ea.areas)
                    .filter(Boolean),
                }
              : rawProfile.employees,
          }
        : rawProfile;

      profileRef.current = profile;
      setUserProfile(profile);

      if (profile) {
        await fetchAreaMetrics(profile, monthRef.current);
        await fetchRequisitions(profile, { page: 0, search: searchRef.current, status: statusRef.current, month: monthRef.current });
      }
    };

    init();

    const channel = supabase
      .channel('requisitions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, () => {
        if (!profileRef.current) return;
        // Debounce + refresco silencioso: evita el parpadeo del skeleton cuando
        // otros usuarios cambian estatus, y coalesce rafagas de cambios.
        if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
        realtimeTimer.current = setTimeout(() => {
          fetchRequisitions(profileRef.current!, { page: pageRef.current, search: searchRef.current, status: statusRef.current, month: monthRef.current, silent: true });
        }, 400);
      })
      .subscribe();

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch cuando cambian los filtros (resetea a página 0)
  useEffect(() => {
    if (!profileRef.current) return;
    setPage(0);
    fetchRequisitions(profileRef.current, { page: 0, search: searchQuery, status: statusFilter, month: monthFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, monthFilter]);

  // Re-fetch cuando cambia la página
  useEffect(() => {
    if (!profileRef.current) return;
    fetchRequisitions(profileRef.current, { page, search: searchQuery, status: statusFilter, month: monthFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Recalcular métricas de las cards cuando cambia el mes.
  // La carga inicial la hace init(); este efecto solo reacciona a cambios de mes.
  useEffect(() => {
    if (!profileRef.current) return;
    fetchAreaMetrics(profileRef.current, monthFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar requisa',
      message: '¿Estás seguro de eliminar permanentemente la requisa?',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (ok) {
      // Optimistic: remover inmediatamente de la UI
      const snapshot = requisitions;
      setRequisitions(prev => prev.filter(r => r.id !== id));
      setTotalCount(prev => prev - 1);

      const { error } = await supabase.from('requisitions').delete().eq('id', id);
      if (error) {
        // Revertir si falla
        setRequisitions(snapshot);
        setTotalCount(prev => prev + 1);
        toast.error('Error eliminando requisa: ' + error.message);
      }
    }
  };

  const updateStatus = async (id: string, newStatus: RequisitionStatus) => {
    const ok = await confirm({
      title: 'Cambiar estado',
      message: `¿Estás seguro de marcar esta requisa como ${newStatus}?`,
      confirmText: 'Confirmar',
    });
    if (ok) {
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
        toast.error('Error actualizando estado: ' + error.message);
      }
    }
  };

  const submitApproval = async () => {
    const pad = signatureRef.current;
    if (!pad || pad.isEmpty() || !signReqId) {
      toast.error('Debe firmar para autorizar la requisa.');
      return;
    }
    setIsApproving(true);
    try {
      const blob = await pad.toBlob();
      if (!blob) throw new Error('No se pudo capturar la firma.');

      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('requisitionId', signReqId);
      formData.append('signature', blob, 'signature.png');

      const response = await fetch('/api/requisitions/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      toast.success('Requisa autorizada correctamente.');
      setRequisitions(prev => prev.map(r => r.id === signReqId ? { ...r, status: 'PENDIENTE' } : r));
      setSignReqId(null);
      setHasSignature(false);
    } catch (error: any) {
      toast.error('Error al autorizar: ' + error.message);
    } finally {
      setIsApproving(false);
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

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Requisas</h1>
          <p className="text-gray-500 mt-2 text-sm">Creación y seguimiento de solicitudes de material.</p>
        </div>
        <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-1">
          <Link
            href="/requisar/nueva"
            className="flex items-center justify-center gap-2 bg-primary text-background px-5 h-11 sm:h-10 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent w-full sm:w-auto"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nueva Requisa
          </Link>
          <p className="text-[11px] text-gray-400 text-center sm:text-right capitalize">
            Mostrando: {monthLabel(monthFilter)}
          </p>
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
            name="search-requisitions"
            placeholder="Buscar por código, área o solicitante..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-2 bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
          />
          <div className="relative shrink-0 border-l border-gray-100 pl-2 ml-2">
            <div
              className={`p-2 pointer-events-none transition-colors ${monthFilter && monthFilter !== currentMonth ? 'text-primary' : 'text-gray-400'}`}
            >
              <Calendar size={20} strokeWidth={1.5} />
            </div>
            <input
              ref={monthInputRef}
              type="month"
              name="month-filter"
              value={monthFilter}
              max={currentMonth}
              onChange={(e) => setMonthFilter(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              title={`Filtrar por mes — ${monthLabel(monthFilter)}`}
              aria-label="Filtrar por mes"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(['TODAS', 'PENDIENTE', 'PENDIENTE DE APROBACION', 'ENTREGADA', 'CANCELADA'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-widest border transition-colors whitespace-nowrap flex-shrink-0 ${statusFilter === status
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
            >
              <span className="sm:hidden">{status === 'PENDIENTE DE APROBACION' ? 'POR APROBAR' : status}</span>
              <span className="hidden sm:inline">{status}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden relative min-h-[400px]">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            <span className="hidden sm:inline">Listado de Requisas — </span>{totalCount.toLocaleString()} resultado(s)
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

        {/* Vista móvil: tarjetas */}
        <div className="md:hidden divide-y divide-gray-100">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="border border-gray-100 p-4 space-y-3 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-4 bg-gray-100 w-32" />
                    <div className="h-4 bg-gray-100 w-20" />
                  </div>
                  <div className="h-3 bg-gray-100 w-full" />
                  <div className="h-3 bg-gray-100 w-2/3" />
                </div>
              ))}
            </div>
          ) : requisitions.length > 0 ? (
            requisitions.map((req) => {
              const totalItems = req.requisition_items?.reduce((acc: number, curr: RequisitionItem) => acc + (curr.quantity || 0), 0) || 0;
              const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString() : '-';
              const isAdminOrAlmacen = userProfile?.role === 'ADMIN' || userProfile?.role === 'ALMACEN';
              const isUser = userProfile?.role === 'USER';
              const isOwnArea = !!userProfile && getAreaIds(userProfile).includes(req.area_id as string);
              const canApprove = userProfile?.role === 'ADMIN' ||
                (userProfile?.role === 'APROBADOR' && req.approver_code === userProfile?.employees?.code);
              const isExpanded = expandedRows.has(req.id);

              return (
                <div key={req.id} className="p-4 space-y-3">
                  {/* Encabezado de la tarjeta */}
                  <button className="w-full flex justify-between items-start gap-3 text-left" onClick={() => toggleRow(req.id)}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-primary">REQ-{String(req.consecutive || 0).padStart(6, '0')}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{dateStr}</p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 border flex-shrink-0 ${getStatusColor(req.status)}`}>
                      {req.status === 'PENDIENTE DE APROBACION' ? 'POR APROBAR' : req.status}
                    </span>
                  </button>

                  {/* Datos */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest">Área</p>
                      <p className="text-gray-700 font-medium truncate">{req.area_name || 'Sin Área'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest">Solicitante</p>
                      <p className="text-gray-700 truncate">{req.requester_name || 'Anónimo'}</p>
                    </div>
                  </div>

                  {/* Detalle expandible de productos */}
                  <button
                    onClick={() => toggleRow(req.id)}
                    className="w-full flex items-center justify-between bg-gray-50 border border-gray-100 px-3 py-2.5 text-xs text-gray-600"
                  >
                    <span><span className="font-bold text-primary">{totalItems}</span> artículo(s) solicitados</span>
                    {isExpanded ? <ChevronDown size={15} className="text-primary" /> : <ChevronRight size={15} className="text-gray-400" />}
                  </button>

                  {isExpanded && (
                    <div className="border-l-2 border-primary/20 pl-3 space-y-2">
                      {(req.requisition_items?.length ?? 0) > 0 ? (
                        (req.requisition_items as RequisitionItem[]).map((item, i) => {
                          const qty = item.quantity ?? 0;
                          const delivered = item.delivered_quantity ?? (req.status === 'ENTREGADA' ? qty : null);
                          return (
                            <div key={i} className="flex justify-between items-start gap-3 text-xs py-1 border-b border-gray-50 last:border-0">
                              <div className="min-w-0">
                                <p className="text-gray-700 font-medium leading-tight">{item.inventory_items?.name || '-'}</p>
                                <p className="text-[9px] text-gray-400 font-mono mt-0.5">{item.inventory_items?.code || '-'}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-gray-600">Sol: <span className="font-bold">{qty}</span></p>
                                <p className="text-[10px] mt-0.5">
                                  {delivered !== null
                                    ? <span className="text-green-600 font-semibold">Ent: {delivered}</span>
                                    : <span className="text-gray-300">Sin entregar</span>}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-gray-400 italic">Sin productos registrados.</p>
                      )}
                    </div>
                  )}

                  {/* Acciones táctiles */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {req.status === 'PENDIENTE' && isAdminOrAlmacen && (
                      <button
                        onClick={() => updateStatus(req.id, 'ENTREGADA')}
                        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-green-200 bg-green-50 text-green-700"
                      >
                        <Check size={13} strokeWidth={3} /> Entregar
                      </button>
                    )}
                    {req.status === 'PENDIENTE' && (isAdminOrAlmacen || (isUser && isOwnArea)) && (
                      <button
                        onClick={() => updateStatus(req.id, 'CANCELADA')}
                        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-red-200 bg-red-50 text-red-600"
                      >
                        <X size={13} strokeWidth={3} /> Cancelar
                      </button>
                    )}
                    {req.status === 'PENDIENTE DE APROBACION' && canApprove && (
                      <>
                        <button
                          onClick={() => setSignReqId(req.id)}
                          className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-orange-200 bg-orange-50 text-orange-600"
                        >
                          <Check size={13} strokeWidth={3} /> Autorizar
                        </button>
                        <button
                          onClick={() => updateStatus(req.id, 'CANCELADA')}
                          className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-red-200 bg-red-50 text-red-600"
                        >
                          <X size={13} strokeWidth={3} /> Rechazar
                        </button>
                      </>
                    )}
                    <Link
                      href={`/requisar/${req.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-gray-200 bg-white text-gray-600"
                    >
                      <Eye size={13} /> Ver
                    </Link>
                    <Link
                      href={`/requisar/${req.id}?print=true`}
                      className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-gray-200 bg-white text-gray-600"
                    >
                      <Printer size={13} /> Imprimir
                    </Link>
                    {userProfile?.role === 'ADMIN' && req.status !== 'ENTREGADA' && (
                      <button
                        onClick={() => handleDelete(req.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-gray-200 bg-white text-gray-400"
                      >
                        <Trash2 size={13} /> Eliminar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No se encontraron requisas con los filtros actuales.
            </div>
          )}
        </div>

        {/* Vista escritorio: tabla */}
        <div className="hidden md:block overflow-x-auto scrollbar-hide">
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
              {isLoading ? (
                <TableSkeleton rows={10} cols={8} />
              ) : requisitions.length > 0 ? (
                requisitions.map((req) => {
                  const totalItems = req.requisition_items?.reduce((acc: number, curr: RequisitionItem) => acc + (curr.quantity || 0), 0) || 0;
                  const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString() : '-';
                  const isAdminOrAlmacen = userProfile?.role === 'ADMIN' || userProfile?.role === 'ALMACEN';
                  const isUser = userProfile?.role === 'USER';
                  const isOwnArea = !!userProfile && getAreaIds(userProfile).includes(req.area_id as string);
                  const canApprove = userProfile?.role === 'ADMIN' ||
                    (userProfile?.role === 'APROBADOR' && req.approver_code === userProfile?.employees?.code);

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
                            {req.status === 'PENDIENTE DE APROBACION' && canApprove && (
                              <>
                                <button
                                  onClick={() => setSignReqId(req.id)}
                                  className="p-1 text-orange-400 hover:text-orange-600 transition-colors"
                                  title="Autorizar"
                                >
                                  <Check size={14} strokeWidth={3} />
                                </button>
                                <button
                                  onClick={() => updateStatus(req.id, 'CANCELADA')}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                  title="Rechazar"
                                >
                                  <X size={14} strokeWidth={3} />
                                </button>
                              </>
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
                    No se encontraron requisas con los filtros actuales.
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

      {signReqId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md shadow-xl border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-light text-primary">Firma de Autorización</h3>
              <button
                onClick={() => { if (!isApproving) { setSignReqId(null); setHasSignature(false); } }}
                className="p-1 text-gray-400 hover:text-primary transition-colors"
                disabled={isApproving}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Firme para autorizar la requisa. La firma quedará registrada en la impresión.
              </p>
              <SignaturePad ref={signatureRef} onChange={setHasSignature} />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setSignReqId(null); setHasSignature(false); }}
                  disabled={isApproving}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitApproval}
                  disabled={isApproving || !hasSignature}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 text-sm font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={16} strokeWidth={3} /> {isApproving ? 'Autorizando...' : 'Autorizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
