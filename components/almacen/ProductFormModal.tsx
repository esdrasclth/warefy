'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Save, Loader2, Search, ChevronDown } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import ImageUpload from '@/components/inventory/ImageUpload';
import { useToast } from '@/components/ui/Toast';
import { logAudit } from '@/lib/audit';

export interface Category { id: string; name: string; }
export interface Unit { id: string; name: string; abbreviation?: string; }
export interface Supplier { id: string; name: string; }

// Match the main table's data structure
export interface ProductData {
  id?: string;
  code: string;
  name: string;
  category_id: string;
  unit_id: string;
  quantity: number;
  min_stock: number;
  max_stock: number;
  price: number;
  status: 'ACTIVE' | 'INACTIVE';
  image_url?: string | null;
  preferred_supplier_id?: string | null;
  origin: 'LOCAL' | 'INTERNACIONAL';
  lead_time_days: number;
  min_order_qty: number;
}

interface ProductFormModalProps {
  isOpen: boolean;
  productToEdit: ProductData | null;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export default function ProductFormModal({ isOpen, productToEdit, onClose, onSaveSuccess }: ProductFormModalProps) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [initialFormJson, setInitialFormJson] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');

  // Currency Conversion State
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [useHnlConverter, setUseHnlConverter] = useState(false);
  // rawValue: lo que el usuario escribe en el campo (HNL o USD según el modo)
  const [rawValue, setRawValue] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState<ProductData>({
    code: '', name: '', category_id: '', unit_id: '',
    quantity: 0, min_stock: 0, max_stock: 0, price: 0, status: 'ACTIVE',
    origin: 'LOCAL', lead_time_days: 5, min_order_qty: 1,
  });

