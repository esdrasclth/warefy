'use client';

import { useEffect, useState } from 'react';
import { X, Calendar, User, Building, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import type { InventoryItem } from '@/types';

interface ProductHistoryModalProps {
  product: InventoryItem | null;
  onClose: () => void;
}

export default function ProductHistoryModal({ product, onClose }: ProductHistoryModalProps) {
  if (!product) return null;

  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('requisition_items')
        .select(`
          id,
          quantity,
          delivered_quantity,
          requisitions (
            id,
            consecutive,
            created_at,
            requester_name,
            area_name,
            status
          )
        `)
        .eq('inventory_item_id', product.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching product history:', error);
        setHistory([]);
      } else {
        setHistory(data || []);
      }
      setIsLoading(false);
    };

    fetchHistory();
  }, [product.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm transition-opacity p-4">
      <div className="w-full max-w-3xl bg-background border border-gray-200 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-start bg-white">
          <div>
            <h2 className="text-xl font-light text-primary tracking-tight">Historial de Requisiciones</h2>
            <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-widest">{product.code} - <span className="text-primary">{product.name}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors p-1">
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-8 bg-gray-50/50">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : history.length > 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                    <th className="px-6 py-3">Requisa</th>
                    <th className="px-6 py-3">Área</th>
                    <th className="px-6 py-3">Solicitante</th>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3 text-right">Cant. Solicitada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((record, idx) => {
                    const req = record.requisitions;
                    const dateStr = req?.created_at ? new Date(req.created_at).toLocaleDateString('es-HN') : '—';
                    const qty = record.delivered_quantity ?? record.quantity;
                    return (
                    <tr key={record.id || idx} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 text-sm font-semibold text-primary">
                        {req?.consecutive ? `REQ-${String(req.consecutive).padStart(6, '0')}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 group-hover:text-primary transition-colors">
                        <div className="flex items-center gap-2">
                           <Building size={14} className="text-gray-400" />
                          {req?.area_name || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                           <User size={14} className="text-gray-400" />
                          {req?.requester_name || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                         <div className="flex items-center gap-2">
                           <Calendar size={14} className="text-gray-400" />
                           {dateStr}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-primary">
                        {qty} <span className="text-xs text-gray-400 font-normal">un.</span>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-gray-100">
              <p className="text-gray-500 text-sm">Este artículo no ha sido solicitado en ninguna requisa aún.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-white flex justify-end">
          <button 
            onClick={onClose} 
            className="px-6 py-2.5 bg-primary text-background text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
