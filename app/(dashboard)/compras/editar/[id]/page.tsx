'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Search, Trash2, X, Building2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
  committed_quantity?: number;
  price: number;
  categories?: { name: string };
  units?: { name: string };
}

interface PurchaseDraftItem {
  inventoryItem: InventoryItem;
  quantity: number;
  unitCost: number;
}

interface Supplier {
  id: string;
  name: string;
  tax_id?: string;
  email?: string;
}

export default function EditarCompraView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Supplier State
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);

  // Items State
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<InventoryItem[]>([]);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState<PurchaseDraftItem[]>([]);

  // Comments
  const [comments, setComments] = useState('');

  // 1. Fetch Existing Purchase
  useEffect(() => {
    const fetchPurchase = async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          *,
          suppliers (*),
          purchase_items (
            quantity,
            unit_cost,
            inventory_items ( id, code, name, quantity, committed_quantity, price, categories(name) )
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        alert('Error cargando compra');
        router.push('/compras');
      } else {
        if (data.status !== 'PENDIENTE') {
          alert('Solo se pueden editar compras en estado PENDIENTE.');
          router.push(`/compras/${id}`);
          return;
        }
        setSelectedSupplier(data.suppliers);
        setComments(data.comments || '');
        const items = data.purchase_items.map((pi: any) => ({
          inventoryItem: pi.inventory_items,
          quantity: pi.quantity,
          unitCost: pi.unit_cost
        }));
        setSelectedItems(items);
        setIsLoading(false);
      }
    };
    fetchPurchase();
  }, [id, router]);

  // 2. Search Suppliers
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = supplierSearch.trim();
      if (!q || selectedSupplier) { setSupplierResults([]); return; }
      setIsSearchingSupplier(true);
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .ilike('name', `%${q}%`)
        .limit(5);
      setSupplierResults(data || []);
      setIsSearchingSupplier(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [supplierSearch, selectedSupplier]);

  // 3. Search Items
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = itemSearch.trim();
      if (!q) { setItemResults([]); return; }
      setIsSearchingItems(true);
      const { data } = await supabase
        .from('inventory_items')
        .select('*, categories(name), units(name)')
        .eq('status', 'ACTIVE')
        .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(10);
      setItemResults(data || []);
      setIsSearchingItems(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  const handleSelectItem = (item: InventoryItem) => {
    const exists = selectedItems.find(si => si.inventoryItem.id === item.id);
    if (exists) {
      setSelectedItems(selectedItems.map(si => 
        si.inventoryItem.id === item.id ? { ...si, quantity: si.quantity + 1 } : si
      ));
    } else {
      setSelectedItems([...selectedItems, { inventoryItem: item, quantity: 1, unitCost: item.price }]);
    }
    setItemSearch('');
    setItemResults([]);
  };

  const handleUpdateItem = (id: string, field: 'quantity' | 'unitCost', value: number | string) => {
    setSelectedItems(selectedItems.map(si => {
      if (si.inventoryItem.id === id) {
        return { ...si, [field]: value === "" ? 0 : Number(value) };
      }
      return si;
    }));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier || selectedItems.length === 0) {
      alert('Debes seleccionar un proveedor y agregar artículos.');
      return;
    }

    setIsSaving(true);
    try {
      const totalCost = selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost), 0);
      
      const { error: pError } = await supabase
        .from('purchases')
        .update({
          supplier_id: selectedSupplier.id,
          total_cost: totalCost,
          comments: comments.trim() || null
        })
        .eq('id', id);

      if (pError) throw pError;

      // Delete old items and insert new ones
      await supabase.from('purchase_items').delete().eq('purchase_id', id);

      const itemsToInsert = selectedItems.map(si => ({
        purchase_id: id,
        inventory_item_id: si.inventoryItem.id,
        quantity: si.quantity,
        unit_cost: si.unitCost
      }));

      const { error: piError } = await supabase.from('purchase_items').insert(itemsToInsert);
      if (piError) throw piError;

      router.push('/compras');
    } catch (error: any) {
      alert('Error: ' + error.message);
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/compras" className="p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-light text-primary tracking-tight">Editar Compra</h1>
            <p className="text-gray-500 mt-1 text-sm">Modifica los detalles de la orden de compra.</p>
          </div>
        </div>
        
        <button 
          onClick={handleSubmit} disabled={isSaving || selectedItems.length === 0 || !selectedSupplier}
          className="flex items-center gap-2 bg-primary text-background px-6 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Actualizar Compra
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Supplier & Comments */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">1. Proveedor</h3>
            <div className="relative">
              {!selectedSupplier ? (
                <div className="flex items-center bg-gray-50 border border-gray-200 group focus-within:border-primary transition-colors">
                  <div className="pl-3 pr-2 text-gray-400"><Search size={18} /></div>
                  <input type="text" placeholder="Buscar proveedor..." value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} className="w-full px-3 py-2 text-sm bg-transparent focus:outline-none" />
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-primary">{selectedSupplier.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono italic">{selectedSupplier.tax_id || 'Sin RTN/ID'}</p>
                  </div>
                  <button onClick={() => setSelectedSupplier(null)} className="text-gray-500 hover:text-primary p-1 bg-gray-100/50"><X size={16} /></button>
                </div>
              )}
              {supplierResults.length > 0 && !selectedSupplier && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50">
                  {supplierResults.map(s => (
                    <button key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierResults([]); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b border-gray-50">{s.name}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">4. Comentarios</h3>
            <textarea value={comments} onChange={e => setComments(e.target.value)} className="w-full h-32 p-3 text-sm bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:border-primary resize-none" />
          </div>
        </div>

        {/* Right: Items Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-100 p-6 shadow-sm flex flex-col min-h-[500px]">
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-6">3. Detalle de Compra</h3>

             <div className="relative mb-6">
                <div className="flex gap-2 bg-gray-50 border border-gray-200 focus-within:border-primary">
                  <div className="pl-3 flex items-center text-gray-400"><Search size={18} /></div>
                  <input type="text" placeholder="Agregar producto..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} className="w-full px-3 py-2.5 text-sm bg-transparent outline-none" />
                </div>
                {itemResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50 max-h-60 overflow-y-auto">
                    {itemResults.map(item => (
                      <button key={item.id} onClick={() => handleSelectItem(item)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 flex justify-between items-center text-sm font-bold text-primary">
                        <span>{item.name}</span>
                        <span className="text-xs">${item.price}</span>
                      </button>
                    ))}
                  </div>
                )}
             </div>

             <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest">Producto</th>
                      <th className="py-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest text-center">Cant.</th>
                      <th className="py-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest text-center">Costo Unit.</th>
                      <th className="py-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest text-right">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedItems.map((item) => (
                      <tr key={item.inventoryItem.id}>
                        <td className="py-4 font-semibold text-primary">{item.inventoryItem.name}</td>
                        <td className="py-4">
                          <input type="number" value={item.quantity || ""} onChange={(e) => handleUpdateItem(item.inventoryItem.id, 'quantity', e.target.value)} className="w-20 mx-auto block border border-gray-200 p-1.5 text-sm text-center focus:outline-none focus:border-primary" />
                        </td>
                        <td className="py-4">
                          <input type="number" step="0.01" value={item.unitCost || ""} onChange={(e) => handleUpdateItem(item.inventoryItem.id, 'unitCost', e.target.value)} className="w-24 mx-auto block border border-gray-200 p-1.5 text-sm text-right focus:outline-none focus:border-primary" />
                        </td>
                        <td className="py-4 text-right font-bold text-primary">${(item.quantity * item.unitCost).toFixed(2)}</td>
                        <td className="py-4 text-center">
                          <button onClick={() => setSelectedItems(selectedItems.filter(si => si.inventoryItem.id !== item.inventoryItem.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