  // Fetch Categories, Units and Global Settings
  const fetchMetadata = async () => {
    setIsLoadingMetadata(true);
    const [catsRes, unitsRes, settingsRes, suppliersRes] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('units').select('*').order('name'),
      supabase.from('global_settings').select('*').eq('id', 1).single(),
      supabase.from('suppliers').select('id, name').order('name'),
    ]);

    if (catsRes.data) setCategories(catsRes.data);
    if (unitsRes.data) setUnits(unitsRes.data);
    if (settingsRes.data) setExchangeRate(settingsRes.data.exchange_rate_usd_hnl);
    if (suppliersRes.data) setSuppliers(suppliersRes.data);
    setIsLoadingMetadata(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchMetadata();
      setUseHnlConverter(false);
      setRawValue('');
      setSupplierSearch('');
      setSupplierDropdownOpen(false);
    }
  }, [isOpen]);

  // Hydrate form on open/edit
  useEffect(() => {
    if (productToEdit) {
      setFormData(productToEdit);
      setRawValue(productToEdit.price > 0 ? String(productToEdit.price) : '');
    } else {
      setFormData({
        id: crypto.randomUUID(),
        code: '', name: '', category_id: '', unit_id: '',
        quantity: 0, min_stock: 0, max_stock: 0, price: 0, status: 'ACTIVE',
        preferred_supplier_id: null, origin: 'LOCAL', lead_time_days: 5,
      });
      setRawValue('');
    }
    setUseHnlConverter(false);
    // Snapshot for dirty-check (after state settles)
    setTimeout(() => {
      setInitialFormJson(JSON.stringify(productToEdit ?? {}));
    }, 0);
  }, [productToEdit, isOpen]);

  // Sync supplier search label when suppliers load or product changes
  useEffect(() => {
    if (suppliers.length > 0 && formData.preferred_supplier_id) {
      const found = suppliers.find(s => s.id === formData.preferred_supplier_id);
      if (found) setSupplierSearch(found.name);
    }
  }, [suppliers, formData.preferred_supplier_id]);

  const handleChange = (field: keyof ProductData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Calcula el precio USD a partir del rawValue según el modo activo
  const computePrice = (val: string, converting: boolean): number => {
    const num = Number(val);
    if (!val || isNaN(num)) return 0;
    if (converting && exchangeRate) return Number((num / exchangeRate).toFixed(4));
    return num;
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRawValue(val);
    setFormData(prev => ({ ...prev, price: computePrice(val, useHnlConverter) }));
  };

  const handleConverterToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setUseHnlConverter(checked);
    // Recalcular precio con el mismo rawValue bajo el nuevo modo
    setFormData(prev => ({ ...prev, price: computePrice(rawValue, checked) }));
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const { data, error } = await supabase.from('categories').insert({ name: newCatName.trim().toUpperCase() }).select().single();
    if (error) {
      alert('Error creando categoría: ' + error.message);
    } else if (data) {
      setCategories(prev => [...prev, data]);
      setFormData(prev => ({ ...prev, category_id: data.id }));
      setNewCatName('');
    }
  };

  const handleRemoveCategory = async (id: string) => {
    const cat = categories.find(c => c.id === id);
    const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if (count && count > 0) {
      toast.error(`No se puede eliminar "${cat?.name}": hay ${count} producto(s) usándola.`);
      return;
    }
    if (!confirm(`¿Eliminar categoría "${cat?.name}"?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (!error) {
      setCategories(categories.filter(c => c.id !== id));
      if (formData.category_id === id) setFormData(prev => ({ ...prev, category_id: '' }));
    } else {
      toast.error('Error eliminando: ' + error.message);
    }
  };

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) return;
    const { data, error } = await supabase.from('units').insert({ name: newUnitName.trim().toUpperCase() }).select().single();
    if (error) {
      alert('Error creando unidad: ' + error.message);
    } else if (data) {
      setUnits(prev => [...prev, data]);
      setFormData(prev => ({ ...prev, unit_id: data.id }));
      setNewUnitName('');
    }
  };

  const handleRemoveUnit = async (id: string) => {
    const unit = units.find(u => u.id === id);
    const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('unit_id', id);
    if (count && count > 0) {
      toast.error(`No se puede eliminar "${unit?.name}": hay ${count} producto(s) usándola.`);
      return;
    }
    if (!confirm(`¿Eliminar unidad "${unit?.name}"?`)) return;
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (!error) {
      setUnits(units.filter(u => u.id !== id));
      if (formData.unit_id === id) setFormData(prev => ({ ...prev, unit_id: '' }));
    } else {
      toast.error('Error eliminando: ' + error.message);
    }
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.code || !formData.name || !formData.category_id || !formData.unit_id) {
      toast.warning('Completa todos los campos requeridos: Código, Nombre, Categoría y Unidad.');
      return;
    }
    
    setIsSaving(true);
    let error;

    if (productToEdit?.id) {
      // Update via RPC (evita CORS con PATCH directo)
      const res = await supabase.rpc('update_inventory_item', {
        p_id: productToEdit.id,
        p_updates: {
          code: formData.code,
          name: formData.name,
          category_id: formData.category_id,
          unit_id: formData.unit_id,
          quantity: formData.quantity,
          min_stock: formData.min_stock,
          max_stock: formData.max_stock,
          price: formData.price,
          status: formData.status,
          preferred_supplier_id: formData.preferred_supplier_id ?? null,
          origin: formData.origin,
          lead_time_days: formData.lead_time_days,
          min_order_qty: formData.min_order_qty,
        },
      });
      error = res.error;
    } else {
      // Insert — incluye el id pre-generado e image_url si se subió imagen
      const res = await supabase.from('inventory_items').insert({
        id: formData.id,
        code: formData.code,
        name: formData.name,
        category_id: formData.category_id,
        unit_id: formData.unit_id,
        quantity: formData.quantity,
        min_stock: formData.min_stock,
        max_stock: formData.max_stock,
        price: formData.price,
        status: formData.status,
        image_url: formData.image_url ?? null,
        preferred_supplier_id: formData.preferred_supplier_id ?? null,
        origin: formData.origin,
        lead_time_days: formData.lead_time_days,
        min_order_qty: formData.min_order_qty,
      });
      error = res.error;
    }

    setIsSaving(false);

    if (error) {
      toast.error('Error guardando el artículo: ' + error.message);
      console.error(error);
    } else {
      const itemId = productToEdit?.id ?? formData.id ?? '';
      logAudit({
        tableName: 'inventory_items',
        recordId: itemId,
        action: productToEdit ? 'UPDATE' : 'CREATE',
        description: productToEdit
          ? `Artículo "${formData.name}" actualizado.`
          : `Artículo "${formData.name}" creado con código ${formData.code}.`,
        newValues: { code: formData.code, name: formData.name, price: formData.price, quantity: formData.quantity },
      });
      toast.success(productToEdit ? 'Artículo actualizado correctamente.' : 'Artículo creado correctamente.');
      onSaveSuccess();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-primary-dark/20 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-xl bg-background border-l border-gray-200 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
          <h2 className="text-xl font-light text-primary tracking-tight">
            {productToEdit ? 'Editar Artículo' : 'Nuevo Artículo'}
          </h2>
          <button
            onClick={() => {
              const currentJson = JSON.stringify({ code: formData.code, name: formData.name, category_id: formData.category_id, unit_id: formData.unit_id, quantity: formData.quantity, price: formData.price, status: formData.status });
              const initJson = JSON.stringify(productToEdit ? { code: productToEdit.code, name: productToEdit.name, category_id: productToEdit.category_id, unit_id: productToEdit.unit_id, quantity: productToEdit.quantity, price: productToEdit.price, status: productToEdit.status } : { code: '', name: '', category_id: '', unit_id: '', quantity: 0, price: 0, status: 'ACTIVE' });
              if (currentJson !== initJson && !confirm('Tienes cambios sin guardar. ¿Cerrar de todas formas?')) return;
              onClose();
            }}
            disabled={isSaving}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 bg-gray-50/30">
          
          {isLoadingMetadata ? (
            <div className="flex items-center justify-center p-12 text-primary">
               <Loader2 size={32} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* Base Information */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Información Básica</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">Código</label>
                    <input 
                      value={formData.code} onChange={e => handleChange('code', e.target.value)}
                      type="text" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" placeholder="ART-00X" 
                    />
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-semibold text-primary">Estado</label>
                    <select 
                      value={formData.status} onChange={e => handleChange('status', e.target.value)}
                      className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="INACTIVE">Inactivo</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-semibold text-primary">Nombre del Artículo</label>
                    <input 
                      value={formData.name} onChange={e => handleChange('name', e.target.value)}
                      type="text" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" placeholder="Ej. Resma Papel Bond A4" 
                    />
                  </div>
                </div>
              </div>

              {/* Categorization */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Clasificación</h3>
                <div className="grid grid-cols-1 gap-6">
                  
                  <div className="space-y-2 p-4 border border-gray-100 bg-white">
                    <label className="text-xs font-semibold text-primary flex justify-between">
                      Categoría
                      <span className="text-[10px] text-gray-400 font-normal">Gestión de Cat.</span>
                    </label>
                    <select 
                      value={formData.category_id} onChange={e => handleChange('category_id', e.target.value)}
                      className="w-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="">Seleccione una categoría</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="pt-2 mt-2 border-t border-gray-50 flex gap-2">
                      <input value={newCatName} onChange={e => setNewCatName(e.target.value)} type="text" placeholder="Nueva categoría..." className="flex-1 text-xs border border-gray-200 px-2 py-1 focus:outline-none focus:border-primary" />
                      <button type="button" onClick={handleAddCategory} className="bg-primary text-white px-2 py-1 text-xs hover:bg-primary-dark transition-colors"><Plus size={14} /></button>
                    </div>
                    {categories.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto border border-gray-100 divide-y divide-gray-50">
                        {categories.map(c => (
                          <div key={c.id} className={`flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${formData.category_id === c.id ? 'bg-primary/5 text-primary font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                            onClick={() => handleChange('category_id', c.id)}>
                            <span>{c.name}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); handleRemoveCategory(c.id); }} className="text-gray-300 hover:text-red-500 transition-colors ml-2 flex-shrink-0"><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 p-4 border border-gray-100 bg-white">
                    <label className="text-xs font-semibold text-primary flex justify-between">
                      Unidad de Medida
                      <span className="text-[10px] text-gray-400 font-normal">Gestión de Un.</span>
                    </label>
                    <select 
                      value={formData.unit_id} onChange={e => handleChange('unit_id', e.target.value)}
                      className="w-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="">Seleccione unidad</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <div className="pt-2 mt-2 border-t border-gray-50 flex gap-2">
                      <input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} type="text" placeholder="Nueva unidad..." className="flex-1 text-xs border border-gray-200 px-2 py-1 focus:outline-none focus:border-primary" />
                      <button type="button" onClick={handleAddUnit} className="bg-primary text-white px-2 py-1 text-xs hover:bg-primary-dark transition-colors"><Plus size={14} /></button>
                    </div>
                    {units.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto border border-gray-100 divide-y divide-gray-50">
                        {units.map(u => (
                          <div key={u.id} className={`flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${formData.unit_id === u.id ? 'bg-primary/5 text-primary font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
                            onClick={() => handleChange('unit_id', u.id)}>
                            <span>{u.name}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); handleRemoveUnit(u.id); }} className="text-gray-300 hover:text-red-500 transition-colors ml-2 flex-shrink-0"><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Proveedor Preferido */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Proveedor Preferido</h3>
                <div className="space-y-1 p-4 border border-gray-100 bg-white">
                  <label className="text-xs font-semibold text-primary">Proveedor (para sugerencias de compra)</label>
                  <div className="relative">
                    <div className="relative flex items-center border border-gray-200 bg-gray-50 focus-within:border-primary transition-colors">
                      <Search size={13} className="absolute left-3 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={supplierSearch}
                        onChange={e => {
                          setSupplierSearch(e.target.value);
                          setSupplierDropdownOpen(true);
                          if (!e.target.value) {
                            setFormData(prev => ({ ...prev, preferred_supplier_id: null }));
                          }
                        }}
                        onFocus={() => setSupplierDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                        placeholder="Buscar proveedor..."
                        className="w-full pl-8 pr-8 py-2 text-sm bg-transparent focus:outline-none"
                      />
                      <ChevronDown size={13} className="absolute right-3 text-gray-400 pointer-events-none" />
                    </div>

                    {supplierDropdownOpen && (
                      <div className="absolute z-50 w-full bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                        <div
                          className="px-3 py-2 text-xs text-gray-400 italic hover:bg-gray-50 cursor-pointer transition-colors"
                          onMouseDown={() => {
                            setFormData(prev => ({ ...prev, preferred_supplier_id: null }));
                            setSupplierSearch('');
                            setSupplierDropdownOpen(false);
                          }}
                        >
                          Sin proveedor asignado
                        </div>
                        {suppliers
                          .filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                          .map(s => (
                            <div
                              key={s.id}
                              className={`px-3 py-2 text-sm cursor-pointer hover:bg-primary/5 transition-colors ${formData.preferred_supplier_id === s.id ? 'bg-primary/10 text-primary font-semibold' : 'text-gray-700'}`}
                              onMouseDown={() => {
                                setFormData(prev => ({ ...prev, preferred_supplier_id: s.id }));
                                setSupplierSearch(s.name);
                                setSupplierDropdownOpen(false);
                              }}
                            >
                              {s.name}
                            </div>
                          ))
                        }
                        {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-300 italic">Sin resultados</div>
                        )}
                      </div>
                    )}
                  </div>
                  {formData.preferred_supplier_id && (
                    <p className="text-[10px] text-primary/60 mt-1 font-medium">
                      Seleccionado: {suppliers.find(s => s.id === formData.preferred_supplier_id)?.name}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">Usado para agrupar órdenes de compra automáticas en Sugerencias.</p>
                </div>
              </div>

              {/* Origen y Logística */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Origen y Logística</h3>
                <div className="p-4 border border-gray-100 bg-white space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-primary">Origen del Artículo</label>
                    <div className="flex gap-2">
                      {(['LOCAL', 'INTERNACIONAL'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            origin: opt,
                            lead_time_days: opt === 'LOCAL' ? 5 : 45,
                          }))}
                          className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                            formData.origin === opt
                              ? opt === 'LOCAL'
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {opt === 'LOCAL' ? 'Local' : 'Internacional'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-primary">Tiempo de Entrega (días)</label>
                      <input
                        type="number"
                        min={1}
                        value={formData.lead_time_days}
                        onChange={e => handleChange('lead_time_days', Number(e.target.value))}
                        className="w-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                      <p className="text-[10px] text-gray-400">
                        Por defecto: {formData.origin === 'LOCAL' ? '5 días.' : '45 días.'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-primary">Pedido Mínimo</label>
                      <input
                        type="number"
                        min={1}
                        value={formData.min_order_qty}
                        onChange={e => handleChange('min_order_qty', Number(e.target.value))}
                        className="w-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                      <p className="text-[10px] text-gray-400">Cantidad mínima por orden de compra.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inventory Data */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Inventario y Costos</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">Stock Actual</label>
                    <input 
                      value={formData.quantity} onChange={e => handleChange('quantity', Number(e.target.value))}
                      type="number" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-primary">
                        Precio Unitario {useHnlConverter ? '(HNL → $)' : '($)'}
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={useHnlConverter}
                          disabled={!exchangeRate}
                          onChange={handleConverterToggle}
                          className="accent-primary w-3 h-3 cursor-pointer"
                        />
                        <span className="text-[10px] text-gray-500 font-medium tracking-wide uppercase group-hover:text-primary transition-colors">
                          Convertir a $
                        </span>
                      </label>
                    </div>

                    {useHnlConverter && exchangeRate ? (
                      <>
                        {/* Campo read-only mostrando el resultado en USD */}
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-xs">$</div>
                          <input
                            value={rawValue ? Number((Number(rawValue) / exchangeRate).toFixed(4)) : ''}
                            readOnly
                            type="number"
                            placeholder="0.00"
                            className="w-full pl-8 pr-3 py-2 border border-primary bg-primary/5 text-sm text-primary font-semibold cursor-default focus:outline-none"
                          />
                        </div>
                        {rawValue && (
                          <div className="text-[10px] text-gray-500 tracking-wide text-right">
                            Convertido de <span className="font-semibold text-gray-700">L. {rawValue}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-xs">$</div>
                        <input
                          value={rawValue}
                          onChange={handlePriceChange}
                          type="number" step="0.01"
                          placeholder="0.00"
                          className="w-full pl-8 pr-3 py-2 border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 mt-2">
                    <label className="text-xs font-semibold text-primary">Stock Mínimo</label>
                    <input 
                      value={formData.min_stock} onChange={e => handleChange('min_stock', Number(e.target.value))}
                      type="number" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
                    />
                  </div>
                  <div className="space-y-1 mt-2">
                    <label className="text-xs font-semibold text-primary">Stock Máximo</label>
                    <input 
                      value={formData.max_stock} onChange={e => handleChange('max_stock', Number(e.target.value))}
                      type="number" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
                    />
                  </div>
                </div>
              </div>

              {/* Imagen del producto — al final, centrada */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Imagen del Producto</h3>
                <div className="flex justify-center">
                  <div className="w-64">
                    <ImageUpload
                      inventoryItemId={formData.id!}
                      currentImageUrl={formData.image_url ?? null}
                      canEdit={true}
                      onImageUpdated={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
          <button onClick={onClose} disabled={isSaving} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 border border-transparent transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSaving || isLoadingMetadata}
            className="px-5 py-2.5 bg-primary text-background text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
