'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Search, Plus, Trash2, X, UserPlus, Building2 } from 'lucide-react';
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

export default function NuevaCompraView() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  
  
  // Supplier State
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);

  // Items State
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<InventoryItem[]>([]);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState<PurchaseDraftItem[]>([]);

  // Comments
  const [comments, setComments] = useState('');
  const [manualRequisitionNumber, setManualRequisitionNumber] = useState('');

  // 1. Search Suppliers
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

  // 2. Search Items
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
      
      const { data: pData, error: pError } = await supabase
        .from('purchases')
        .insert({
          supplier_id: selectedSupplier.id,
          manual_requisition_number: manualRequisitionNumber.trim() || null,
          total_cost: totalCost,
          comments: comments.trim() || null,
          status: 'PENDIENTE'
        })
        .select()
        .single();

      if (pError) throw pError;

      const itemsToInsert = selectedItems.map(si => ({
        purchase_id: pData.id,
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/compras" className="p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-light text-primary tracking-tight">Nueva Compra</h1>
            <p className="text-gray-500 mt-1 text-sm">Registra una nueva adquisición de suministros.</p>
          </div>
        </div>
        
        <button 
          onClick={handleSubmit} disabled={isSaving || selectedItems.length === 0 || !selectedSupplier}
          className="flex items-center gap-2 bg-primary text-background px-6 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Guardar Compra
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Supplier & Linking */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Box: Supplier */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">1. Proveedor</h3>
              <button 
                onClick={() => setShowNewSupplierModal(true)}
                className="text-[10px] font-bold text-primary hover:text-primary-dark flex items-center gap-1 uppercase tracking-tighter"
              >
                <UserPlus size={12} /> Nuevo
              </button>
            </div>
            
            <div className="relative">
              {!selectedSupplier ? (
                <div className="flex items-center bg-gray-50 border border-gray-200 group focus-within:border-primary transition-colors">
                  <div className="pl-3 pr-2 text-gray-400">
                    <Building2 size={18} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Buscar proveedor..." 
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-transparent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-primary">{selectedSupplier.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono italic">{selectedSupplier.tax_id || 'Sin RTN/ID'}</p>
                  </div>
                  <button onClick={() => setSelectedSupplier(null)} className="text-gray-500 hover:text-primary p-1 bg-gray-100/50">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Supplier Results */}
              {supplierResults.length > 0 && !selectedSupplier && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50">
                  {supplierResults.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedSupplier(s); setSupplierResults([]); }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>


          {/* Box: Manual Reference */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">2. N° Talonario / Referencia Manual</h3>
            <input 
              type="text" 
              placeholder="Ej: TAL-9988"
              value={manualRequisitionNumber}
              onChange={e => setManualRequisitionNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-gray-400 mt-2 italic italic">Este número se visualizará en el listado para seguimiento.</p>
          </div>

          {/* Box: Comments */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">3. Comentarios</h3>
            <textarea 
              placeholder="Notas internas sobra la compra..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              className="w-full h-32 p-3 text-sm bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:border-primary resize-none"
            />
          </div>

        </div>

        {/* Right: Items Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-100 p-6 shadow-sm flex flex-col min-h-[500px]">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-6">
              3. Detalle de Compra
            </h3>

            <div className="relative mb-6">
              <div className="flex gap-2 bg-gray-50 border border-gray-200 focus-within:border-primary transition-colors">
                <div className="pl-3 flex items-center text-gray-400">
                  <Search size={18} />
                </div>
                <input 
                  type="text" 
                  placeholder="Agregar producto manual por nombre o código..." 
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none"
                />
              </div>

              {/* Item Results */}
              {itemResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50 max-h-60 overflow-y-auto">
                  {itemResults.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 flex justify-between items-center"
                    >
                      <div>
                        <p className="text-sm font-bold text-primary">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.code} • {item.categories?.name}</p>
                      </div>
                      <span className="text-xs font-bold text-primary">${item.price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Producto</th>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24 text-center">Cantidad</th>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-center">Costo Unit.</th>
                    <th className="py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-right">Subtotal</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedItems.map((item) => (
                    <tr key={item.inventoryItem.id} className="group transition-colors hover:bg-blue-50/20">
                      <td className="py-4">
                        <p className="text-sm font-semibold text-primary">{item.inventoryItem.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{item.inventoryItem.code}</p>
                      </td>
                      <td className="py-4">
                        <input 
                          type="number"
                          value={item.quantity || ""}
                          onChange={(e) => handleUpdateItem(item.inventoryItem.id, 'quantity', e.target.value)}
                          className="w-20 mx-auto block border border-gray-200 p-1.5 text-sm text-center focus:border-primary outline-none"
                        />
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-1 border border-gray-200 p-1.5 bg-white focus-within:border-primary">
                          <span className="text-xs text-gray-400">$</span>
                          <input 
                            type="number"
                            step="0.01"
                            value={item.unitCost || ""}
                            onChange={(e) => handleUpdateItem(item.inventoryItem.id, 'unitCost', e.target.value)}
                            className="w-full text-sm text-right outline-none"
                          />
                        </div>
                      </td>
                      <td className="py-4 text-sm font-bold text-primary text-right">
                        ${(item.quantity * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 text-center">
                        <button 
                          onClick={() => setSelectedItems(selectedItems.filter(si => si.inventoryItem.id !== item.inventoryItem.id))}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {selectedItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-300 text-sm">Empieza agregando artículos o cargando una requisa.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedItems.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-end">
                <div className="flex justify-between w-64 text-sm text-gray-500 mb-2">
                  <span>Subtotal Compra:</span>
                  <span>${selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between w-64 text-xl font-bold text-primary">
                  <span>TOTAL USD:</span>
                  <span className="text-primary">${selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* New Supplier Modal */}
      {showNewSupplierModal && (
        <SupplierModal 
          onClose={() => setShowNewSupplierModal(false)} 
          onCreated={(s) => { setSelectedSupplier(s); setShowNewSupplierModal(false); }}
        />
      )}
    </div>
  );
}

function SupplierModal({ onClose, onCreated }: { onClose: () => void, onCreated: (s: Supplier) => void }) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name, tax_id: taxId, email })
      .select()
      .single();
    
    if (error) alert('Error: ' + error.message);
    else onCreated(data);
    setIsSaving(false);
  };

  return (
      <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white border border-gray-100 shadow-sm p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
        <h2 className="text-2xl font-light text-primary mb-6">Nuevo Proveedor</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nombre Completo</label>
            <input 
              type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 p-3 text-sm focus:border-primary outline-none"
              placeholder="Ej. Suministros Industriales S.A."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">RTN / ID Fiscal</label>
            <input 
              type="text" value={taxId} onChange={e => setTaxId(e.target.value)}
              className="w-full border border-gray-200 p-3 text-sm focus:border-primary outline-none"
              placeholder="0801-1999-XXXXXX"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email Contacto</label>
            <input 
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 p-3 text-sm focus:border-primary outline-none"
              placeholder="ventas@proveedor.com"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-gray-400 hover:bg-gray-50 uppercase tracking-widest transition-colors">Cancelar</button>
          <button 
            onClick={handleSave} disabled={isSaving || !name}
            className="flex-1 py-3 text-sm font-bold bg-primary text-white hover:bg-primary-dark uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
