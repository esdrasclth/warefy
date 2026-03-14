'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Building, Calendar, Loader2, Package, User, Eye } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

interface HistoryRecord {
  id: string;
  quantity: number | null;
  delivered_quantity: number | null;
  requisitions: {
    id: string;
    consecutive: number | null;
    created_at: string | null;
    requester_name: string | null;
    area_name: string | null;
    status: string | null;
  } | null;
}

interface ProductInfo {
  id: string;
  code: string | null;
  name: string | null;
  categories?: { name?: string | null } | null;
  units?: { name?: string | null } | null;
}

export default function ProductHistoryPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!productId) return;
      setIsLoading(true);

      const [productRes, historyRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('id, code, name, categories(name), units(name)')
          .eq('id', productId)
          .single(),
        supabase
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
          .eq('inventory_item_id', productId)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (productRes.error) {
        console.error('Error fetching product:', productRes.error);
        setProduct(null);
      } else {
        setProduct(productRes.data as ProductInfo);
      }

      if (historyRes.error) {
        console.error('Error fetching product history:', historyRes.error);
        setHistory([]);
      } else {
        setHistory((historyRes.data || []) as unknown as HistoryRecord[]);
      }

      setIsLoading(false);
    };

    fetchHistory();
  }, [productId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-widest font-bold">
            <Link href="/almacen" className="flex items-center gap-2 hover:text-primary transition-colors">
              <ArrowLeft size={14} />
              Volver a Inventario
            </Link>
          </div>
          <h1 className="text-3xl font-light text-primary tracking-tight mt-2">Historial de Requisiciones</h1>
          <p className="text-gray-500 mt-2 text-sm">Detalle completo de movimientos del artículo.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 shadow-sm p-5">
        {product ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-primary/10 text-primary flex items-center justify-center">
                <Package size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{product.code || 'SIN CÓDIGO'}</p>
                <p className="text-lg font-semibold text-primary">{product.name || 'Producto'}</p>
              </div>
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-widest font-bold">
              {product.categories?.name || 'Sin Categoría'} • {product.units?.name || 'UND'}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">Producto no encontrado.</div>
        )}
      </div>

      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-primary border-b-2 border-white/20 px-6 py-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Requisas Asociadas — {history.length.toLocaleString()} registros
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            Este artículo no ha sido solicitado en ninguna requisa aún.
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[1000px] lg:min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                  <th className="px-6 py-3">Requisa</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3">Área</th>
                  <th className="px-6 py-3">Solicitante</th>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3 text-right">Cant. Sol.</th>
                  <th className="px-6 py-3 text-right">Cant. Ent.</th>
                  <th className="px-6 py-3 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((record) => {
                  const req = record.requisitions;
                  const dateStr = req?.created_at ? new Date(req.created_at).toLocaleDateString('es-HN') : '—';
                  const qty = Number(record.quantity || 0);
                  const delivered = Number(record.delivered_quantity ?? record.quantity ?? 0);
                  return (
                    <tr key={record.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 text-sm font-semibold text-primary">
                        {req?.consecutive ? `REQ-${String(req.consecutive).padStart(6, '0')}` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border text-gray-500 border-gray-200 bg-gray-50">
                          {req?.status || '—'}
                        </span>
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
                      <td className="px-6 py-4 text-sm text-right font-bold text-green-700">
                        {delivered} <span className="text-xs text-gray-400 font-normal">un.</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {req?.id ? (
                          <Link
                            href={`/requisar/${req.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <Eye size={12} /> Ver
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
