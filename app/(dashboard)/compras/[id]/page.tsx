'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, X, Printer, Package, Building2, Calendar, ShoppingCart, MessageSquare, ClipboardList } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';

export default function DetalleCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [purchase, setPurchase] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});

  const fetchPurchase = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers (*),
        requisitions (id, consecutive),
        purchase_items (
          id,
          inventory_item_id,
          quantity,
          received_quantity,
          unit_cost,
          inventory_items ( id, code, name, quantity, committed_quantity )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
      alert('Error al cargar la compra');
    } else {
      setPurchase(data);
      // Initialize received quantities
      const qtys: Record<string, number> = {};
      data.purchase_items.forEach((item: any) => {
        qtys[item.id] = item.received_quantity ?? item.quantity;
      });
      setReceivedQuantities(qtys);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPurchase();
  }, [id]);

  const handleUpdateQty = (itemId: string, val: string) => {
    const num = val === "" ? 0 : parseInt(val);
    setReceivedQuantities(prev => ({ ...prev, [itemId]: num }));
  };

  const handleReceive = async () => {
    if (!confirm('¿Deseas registrar la recepción de esta compra? Esto incrementará el stock en el inventario con las cantidades indicadas.')) return;

    try {
      let newTotalCost = 0;

      for (const item of purchase.purchase_items) {
        const actualQty = receivedQuantities[item.id] || 0;
        newTotalCost += actualQty * item.unit_cost;

        // 1. Update Inventory
        const { data: currentItem } = await supabase
          .from('inventory_items')
          .select('quantity')
          .eq('id', item.inventory_items.id)
          .single();

        if (currentItem) {
          const newStock = (currentItem.quantity || 0) + actualQty;
          await supabase
            .from('inventory_items')
            .update({ quantity: newStock })
            .eq('id', item.inventory_items.id);
        }

        // 2. Update Purchase Item with actual received quantity
        await supabase
          .from('purchase_items')
          .update({ received_quantity: actualQty })
          .eq('id', item.id);
      }

      // 3. Update Purchase status and total cost
      await supabase
        .from('purchases')
        .update({ 
          status: 'RECIBIDA',
          total_cost: newTotalCost
        })
        .eq('id', id);

      alert('Compra recibida e inventario actualizado con éxito.');
      fetchPurchase();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECIBIDA': return 'text-green-600 border-green-200 bg-green-50';
      case 'CANCELADA': return 'text-red-500 border-red-200 bg-red-50';
      case 'PENDIENTE': return 'text-blue-600 border-blue-200 bg-blue-50';
      default: return 'text-gray-500 border-gray-200 bg-gray-50';
    }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-24 text-gray-400">
      <Loader2 size={48} className="animate-spin mb-4" />
      <p className="animate-pulse">Cargando información de compra...</p>
    </div>
  );

  if (!purchase) return <div className="p-12 text-center text-red-500">Compra no encontrada.</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/compras" className="p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">COM-{String(purchase.consecutive).padStart(6, '0')}</h1>
            <p className="text-gray-500 text-xs font-mono">{purchase.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {purchase.status === 'PENDIENTE' && (
            <button 
              onClick={handleReceive}
              className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-green-700 transition-all shadow-sm"
            >
              <Check size={18} /> Confirmar Recepción
            </button>
          )}
          <button className="flex items-center gap-2 bg-white text-gray-600 px-5 py-2.5 text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all shadow-sm">
            <Printer size={18} /> Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Card: Supplier */}
        <div className="bg-white border border-gray-100 p-6 shadow-sm">
           <div className="flex items-center gap-2 text-gray-400 mb-4">
              <Building2 size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Proveedor</span>
           </div>
           <p className="text-lg font-bold text-primary">{purchase.suppliers?.name}</p>
           <p className="text-sm text-gray-500 mt-1">{purchase.suppliers?.tax_id || 'ID no registrado'}</p>
           <p className="text-xs text-blue-600 mt-2 hover:underline cursor-pointer">{purchase.suppliers?.email}</p>
        </div>

        {/* Info Card: Date/Status */}
        <div className="bg-white border border-gray-100 p-6 shadow-sm">
           <div className="flex items-center gap-2 text-gray-400 mb-4">
              <Calendar size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Fecha y Estado</span>
           </div>
           <p className="text-lg font-bold text-primary">{new Date(purchase.created_at).toLocaleDateString()}</p>
           <div className="mt-3">
              <span className={`text-[10px] font-bold px-2 py-1 border uppercase tracking-widest ${getStatusColor(purchase.status)}`}>
                {purchase.status}
              </span>
           </div>
        </div>

        {/* Info Card: Requisition */}
        <div className="bg-white border border-gray-100 p-6 shadow-sm">
           <div className="flex items-center gap-2 text-gray-400 mb-4">
              <ClipboardList size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Requisa / Referencia</span>
           </div>
           {purchase.requisitions ? (
             <>
               <p className="text-lg font-bold text-blue-600">REQ-{String(purchase.requisitions.consecutive).padStart(6, '0')}</p>
               <p className="text-[10px] text-gray-400 font-mono mt-1">Ref: {purchase.requisitions.id.split('-')[0]}...</p>
             </>
           ) : purchase.manual_requisition_number ? (
             <>
               <p className="text-lg font-bold text-orange-600 uppercase">{purchase.manual_requisition_number}</p>
               <p className="text-[10px] text-gray-400 font-mono mt-1">Referencia Manual</p>
             </>
           ) : (
             <p className="text-sm text-gray-400 italic">Sin referencia vinculada</p>
           )}
        </div>

        {/* Info Card: Total */}
        <div className="bg-white border border-gray-100 p-6 shadow-sm border-r-4 border-r-blue-600 flex flex-col justify-center">
           <div className="flex items-center gap-2 text-gray-400 mb-2">
              <ShoppingCart size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Gasto Total</span>
           </div>
           <p className="text-3xl font-light text-blue-800 tracking-tighter">
             ${(purchase.status === 'PENDIENTE' 
               ? Object.entries(receivedQuantities).reduce((acc, [id, qty]) => {
                   const item = purchase.purchase_items.find((pi: any) => pi.id === id);
                   return acc + (qty * (item?.unit_cost || 0));
                 }, 0)
               : purchase.total_cost
             ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
           </p>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Desglose de Artículos</h3>
          {purchase.status === 'PENDIENTE' && (
            <span className="text-[9px] bg-orange-100 text-orange-600 px-2 py-0.5 font-bold uppercase tracking-tighter">Ajusta las cantidades recibidas abajo</span>
          )}
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white">
              <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Producto</th>
              <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Solicitada</th>
              <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Recibida</th>
              <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Costo Unit.</th>
              <th className="py-4 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {purchase.purchase_items.map((item: any, idx: number) => (
              <tr key={idx} className={purchase.status === 'PENDIENTE' ? 'bg-blue-50/10' : ''}>
                <td className="py-4 px-6">
                  <p className="text-sm font-semibold text-primary">{item.inventory_items.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono tracking-wider">{item.inventory_items.code}</p>
                </td>
                <td className="py-4 px-6 text-sm text-center font-medium text-gray-400">
                  {item.quantity}
                </td>
                <td className="py-4 px-6 text-sm text-center font-bold text-primary">
                  {purchase.status === 'PENDIENTE' ? (
                    <input 
                      type="number"
                      min="0"
                      value={receivedQuantities[item.id] ?? (item.received_quantity ?? item.quantity)}
                      onChange={(e) => handleUpdateQty(item.id, e.target.value)}
                      className="w-20 border border-blue-200 bg-white p-1 text-center focus:border-blue-500 outline-none text-blue-700"
                    />
                  ) : (
                    item.received_quantity ?? item.quantity
                  )}
                </td>
                <td className="py-4 px-6 text-sm text-right text-gray-500">${item.unit_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="py-4 px-6 text-sm text-right font-bold text-blue-700">
                  ${((receivedQuantities[item.id] ?? (item.received_quantity ?? item.quantity)) * item.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comments Area */}
      {purchase.comments && (
        <div className="bg-blue-50/50 border border-blue-100 p-6 flex gap-4 ring-1 ring-white">
          <MessageSquare className="text-blue-400 shrink-0" size={24} />
          <div>
             <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Notas del Registro</h4>
             <p className="text-sm text-blue-900 leading-relaxed italic">"{purchase.comments}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
