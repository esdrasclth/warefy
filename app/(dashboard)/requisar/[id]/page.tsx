'use client';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, FileText, Check, X, Printer, Package } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import { use } from 'react'; // Explicit unwrap for params

export default function RequisitionDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const reqId = params.id;
  const searchParams = useSearchParams();
  
  const [requisition, setRequisition] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deliveredQuantities, setDeliveredQuantities] = useState<Record<string, number>>({});
  
  const fetchRequisition = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items (
          id, quantity, unit_cost, inventory_item_id, delivered_quantity,
          inventory_items (
            code, name, units(name)
          )
        )
      `)
      .eq('id', reqId)
      .single();

    if (error) {
      console.error('Error fetching requisition details:', error);
    } else {
      setRequisition(data);
      if (data && data.status === 'PENDIENTE') {
        const initialQs: Record<string, number> = {};
        data.requisition_items?.forEach((item: any) => {
          initialQs[item.id] = item.quantity;
        });
        setDeliveredQuantities(initialQs);
      }
    }
    setIsLoading(false);
  };

  const fetchUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, employees(area_id)')
      .eq('id', session.user.id)
      .single();

    setUserProfile(profile || null);
  };

  useEffect(() => {
    fetchRequisition();
    fetchUserProfile();
  }, [reqId]);

  useEffect(() => {
    if (!isLoading && requisition && searchParams.get('print') === 'true') {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, requisition, searchParams]);

  const updateStatus = async (newStatus: 'ENTREGADA' | 'CANCELADA') => {
    if (confirm(`¿Estás seguro de marcar esta requisa como ${newStatus}?`)) {
      setIsLoading(true);
      if (newStatus === 'ENTREGADA') {
        const updatePromises = requisition.requisition_items.map((item: any) => 
          supabase.from('requisition_items').update({ delivered_quantity: deliveredQuantities[item.id] }).eq('id', item.id)
        );
        await Promise.all(updatePromises);
      }
      const { error } = await supabase.from('requisitions').update({ status: newStatus }).eq('id', reqId);
      if (error) {
        alert('Error actualizando estado: ' + error.message);
        setIsLoading(false);
      } else {
        fetchRequisition();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <FileText className="text-gray-300" size={64} />
        <h2 className="text-2xl font-light text-primary">Requisa no encontrada</h2>
        <Link href="/requisar" className="flex items-center gap-2 bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all">
          <ArrowLeft size={16} /> Volver al listado
        </Link>
      </div>
    );
  }

  const shortenedId = reqId.split('-')[0];
  const dateStr = new Date(requisition.created_at).toLocaleString();
  const isAdminOrAlmacen = userProfile?.role === 'ADMIN' || userProfile?.role === 'ALMACEN';
  const isUser = userProfile?.role === 'USER';
  const isOwnArea = requisition.area_id === userProfile?.employees?.area_id;
  
  const effectiveTotalItems = requisition.requisition_items?.reduce((acc: number, item: any) => {
    const qty = requisition.status === 'PENDIENTE' 
      ? (deliveredQuantities[item.id] ?? item.quantity)
      : (item.delivered_quantity ?? item.quantity);
    return acc + qty;
  }, 0) || 0;

  const effectiveTotalCost = requisition.requisition_items?.reduce((acc: number, item: any) => {
    const qty = requisition.status === 'PENDIENTE' 
      ? (deliveredQuantities[item.id] ?? item.quantity)
      : (item.delivered_quantity ?? item.quantity);
    return acc + (qty * (item.unit_cost || 0));
  }, 0) || 0;

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'ENTREGADA': return <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border text-green-600 border-green-200 bg-green-50">Entregada</span>;
      case 'CANCELADA': return <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border text-red-500 border-red-200 bg-red-50">Cancelada</span>;
      case 'PENDIENTE': return <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border text-blue-600 border-blue-200 bg-blue-50">Pendiente</span>;
      case 'PENDIENTE DE APROBACION': return <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border text-orange-600 border-orange-200 bg-orange-50">Pend. Aprobación</span>;
      default: return <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border text-gray-300 border-gray-100 bg-gray-50">{status}</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 print:space-y-4 pb-12 print:pb-0 animate-in fade-in duration-500">
      <style type="text/css" media="print">
        {`
          @page { size: 8.5in 5.5in landscape; margin: 0.2in; } /* Statement / Half-Letter Landscape */
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        `}
      </style>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:gap-2 bg-white p-6 print:p-3 border border-gray-100 shadow-sm print:shadow-none min-h-0">
        <div className="flex items-center gap-4">
          <Link href="/requisar" className="print:hidden p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-gray-50">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3 print:gap-1">
              <h1 className="text-3xl print:text-lg font-light text-primary tracking-tight">
                REQ-{String(requisition.consecutive || 0).padStart(6, '0')}
              </h1>
              {getStatusBadge(requisition.status)}
            </div>
            <p className="text-gray-400 font-mono text-xs print:text-[9px] mt-1 print:mt-0">{reqId}</p>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto print:hidden">
          {requisition.status === 'PENDIENTE' && (
            <>
              {isAdminOrAlmacen && (
                <button 
                  onClick={() => updateStatus('ENTREGADA')}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-bold shadow-sm transition-colors"
                  title="Descontar inventario y finalizar"
                >
                  <Check size={16} strokeWidth={3} /> Entregar
                </button>
              )}
              {(isAdminOrAlmacen || (isUser && isOwnArea)) && (
                <button 
                  onClick={() => updateStatus('CANCELADA')}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 text-sm font-bold shadow-sm transition-colors"
                  title="Liberar el inventario comprometido"
                >
                  <X size={16} strokeWidth={3} /> Cancelar
                </button>
              )}
            </>
          )}
          
          <button 
            onClick={() => window.print()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 px-4 py-2 text-sm font-bold shadow-sm transition-colors"
          >
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 print:gap-3">
        {/* Requester Info */}
        <div className="bg-white border border-gray-100 p-6 print:p-2 shadow-sm print:shadow-none flex flex-col justify-center print:border-none">
            <h3 className="text-[10px] print:text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-4 print:mb-1 border-b border-gray-50 pb-2 print:pb-1">Información de Solicitud</h3>
            <div className="space-y-3 print:space-y-1">
              <div>
                <p className="text-xs print:text-[8px] text-gray-400 uppercase leading-none">Solicitante</p>
                <p className="font-semibold text-primary print:text-[10px] leading-tight mt-0.5">{requisition.requester_name || 'Desconocido'}</p>
                <p className="text-xs print:text-[8px] text-gray-500 font-mono mt-0.5 leading-none">{requisition.requester_code || '---'}</p>
              </div>
              <div>
                <p className="text-xs print:text-[8px] text-gray-400 uppercase leading-none">Área Destino</p>
                <p className="font-semibold text-primary print:text-[10px] leading-tight mt-0.5">{requisition.area_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs print:text-[8px] text-gray-400 uppercase leading-none">Fecha de Emisión</p>
                <p className="text-sm print:text-[10px] font-medium text-gray-800 leading-tight mt-0.5">{dateStr}</p>
              </div>
            </div>
        </div>

        {/* Approver Info */}
        <div className="bg-white border border-gray-100 p-6 print:p-2 shadow-sm print:shadow-none flex flex-col justify-center print:border-none">
            <h3 className="text-[10px] print:text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-4 print:mb-1 border-b border-gray-50 pb-2 print:pb-1">Aprobación y Costos</h3>
            <div className="space-y-3 print:space-y-1">
              <div>
                <p className="text-xs print:text-[8px] text-gray-400 uppercase leading-none">Autorizado Por</p>
                <p className="font-semibold text-primary print:text-[10px] leading-tight mt-0.5">{requisition.approver_name || 'Revisión Pendiente'}</p>
                <p className="text-xs print:text-[8px] text-gray-500 font-mono mt-0.5 leading-none">{requisition.approver_code || '---'}</p>
              </div>
              <div className="flex gap-8 print:gap-4 print:mt-1">
                 <div>
                  <p className="text-xs print:text-[8px] text-gray-400 uppercase leading-none">Total de Ítems Físicos</p>
                  <p className="text-2xl print:text-sm font-light text-primary leading-tight mt-0.5">{effectiveTotalItems}</p>
                 </div>
                 <div>
                  <p className="text-xs print:text-[8px] text-gray-400 uppercase leading-none">Costo Estimado</p>
                  <p className="text-2xl print:text-sm font-light text-primary font-mono leading-tight mt-0.5">${effectiveTotalCost.toFixed(2)}</p>
                 </div>
              </div>
            </div>
        </div>
      </div>

      {/* Comments Section */}
      {requisition.comments && (
        <div className="bg-white border border-gray-100 p-6 print:p-2 shadow-sm print:shadow-none">
          <h3 className="text-[10px] print:text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-3 print:mb-1 border-b border-gray-50 pb-2 print:pb-1">Comentarios y Justificación</h3>
          <p className="text-sm print:text-[9px] text-gray-700 italic leading-relaxed whitespace-pre-wrap">
            "{requisition.comments}"
          </p>
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white border border-gray-100 shadow-sm print:shadow-none overflow-hidden print:overflow-visible">
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20 print:bg-transparent print:border-none print:px-2 print:py-2">
            <h2 className="text-xs font-bold text-white uppercase tracking-widest print:text-gray-700 print:text-[9px]">Detalle de Artículos ({requisition.requisition_items?.length || 0})</h2>
        </div>
        
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[9px] print:text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                <th className="px-6 print:px-2 py-4 print:py-2">Código</th>
                <th className="px-6 print:px-2 py-4 print:py-2">Artículo</th>
                <th className="px-6 print:px-2 py-4 print:py-2 text-center">Unidad</th>
                <th className="px-6 print:px-2 py-4 print:py-2 text-right">Cant. Req.</th>
                <th className="px-6 print:px-2 py-4 print:py-2 text-right">{requisition.status === 'PENDIENTE' ? 'A Entregar' : 'Entregado'}</th>
                <th className="px-6 print:px-2 py-4 print:py-2 text-right">Costo Unit.</th>
                <th className="px-6 print:px-2 py-4 print:py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requisition.requisition_items?.map((item: any, idx: number) => {
                const iData = item.inventory_items;
                const effectiveQty = requisition.status === 'PENDIENTE' 
                  ? (deliveredQuantities[item.id] ?? item.quantity)
                  : (item.delivered_quantity ?? item.quantity);
                const totalItemCost = effectiveQty * (item.unit_cost || 0);

                return (
                  <tr key={item.id || idx} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs font-mono text-gray-500">{iData?.code || '---'}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs font-semibold text-primary break-words whitespace-normal leading-tight">{iData?.name || 'Artículo Desconocido'}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs text-gray-500 text-center lowercase">{iData?.units?.name || 'und'}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-base print:text-sm font-bold text-gray-400 text-right">{item.quantity}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-base print:text-sm font-bold text-primary text-right">
                      {requisition.status === 'PENDIENTE' ? (
                        <>
                          <input 
                            type="number" 
                            min="0" 
                            max={item.quantity} 
                            value={effectiveQty} 
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(item.quantity, parseInt(e.target.value) || 0));
                              setDeliveredQuantities({...deliveredQuantities, [item.id]: val});
                            }}
                            className="w-20 border border-gray-300 px-2 py-1 text-right focus:outline-none focus:border-primary print:hidden"
                          />
                          <span className="hidden print:inline">{effectiveQty}</span>
                        </>
                      ) : (
                        item.delivered_quantity ?? item.quantity
                      )}
                    </td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs text-gray-400 font-mono text-right">${(item.unit_cost || 0).toFixed(2)}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs font-bold text-primary font-mono text-right">${totalItemCost.toFixed(2)}</td>
                  </tr>
                );
              })}
              {(!requisition.requisition_items || requisition.requisition_items.length === 0) && (
                 <tr>
                   <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                     La requisa no tiene artículos.
                   </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signatures (Visible only on print or specific block) */}
      <div className="hidden print:grid grid-cols-3 gap-6 pt-8 mt-2 px-8">
        <div className="flex flex-col items-center">
          <div className="w-full border-t border-gray-800"></div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-800">Solicita</p>
          <p className="text-[7px] text-gray-600 mt-0.5 font-bold">{requisition.requester_name}</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-full border-t border-gray-800"></div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-800">Aprueba</p>
          <p className="text-[7px] text-gray-600 mt-0.5 font-bold">{requisition.approver_name}</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-full border-t border-gray-800"></div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-800">Entrega</p>
          <p className="text-[7px] text-gray-600 mt-0.5 font-bold">Almacén General</p>
        </div>
      </div>
      
    </div>
  );
}
