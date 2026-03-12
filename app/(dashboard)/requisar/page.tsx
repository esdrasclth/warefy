'use client';
import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Printer, Trash2, Eye, Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';

type RequisitionStatus = 'PENDIENTE' | 'PENDIENTE DE APROBACION' | 'ENTREGADA' | 'CANCELADA';

export default function RequisarPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | RequisitionStatus>('TODAS');
  
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequisitions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items ( quantity )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching requisitions:', error);
    } else if (data) {
      setRequisitions(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRequisitions();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente la requisa?`)) {
      const { error } = await supabase.from('requisitions').delete().eq('id', id);
      if (error) alert('Error eliminando requisa: ' + error.message);
      else fetchRequisitions();
    }
  };

  const updateStatus = async (id: string, newStatus: RequisitionStatus) => {
    if (confirm(`¿Estás seguro de marcar esta requisa como ${newStatus}?`)) {
      const { error } = await supabase.from('requisitions').update({ status: newStatus }).eq('id', id);
      if (error) alert('Error actualizando estado: ' + error.message);
      else fetchRequisitions();
    }
  };



  const getStatusColor = (status: RequisitionStatus) => {
    switch(status) {
      case 'ENTREGADA': return 'text-green-600 border-green-200 bg-green-50';
      case 'CANCELADA': return 'text-red-500 border-red-200 bg-red-50';
      case 'PENDIENTE': return 'text-yellow-600 border-yellow-200 bg-yellow-50';
      case 'PENDIENTE DE APROBACION': return 'text-orange-600 border-orange-200 bg-orange-50';
      default: return 'text-gray-500 border-gray-200 bg-gray-50';
    }
  };

  const filteredRequisitions = requisitions.filter(req => {
    const statusStr = (req.status || '').toUpperCase() as RequisitionStatus;
    const areaStr = req.area_name || '';
    
    // items count calculation
    const totalItems = req.requisition_items?.reduce((acc: number, curr: any) => acc + (curr.quantity || 0), 0) || 0;

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
            placeholder="Buscar por código UUID, área, estado o cantidad..."
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

      {/* Grid List */}
      <div className="relative min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-[1px] z-20">
             <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRequisitions.length > 0 ? (
            filteredRequisitions.map((req) => {
              const totalItems = req.requisition_items?.reduce((acc: number, curr: any) => acc + (curr.quantity || 0), 0) || 0;
              const dateStr = new Date(req.created_at).toLocaleDateString();
              const shortenedId = req.id.split('-')[0];

              return (
                <div key={req.id} className="bg-white border border-gray-100 p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between min-h-[14rem] group relative">
                  
                  {/* Card Actions (Hover Overlay) */}
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                     {req.status === 'PENDIENTE' && (
                       <>
                         <button 
                          onClick={() => updateStatus(req.id, 'ENTREGADA')}
                          className="p-1.5 bg-gray-50 text-gray-400 hover:text-green-600 border border-gray-200 hover:border-green-300 transition-colors" 
                          title="Marcar como Entregada (Descuenta Inventario)"
                         >
                           <Check size={14} strokeWidth={3} />
                         </button>
                         <button 
                          onClick={() => updateStatus(req.id, 'CANCELADA')}
                          className="p-1.5 bg-gray-50 text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 transition-colors" 
                          title="Cancelar Requisa (Libera Inventario)"
                         >
                           <X size={14} strokeWidth={3} />
                         </button>
                       </>
                     )}
                     
                     {req.status === 'PENDIENTE DE APROBACION' && (
                       <button 
                         onClick={() => updateStatus(req.id, 'PENDIENTE')}
                         className="p-1.5 bg-orange-50 text-orange-400 hover:text-orange-600 border border-orange-200 hover:border-orange-600 transition-colors" 
                         title="Autorizar Exceso de Presupuesto/Límites"
                       >
                         <Check size={14} strokeWidth={3} />
                       </button>
                     )}
                     <Link 
                      href={`/requisar/${req.id}?print=true`}
                      className="p-1.5 bg-gray-50 text-gray-400 hover:text-blue-500 border border-gray-200 hover:border-blue-200 transition-colors inline-block" 
                      title="Imprimir Requisa en Media Carta"
                     >
                       <Printer size={14} />
                     </Link>
                     <button 
                      onClick={() => handleDelete(req.id)}
                      className="p-1.5 bg-gray-50 text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 transition-colors" 
                      title="Eliminar Requisa Permanentemente"
                     >
                       <Trash2 size={14} />
                     </button>
                  </div>

                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="font-light text-2xl tracking-tight text-primary group-hover:text-accent transition-colors block">REQ-{shortenedId}</span>
                      <span className="text-[10px] text-gray-400 font-mono tracking-wider">{req.id}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 my-auto z-10 relative">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Área: <span className="text-primary">{req.area_name || 'Sin Área'}</span>
                    </p>
                    <p className="text-sm text-gray-500">Artículos solicitados: <span className="font-semibold text-primary">{totalItems}</span></p>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mt-1">Solcitado por: <span className="text-gray-600 font-medium">{req.requester_name || 'Anónimo'}</span> el {dateStr}</p>
                  </div>

                  <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center z-10 w-full">
                    <span className={`text-[10px] font-bold px-2 py-1 border uppercase tracking-widest ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                    <Link href={`/requisar/${req.id}`} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-primary transition-colors">
                      <Eye size={14} /> Detalles
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            !isLoading && (
              <div className="col-span-full py-12 text-center text-gray-400 text-sm bg-white border border-gray-100 shadow-sm">
                No se encontraron requisas con los filtros actuales.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
