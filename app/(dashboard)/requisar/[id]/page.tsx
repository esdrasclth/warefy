'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileText, Check, X, Printer, Package, Pencil, Trash2, Save, RotateCcw } from 'lucide-react';
import { DetailSkeleton } from '@/components/ui/TableSkeleton';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { use } from 'react'; // Explicit unwrap for params
import SignaturePad, { type SignaturePadHandle } from '@/components/ui/SignaturePad';

export default function RequisitionDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const reqId = params.id;
  const searchParams = useSearchParams();
  
  const toast = useToast();
  const [requisition, setRequisition] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deliveredQuantities, setDeliveredQuantities] = useState<Record<string, number>>({});
  const [showSignModal, setShowSignModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const [isSavingEdits, setIsSavingEdits] = useState(false);

  const fetchRequisition = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('requisitions')
      .select(`
        *,
        requisition_items (
          id, quantity, unit_cost, inventory_item_id, delivered_quantity,
          inventory_items (
            code, name, units!unit_id(name), units_per_package, package_unit:units!package_unit_id(name)
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
      .select('role, employees(area_id, code)')
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

  const submitApproval = async () => {
    const pad = signatureRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error('Debe firmar para autorizar la requisa.');
      return;
    }
    setIsApproving(true);
    try {
      const blob = await pad.toBlob();
      if (!blob) throw new Error('No se pudo capturar la firma.');

      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('requisitionId', reqId);
      formData.append('signature', blob, 'signature.png');

      const response = await fetch('/api/requisitions/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      toast.success('Requisa autorizada correctamente.');
      setShowSignModal(false);
      setHasSignature(false);
      fetchRequisition();
    } catch (error: any) {
      toast.error('Error al autorizar: ' + error.message);
    } finally {
      setIsApproving(false);
    }
  };

  const startEdit = () => {
    const initial: Record<string, number> = {};
    requisition.requisition_items?.forEach((item: any) => {
      initial[item.id] = item.quantity;
    });
    setEditedQuantities(initial);
    setDeletedItemIds(new Set());
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditedQuantities({});
    setDeletedItemIds(new Set());
  };

  const toggleDeleteItem = (itemId: string) => {
    setDeletedItemIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const saveEdits = async () => {
    const remainingCount = (requisition.requisition_items?.length || 0) - deletedItemIds.size;
    if (remainingCount < 1) {
      toast.error('La requisa debe conservar al menos un artículo.');
      return;
    }
    const updates = Object.entries(editedQuantities)
      .filter(([itemId]) => !deletedItemIds.has(itemId))
      .map(([itemId, quantity]) => ({ itemId, quantity }));

    if (updates.some(u => !Number.isInteger(u.quantity) || u.quantity < 1)) {
      toast.error('Las cantidades deben ser enteros mayores o iguales a 1.');
      return;
    }

    setIsSavingEdits(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/requisitions/edit-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          requisitionId: reqId,
          updates,
          deletions: Array.from(deletedItemIds),
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      toast.success('Cambios guardados correctamente.');
      cancelEdit();
      fetchRequisition();
    } catch (error: any) {
      toast.error('Error al guardar cambios: ' + error.message);
    } finally {
      setIsSavingEdits(false);
    }
  };

  const updateStatus = async (newStatus: 'ENTREGADA' | 'CANCELADA' | 'PENDIENTE') => {
    if (confirm(`¿Estás seguro de marcar esta requisa como ${newStatus}?`)) {
      setIsLoading(true);
      try {
        const response = await fetch('/api/requisitions/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requisitionId: reqId,
            status: newStatus,
            deliveredQuantities: newStatus === 'ENTREGADA' ? deliveredQuantities : undefined
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        fetchRequisition();
      } catch (error: any) {
        toast.error('Error actualizando estado: ' + error.message);
        setIsLoading(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="h-10 w-56 bg-gray-100 animate-pulse" />
        <DetailSkeleton cards={3} tableRows={6} tableCols={5} />
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
  const canApprove = userProfile?.role === 'ADMIN' ||
    (userProfile?.role === 'APROBADOR' && requisition.approver_code === userProfile?.employees?.code);
  
  const effectiveQtyOf = (item: any) => {
    if (editMode) return editedQuantities[item.id] ?? item.quantity;
    return requisition.status === 'PENDIENTE'
      ? (deliveredQuantities[item.id] ?? item.quantity)
      : (item.delivered_quantity ?? item.quantity);
  };

  const effectiveTotalItems = requisition.requisition_items?.reduce((acc: number, item: any) => {
    if (editMode && deletedItemIds.has(item.id)) return acc;
    return acc + effectiveQtyOf(item);
  }, 0) || 0;

  const effectiveTotalCost = requisition.requisition_items?.reduce((acc: number, item: any) => {
    if (editMode && deletedItemIds.has(item.id)) return acc;
    return acc + (effectiveQtyOf(item) * (item.unit_cost || 0));
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

        <div className="flex flex-wrap gap-3 w-full md:w-auto print:hidden">
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

          {requisition.status === 'PENDIENTE DE APROBACION' && canApprove && (
            editMode ? (
              <>
                <button
                  onClick={saveEdits}
                  disabled={isSavingEdits}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                  title="Guardar cambios en los artículos"
                >
                  <Save size={16} strokeWidth={2.5} /> {isSavingEdits ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={isSavingEdits}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 px-4 py-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                  title="Descartar los cambios"
                >
                  <RotateCcw size={16} /> Descartar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-4 py-2 text-sm font-bold shadow-sm transition-colors"
                  title="Editar cantidades o eliminar artículos"
                >
                  <Pencil size={16} /> Editar
                </button>
                <button
                  onClick={() => setShowSignModal(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-sm font-bold shadow-sm transition-colors"
                  title="Firmar, aprobar y enviar a almacén"
                >
                  <Check size={16} strokeWidth={3} /> Autorizar
                </button>
                <button
                  onClick={() => updateStatus('CANCELADA')}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 text-sm font-bold shadow-sm transition-colors"
                  title="Rechazar la requisa"
                >
                  <X size={16} strokeWidth={3} /> Rechazar
                </button>
              </>
            )
          )}

          {!editMode && (
            <button
              onClick={() => window.print()}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 px-4 py-2 text-sm font-bold shadow-sm transition-colors"
            >
              <Printer size={16} /> Imprimir
            </button>
          )}
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
                {editMode && <th className="px-6 py-4 text-center print:hidden">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requisition.requisition_items?.map((item: any, idx: number) => {
                const iData = item.inventory_items;
                const isDeleted = editMode && deletedItemIds.has(item.id);
                const rowQty = effectiveQtyOf(item);
                const effectiveQty = requisition.status === 'PENDIENTE'
                  ? (deliveredQuantities[item.id] ?? item.quantity)
                  : (item.delivered_quantity ?? item.quantity);
                const totalItemCost = rowQty * (item.unit_cost || 0);

                return (
                  <tr key={item.id || idx} className={`transition-colors group ${isDeleted ? 'bg-red-50/40 opacity-60 line-through' : 'hover:bg-gray-50/50'}`}>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs font-mono text-gray-500">{iData?.code || '---'}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs font-semibold text-primary break-words whitespace-normal leading-tight">{iData?.name || 'Artículo Desconocido'}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs text-gray-500 text-center">
                      <span className="lowercase">{iData?.units?.name || 'und'}</span>
                      {iData?.units_per_package && iData?.package_unit?.name && (
                        <span className="block text-[9px] text-blue-400 font-semibold uppercase mt-0.5 print:hidden">
                          1 {iData.package_unit.name} = {iData.units_per_package}
                        </span>
                      )}
                    </td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-base print:text-sm font-bold text-gray-400 text-right">
                      {editMode ? (
                        <input
                          type="number"
                          min="1"
                          value={editedQuantities[item.id] ?? item.quantity}
                          disabled={isDeleted}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setEditedQuantities({ ...editedQuantities, [item.id]: val });
                          }}
                          className="w-20 border border-gray-300 px-2 py-1 text-right focus:outline-none focus:border-primary disabled:bg-gray-100 no-underline"
                        />
                      ) : (
                        <>
                          {item.quantity}
                          {iData?.units_per_package && iData?.package_unit?.name && (() => {
                            const full = Math.floor(item.quantity / iData.units_per_package);
                            const rem = item.quantity % iData.units_per_package;
                            if (full === 0) return null;
                            return (
                              <span className="block text-[9px] text-blue-400 font-semibold print:hidden">
                                {rem === 0 ? `${full} ${iData.package_unit.name}` : `~${full} ${iData.package_unit.name} +${rem}`}
                              </span>
                            );
                          })()}
                        </>
                      )}
                    </td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-base print:text-sm font-bold text-primary text-right">
                      {requisition.status === 'PENDIENTE' ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            value={effectiveQty}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setDeliveredQuantities({...deliveredQuantities, [item.id]: val});
                            }}
                            className="w-20 border border-gray-300 px-2 py-1 text-right focus:outline-none focus:border-primary print:hidden"
                          />
                          {iData?.units_per_package && iData?.package_unit?.name && effectiveQty > 0 && (() => {
                            const full = Math.floor(effectiveQty / iData.units_per_package);
                            const rem = effectiveQty % iData.units_per_package;
                            if (full === 0) return null;
                            return (
                              <span className="block text-[9px] text-blue-400 font-semibold print:hidden">
                                {rem === 0 ? `${full} ${iData.package_unit.name}` : `~${full} ${iData.package_unit.name} +${rem}`}
                              </span>
                            );
                          })()}
                          <span className="hidden print:inline">{effectiveQty}</span>
                        </>
                      ) : (
                        item.delivered_quantity ?? item.quantity
                      )}
                    </td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs text-gray-400 font-mono text-right">${(item.unit_cost || 0).toFixed(2)}</td>
                    <td className="px-6 print:px-2 py-4 print:py-1 text-sm print:text-xs font-bold text-primary font-mono text-right">${totalItemCost.toFixed(2)}</td>
                    {editMode && (
                      <td className="px-6 py-4 text-center print:hidden no-underline">
                        <button
                          onClick={() => toggleDeleteItem(item.id)}
                          className={`p-1.5 transition-colors ${isDeleted ? 'text-blue-500 hover:text-blue-700' : 'text-gray-400 hover:text-red-500'}`}
                          title={isDeleted ? 'Restaurar artículo' : 'Eliminar artículo'}
                        >
                          {isDeleted ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {(!requisition.requisition_items || requisition.requisition_items.length === 0) && (
                 <tr>
                   <td colSpan={editMode ? 8 : 7} className="px-6 py-12 text-center text-gray-400 text-sm">
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
          <div className="h-16 mb-0.5 flex items-end justify-center"></div>
          <div className="w-full border-t border-gray-800"></div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-800">Solicita</p>
          <p className="text-[7px] text-gray-600 mt-0.5 font-bold">{requisition.requester_name}</p>
          {requisition.created_at && (
            <p className="text-[6px] text-gray-500 mt-0.5">{new Date(requisition.created_at).toLocaleString()}</p>
          )}
        </div>
        <div className="flex flex-col items-center">
          <div className="h-16 mb-0.5 flex items-end justify-center">
            {requisition.approver_signature_url && (
              <img
                src={requisition.approver_signature_url}
                alt="Firma del aprobador"
                className="h-16 object-contain"
              />
            )}
          </div>
          <div className="w-full border-t border-gray-800"></div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-800">Aprueba</p>
          <p className="text-[7px] text-gray-600 mt-0.5 font-bold">{requisition.approver_name}</p>
          {requisition.approved_at && (
            <p className="text-[6px] text-gray-500 mt-0.5">{new Date(requisition.approved_at).toLocaleString()}</p>
          )}
        </div>
        <div className="flex flex-col items-center">
          <div className="h-16 mb-0.5 flex items-end justify-center"></div>
          <div className="w-full border-t border-gray-800"></div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-800">Entrega</p>
          <p className="text-[7px] text-gray-600 mt-0.5 font-bold">Almacén General</p>
          {requisition.delivered_at && (
            <p className="text-[6px] text-gray-500 mt-0.5">{new Date(requisition.delivered_at).toLocaleString()}</p>
          )}
        </div>
      </div>

      {showSignModal && (
        <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-light text-primary">Firma de Autorización</h3>
              <button
                onClick={() => { if (!isApproving) { setShowSignModal(false); setHasSignature(false); } }}
                className="p-1 text-gray-400 hover:text-primary transition-colors"
                disabled={isApproving}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Firme para autorizar la requisa <span className="font-semibold text-primary">REQ-{String(requisition.consecutive || 0).padStart(6, '0')}</span>. La firma quedará registrada en la impresión.
              </p>
              <SignaturePad ref={signatureRef} onChange={setHasSignature} />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowSignModal(false); setHasSignature(false); }}
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
