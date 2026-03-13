'use client';
import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Printer, Trash2, Eye, Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import type { Requisition, RequisitionItem, RequisitionStatus, UserProfile } from '@/types';

export default function RequisarPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | RequisitionStatus>('TODAS');
  
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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

    // 2. Obtener requisas con filtro opcional
    let query = supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items ( quantity )
      `);
    
    // Si es Usuario Normal, filtrar por su área
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
  }, []);

  const handleDelete = async (id: string) => {
    // SECURITY: RLS policy 'requisitions_delete_admin' garantiza que
    // solo ADMIN puede eliminar en la BD. Este botón solo se muestra
    // en el frontend para ADMIN, pero el backend lo refuerza también.
    if (confirm(`¿Estás seguro de eliminar permanentemente la requisa?`)) {
      const { error } = await supabase.from('requisitions').delete().eq('id', id);
      if (error) alert('Error eliminando requisa: ' + error.message);
      else fetchProfileAndRequisitions();
    }
  };

  const updateStatus = async (id: string, newStatus: RequisitionStatus) => {
    if (confirm(`¿Estás seguro de marcar esta requisa como ${newStatus}?`)) {
      const { error } = await supabase.from('requisitions').update({ status: newStatus }).eq('id', id);
      if (error) alert('Error actualizando estado: ' + error.message);
      else fetchProfileAndRequisitions();
    }
  };



  const getStatusColor = (status: RequisitionStatus) => {
    switch(status) {
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Requisas</h1>
          <p className="text-gray-500 mt-2 text-sm">Creación y seguimiento de solicitudes de material.</p>
        </div>
        <Link 
          href="/requisar/nueva"
          className="flex items-center gap-2 bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
        >
          <Plus size={18} strokeWidth={2.5} />
          Nueva Requisa
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
          <div className="pl-4 pr-3 flex items-center pointer-events-none">
            <Search className="text-gray-400 group-focus-within:text-primary transition-colors" size={20} strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder="Buscar por código, área, solicitante o estado..."
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
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                statusFilter === status 
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
            Listado de Requisas — {filteredRequisitions.length.toLocaleString()} resultados
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
              {filteredRequisitions.length > 0 ? (
                filteredRequisitions.map((req) => {
                  const totalItems = req.requisition_items?.reduce((acc: number, curr: RequisitionItem) => acc + (curr.quantity || 0), 0) || 0;
                  const dateStr = new Date(req.created_at).toLocaleDateString();
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
                        <span className="text-xs text-gray-700 font-medium truncate block">{req.area_name || 'Sin Área'}</span>
                      </td>
                      <td className="py-2 px-6">
                        <span className="text-xs text-gray-600 truncate block">{req.requester_name || 'Anónimo'}</span>
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
