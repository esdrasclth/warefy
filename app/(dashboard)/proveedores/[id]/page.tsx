'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingCart, Package, AlertTriangle, CheckSquare, Square, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { DetailSkeleton } from '@/components/ui/TableSkeleton';

interface SupplierProduct {
  id: string;
  code: string;
  name: string;
  quantity: number;
  committed_quantity: number;
  min_stock: number;
  max_stock: number;
  price: number;
  min_order_qty: number;
  lead_time_days: number;
  origin: string;
  units_per_package?: number | null;
  units?: { name: string } | null;
  package_unit?: { name: string } | null;
  categories?: { name: string } | null;
  orderQty: number;
}

interface Supplier {
  id: string;
  name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export default function SupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const router = useRouter();
  const toast = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      const [{ data: suppData }, { data: prodData }] = await Promise.all([
        supabase.from('suppliers').select('*').eq('id', id).single(),
        supabase
          .from('inventory_items')
          .select('id, code, name, quantity, committed_quantity, min_stock, max_stock, price, min_order_qty, lead_time_days, origin, units_per_package, units!unit_id(name), package_unit:units!package_unit_id(name), categories(name)')
          .eq('preferred_supplier_id', id)
          .eq('status', 'ACTIVE')
          .order('name'),
      ]);

      if (!suppData) { toast.error('Proveedor no encontrado.'); router.push('/proveedores'); return; }
      setSupplier(suppData);

      const enriched: SupplierProduct[] = (prodData || []).map((p: any) => {
        const available = p.quantity - (p.committed_quantity || 0);
        const gap = Math.max(0, (p.max_stock || 0) - p.quantity);
        const minQty = p.min_order_qty || 1;
        const suggested = gap > 0 ? Math.ceil(gap / minQty) * minQty : minQty;
        return { ...p, orderQty: suggested };
      });

      setProducts(enriched);

