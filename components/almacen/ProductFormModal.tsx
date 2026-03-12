'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

export interface Category { id: string; name: string; }
export interface Unit { id: string; name: string; abbreviation?: string; }

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
}

interface ProductFormModalProps {
  isOpen: boolean;
  productToEdit: ProductData | null;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export default function ProductFormModal({ isOpen, productToEdit, onClose, onSaveSuccess }: ProductFormModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [newCatName, setNewCatName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');

  // Form State
  const [formData, setFormData] = useState<ProductData>({
    code: '', name: '', category_id: '', unit_id: '',
    quantity: 0, min_stock: 0, max_stock: 0, price: 0, status: 'ACTIVE'
  });

  // Fetch Categories and Units
  const fetchMetadata = async () => {
    setIsLoadingMetadata(true);
    const [catsRes, unitsRes] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('units').select('*').order('name')
    ]);
    
    if (catsRes.data) setCategories(catsRes.data);
    if (unitsRes.data) setUnits(unitsRes.data);
    setIsLoadingMetadata(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchMetadata();
    }
  }, [isOpen]);

  // Hydrate form on open/edit
  useEffect(() => {
    if (productToEdit) {
      setFormData(productToEdit);
    } else {
      setFormData({
        code: '', name: '', category_id: '', unit_id: '',
        quantity: 0, min_stock: 0, max_stock: 0, price: 0, status: 'ACTIVE'
      });
    }
  }, [productToEdit, isOpen]);

  const handleChange = (field: keyof ProductData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const { data, error } = await supabase.from('categories').insert({ name: newCatName.trim() }).select().single();
    if (error) {
      alert('Error creando categoría: ' + error.message);
    } else if (data) {
      setCategories(prev => [...prev, data]);
      setFormData(prev => ({ ...prev, category_id: data.id }));
      setNewCatName('');
    }
  };

  const handleRemoveCategory = async (id: string) => {
    if (!confirm('Eliminar categoría?')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (!error) {
      setCategories(categories.filter(c => c.id !== id));
      if (formData.category_id === id) setFormData(prev => ({...prev, category_id: ''}));
    } else {
      alert('Error eliminando: ' + error.message);
    }
  };

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) return;
    const { data, error } = await supabase.from('units').insert({ name: newUnitName.trim() }).select().single();
    if (error) {
      alert('Error creando unidad: ' + error.message);
    } else if (data) {
      setUnits(prev => [...prev, data]);
      setFormData(prev => ({ ...prev, unit_id: data.id }));
      setNewUnitName('');
    }
  };

  const handleRemoveUnit = async (id: string) => {
    if (!confirm('Eliminar unidad?')) return;
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (!error) {
      setUnits(units.filter(u => u.id !== id));
      if (formData.unit_id === id) setFormData(prev => ({...prev, unit_id: ''}));
    } else {
      alert('Error eliminando: ' + error.message);
    }
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.code || !formData.name || !formData.category_id || !formData.unit_id) {
      alert('Por favor complete todos los campos requeridos (Código, Nombre, Categoría, Unidad).');
      return;
    }
    
    setIsSaving(true);
    let error;

    if (formData.id) {
      // Update
      const { id, ...updateData } = formData;
      const res = await supabase.from('inventory_items').update(updateData).eq('id', id);
      error = res.error;
    } else {
      // Insert
      const res = await supabase.from('inventory_items').insert(formData);
      error = res.error;
    }

    setIsSaving(false);

    if (error) {
       alert('Error guardando el artículo: ' + error.message);
       console.error(error);
    } else {
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
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-red-500 transition-colors">
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
                    <div className="flex flex-wrap gap-2 mt-2">
                      {categories.map(c => (
                        <span key={c.id} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 flex items-center gap-1 border border-gray-200">
                          {c.name}
                          <button type="button" onClick={() => handleRemoveCategory(c.id)} className="hover:text-red-500"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
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
                    <div className="flex flex-wrap gap-2 mt-2">
                      {units.map(u => (
                        <span key={u.id} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 flex items-center gap-1 border border-gray-200">
                          {u.name}
                          <button type="button" onClick={() => handleRemoveUnit(u.id)} className="hover:text-red-500"><X size={10} /></button>
                        </span>
                      ))}
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
                    <label className="text-xs font-semibold text-primary">Precio Unitario ($)</label>
                    <input 
                      value={formData.price} onChange={e => handleChange('price', Number(e.target.value))}
                      type="number" step="0.01" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">Stock Mínimo</label>
                    <input 
                      value={formData.min_stock} onChange={e => handleChange('min_stock', Number(e.target.value))}
                      type="number" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">Stock Máximo</label>
                    <input 
                      value={formData.max_stock} onChange={e => handleChange('max_stock', Number(e.target.value))}
                      type="number" className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
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
