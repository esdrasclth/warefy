'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, X, Save, Loader2, Truck, Package, ShoppingCart, Building2, Eye } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardsSkeleton } from '@/components/ui/TableSkeleton';

interface Supplier {
  id: string;
  name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
  product_count?: number;
  purchase_count?: number;
}

const EMPTY_FORM = { name: '', tax_id: '', email: '', phone: '', address: '' };

export default function ProveedoresPage() {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [{ data: suppData }, { data: prodCounts }, { data: ocCounts }] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('inventory_items').select('preferred_supplier_id').not('preferred_supplier_id', 'is', null),
        supabase.from('purchases').select('supplier_id').not('supplier_id', 'is', null),
      ]);

      const prodMap: Record<string, number> = {};
      prodCounts?.forEach(r => { if (r.preferred_supplier_id) prodMap[r.preferred_supplier_id] = (prodMap[r.preferred_supplier_id] || 0) + 1; });

      const ocMap: Record<string, number> = {};
      ocCounts?.forEach(r => { if (r.supplier_id) ocMap[r.supplier_id] = (ocMap[r.supplier_id] || 0) + 1; });

      setSuppliers((suppData || []).map(s => ({
        ...s,
        product_count: prodMap[s.id] || 0,
        purchase_count: ocMap[s.id] || 0,
      })));
    } catch {
      toast.error('Error cargando proveedores.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsPanelOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({ name: s.name, tax_id: s.tax_id || '', email: s.email || '', phone: s.phone || '', address: s.address || '' });
    setIsPanelOpen(true);
  };

  const closePanel = () => { setIsPanelOpen(false); setEditingId(null); setForm(EMPTY_FORM); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.warning('El nombre del proveedor es requerido.'); return; }
    setIsSaving(true);

    const payload = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from('suppliers').update(payload).eq('id', editingId)
      : await supabase.from('suppliers').insert(payload);

    setIsSaving(false);
    if (error) { toast.error('Error guardando: ' + error.message); return; }

    toast.success(editingId ? 'Proveedor actualizado.' : 'Proveedor creado.');
    closePanel();
    fetchSuppliers();
  };

  const handleDelete = async (s: Supplier) => {
    if ((s.product_count || 0) > 0) {
      toast.error(`No se puede eliminar: ${s.product_count} producto(s) tienen este proveedor asignado.`);
      return;
    }
    if ((s.purchase_count || 0) > 0) {
      if (!confirm(`"${s.name}" tiene ${s.purchase_count} OC(s) registradas. ¿Eliminar de todas formas?`)) return;
    } else {
      if (!confirm(`¿Eliminar proveedor "${s.name}"?`)) return;
    }
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id);
    if (error) { toast.error('Error eliminando: ' + error.message); return; }
    toast.success('Proveedor eliminado.');
    fetchSuppliers();
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.tax_id || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalWithProducts = suppliers.filter(s => (s.product_count || 0) > 0).length;
  const totalWithOCs = suppliers.filter(s => (s.purchase_count || 0) > 0).length;

  const stats = [
    { label: 'Total Proveedores', value: suppliers.length, icon: Truck, bg: 'bg-primary' },
    { label: 'Con Productos', value: totalWithProducts, icon: Package, bg: 'bg-blue-600' },
    { label: 'Con OCs Registradas', value: totalWithOCs, icon: ShoppingCart, bg: 'bg-green-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Proveedores</h1>
          <p className="text-gray-500 mt-1 text-sm">Gestión del catálogo de proveedores y su información de contacto.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-background px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm"
        >
          <Plus size={16} /> Nuevo Proveedor
        </button>
      </div>

      {/* Stats */}
      {isLoading ? <CardsSkeleton count={3} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white border border-gray-100 p-5 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                  <p className="text-3xl font-light text-primary">{s.value}</p>
                </div>
                <div className={`p-3 ${s.bg} text-white group-hover:scale-110 transition-transform`}>
                  <Icon size={20} strokeWidth={2} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search + Table */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, RUC o email..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} resultado(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Proveedor</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">RUC / Tax ID</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Contacto</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Dirección</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center">Productos</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center">OCs</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center sticky right-0 bg-gray-50 border-l border-gray-100">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <TableSkeleton rows={8} cols={7} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-gray-400">
                    <Building2 size={32} className="mx-auto mb-2 text-gray-200" />
                    {search ? 'No se encontraron proveedores con ese criterio.' : 'No hay proveedores registrados. Crea el primero.'}
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="hover:bg-blue-50/20 transition-colors group border-b border-gray-50">
                    <td className="py-3 px-4">
                      <p className="text-sm font-semibold text-primary">{s.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {new Date(s.created_at!).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-gray-500">{s.tax_id || <span className="text-gray-300">—</span>}</td>
                    <td className="py-3 px-4">
                      {s.email && <p className="text-xs text-gray-600">{s.email}</p>}
                      {s.phone && <p className="text-[11px] text-gray-400 font-mono mt-0.5">{s.phone}</p>}
                      {!s.email && !s.phone && <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 max-w-[180px] truncate">{s.address || <span className="text-gray-300">—</span>}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 border ${(s.product_count || 0) > 0 ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-gray-300 border-gray-100 bg-gray-50'}`}>
                        {s.product_count || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 border ${(s.purchase_count || 0) > 0 ? 'text-green-600 border-green-200 bg-green-50' : 'text-gray-300 border-gray-100 bg-gray-50'}`}>
                        {s.purchase_count || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 sticky right-0 bg-white group-hover:bg-blue-50/20 border-l border-gray-100 transition-colors">
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`/proveedores/${s.id}`} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors" title="Ver productos">
                          <Eye size={15} />
                        </Link>
                        <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="Editar">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(s)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Panel */}
      {isPanelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-primary-dark/20 backdrop-blur-sm">
          <div className="w-full max-w-md bg-background border-l border-gray-200 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <h2 className="text-xl font-light text-primary tracking-tight">
                {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={closePanel} disabled={isSaving} className="text-gray-400 hover:text-red-500 transition-colors">
                <X size={24} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 bg-gray-50/30">
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Información General</h3>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Nombre <span className="text-red-400">*</span></label>
                  <input
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej. Distribuidora ABC S.A."
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">RUC / Tax ID</label>
                  <input
                    value={form.tax_id}
                    onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))}
                    placeholder="Ej. 0801-1990-12345"
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Contacto</h3>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="contacto@proveedor.com"
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Ej. +504 2222-3333"
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Dirección</label>
                  <textarea
                    value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="Colonia, Ciudad, País..."
                    rows={3}
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
              <button onClick={closePanel} disabled={isSaving} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 border border-transparent transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-primary text-background text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