      // Pre-seleccionar los que están en o bajo mínimo
      const belowMin = new Set(
        enriched.filter(p => (p.quantity - (p.committed_quantity || 0)) <= p.min_stock).map(p => p.id)
      );
      setSelected(belowMin);
      setIsLoading(false);
    };
    fetch();
  }, [id]);

  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  };

  const toggle = (pid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const updateQty = (pid: string, val: number) => {
    setProducts(prev => prev.map(p => p.id === pid ? { ...p, orderQty: Math.max(1, val) } : p));
  };

  const handleGenerateOC = () => {
    const items = products
      .filter(p => selected.has(p.id))
      .map(p => ({ id: p.id, code: p.code, name: p.name, quantity: p.orderQty, price: p.price }));

    if (items.length === 0) { toast.warning('Selecciona al menos un producto.'); return; }

    sessionStorage.setItem('warefy_oc_draft', JSON.stringify({
      supplier_id: supplier!.id,
      supplier_name: supplier!.name,
      items,
    }));
    router.push('/compras/nueva?from=sugerencias');
  };

  const selectedItems = products.filter(p => selected.has(p.id));
  const totalOC = selectedItems.reduce((acc, p) => acc + p.orderQty * p.price, 0);

  const stockStatus = (p: SupplierProduct) => {
    const avail = p.quantity - (p.committed_quantity || 0);
    if (avail <= 0) return 'crítico';
    if (avail <= p.min_stock) return 'bajo';
    return 'ok';
  };

  if (isLoading) return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="h-8 w-48 bg-gray-100 animate-pulse" />
      <DetailSkeleton cards={2} tableRows={8} tableCols={9} />
    </div>
  );

  if (!supplier) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/proveedores" className="p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-light text-primary tracking-tight">{supplier.name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{products.length} producto(s) asignado(s)</p>
          </div>
        </div>

        {selected.size > 0 && (
          <button
            onClick={handleGenerateOC}
            className="flex items-center gap-2 bg-primary text-background px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm animate-in fade-in"
          >
            <ShoppingCart size={16} />
            Generar OC ({selected.size} prod. · ${totalOC.toLocaleString(undefined, { minimumFractionDigits: 2 })})
          </button>
        )}
      </div>

      {/* Supplier Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'RUC / Tax ID', value: supplier.tax_id || '—' },
          { label: 'Contacto', value: [supplier.email, supplier.phone].filter(Boolean).join(' · ') || '—' },
          { label: 'Dirección', value: supplier.address || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-sm text-primary font-medium truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Products Table */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">Productos del Proveedor</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] text-white/70 font-bold uppercase tracking-widest">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full inline-block" /> Crítico</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-400 rounded-full inline-block" /> Bajo mínimo</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full inline-block" /> OK</span>
            </div>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-gray-400 gap-3">
            <Package size={40} className="text-gray-200" />
            <p className="text-sm">Este proveedor no tiene productos asignados.</p>
            <p className="text-xs text-gray-300">Asigna este proveedor desde la página de <Link href="/productos" className="underline text-primary/50">Productos</Link>.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="py-2 px-3 w-8">
                    <button onClick={toggleAll} className="text-gray-400 hover:text-primary transition-colors">
                      {selected.size === products.length ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Código</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Producto</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right">Stock</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right">Dispo.</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right">Mín/Máx</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right">Precio</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center w-28">Cant. a Pedir</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const status = stockStatus(p);
                  const available = p.quantity - (p.committed_quantity || 0);
                  const isSelected = selected.has(p.id);
                  const statusDot = status === 'crítico' ? 'bg-red-500' : status === 'bajo' ? 'bg-orange-400' : 'bg-green-400';
                  const rowBg = isSelected ? 'bg-blue-50/40' : '';

                  return (
                    <tr key={p.id} className={`transition-colors hover:bg-blue-50/30 border-b border-gray-50 cursor-pointer ${rowBg}`} onClick={() => toggle(p.id)}>
                      <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggle(p.id)} className={`transition-colors ${isSelected ? 'text-primary' : 'text-gray-300 hover:text-gray-400'}`}>
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-[11px] font-mono text-gray-500">{p.code}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
                          <div>
                            <p className="text-sm font-medium text-primary">{p.name}</p>
                            <p className="text-[9px] text-gray-400 uppercase font-mono">
                              {p.categories?.name || '—'} · {p.units?.name || 'UND'}
                              {p.units_per_package && p.package_unit?.name && (
                                <span className="text-blue-400 ml-1">· {p.package_unit.name} ×{p.units_per_package}</span>
                              )}
                              <span className={`ml-1 ${p.origin === 'INTERNACIONAL' ? 'text-blue-500' : 'text-green-500'}`}>
                                · {p.origin === 'INTERNACIONAL' ? 'INT' : 'LOC'} {p.lead_time_days}d
                              </span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-right font-bold text-gray-500">{p.quantity}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`text-xs font-black ${status === 'crítico' ? 'text-red-600' : status === 'bajo' ? 'text-orange-500' : 'text-primary'}`}>
                          {available}
                          {status !== 'ok' && <AlertTriangle size={10} className="inline ml-1 mb-0.5" />}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[10px] text-right font-mono text-gray-400">{p.min_stock}/{p.max_stock}</td>
                      <td className="py-2 px-3 text-xs text-right font-mono text-gray-600">
                        {p.price > 0 ? `$${p.price.toFixed(2)}` : <span className="text-orange-400 font-bold">$0.00</span>}
                      </td>
                      <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="number"
                            min={1}
                            value={p.orderQty}
                            onChange={e => updateQty(p.id, Number(e.target.value))}
                            className="w-20 border border-gray-200 px-2 py-1 text-sm text-center focus:outline-none focus:border-primary font-bold text-primary disabled:opacity-40"
                          />
                          {p.min_order_qty > 1 && (
                            <span className="text-[9px] text-gray-400">Ped. mín: {p.min_order_qty}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-right font-bold font-mono text-primary">
                        {isSelected
                          ? `$${(p.orderQty * p.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer total */}
        {selected.size > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              <span className="font-bold text-primary">{selected.size}</span> producto(s) seleccionado(s)
            </p>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Total estimado OC</p>
                <p className="text-xl font-light text-primary">${totalOC.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <button
                onClick={handleGenerateOC}
                className="flex items-center gap-2 bg-primary text-background px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm"
              >
                <ShoppingCart size={16} />
                Generar OC
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
