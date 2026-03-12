'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Eye, Loader2 } from 'lucide-react';
import ProductFormModal, { ProductData } from '@/components/almacen/ProductFormModal';
import ProductHistoryModal from '@/components/almacen/ProductHistoryModal';
import { supabase } from '@/utils/supabase/client';

export default function AlmacenPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyProduct, setHistoryProduct] = useState<any | null>(null);
  const [productToEdit, setProductToEdit] = useState<ProductData | null>(null);

  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*, categories(name), units(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory:', error);
      alert('Error fetching dataset');
    } else if (data) {
      setItems(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleDelete = async (idToDelete: string) => {
    if (confirm('¿Estás seguro de eliminar este artículo?')) {
      const { error } = await supabase.from('inventory_items').delete().eq('id', idToDelete);
      if (error) alert('Error eliminando: ' + error.message);
      else fetchItems();
    }
  };

  const handleEditClick = (product: any) => {
    setProductToEdit({
      id: product.id,
      code: product.code,
      name: product.name,
      category_id: product.category_id,
      unit_id: product.unit_id,
      quantity: product.quantity,
      min_stock: product.min_stock,
      max_stock: product.max_stock,
      price: product.price,
      status: product.status,
    });
    setIsModalOpen(true);
  };

  const handleNewClick = () => {
    setProductToEdit(null);
    setIsModalOpen(true);
  };

  const filteredItems = items.filter(item => {
    const query = searchQuery.toLowerCase();
    const catName = item.categories?.name || '';
    return (
      item.name.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query) ||
      catName.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Inventario</h1>
          <p className="text-gray-500 mt-2 text-sm">Catálogo de artículos y control de existencias.</p>
        </div>
        <button 
          onClick={handleNewClick}
          className="flex items-center gap-2 bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
        >
          <Plus size={18} strokeWidth={2.5} />
          Nuevo Artículo
        </button>
      </div>

      <div className="bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
        <div className="pl-4 pr-3 flex items-center pointer-events-none">
          <Search className="text-gray-400 group-focus-within:text-primary transition-colors" size={20} strokeWidth={1.5} />
        </div>
        <input
          type="text"
          placeholder="Buscar por código, nombre o categoría..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full py-2 bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
        />
      </div>

      <div className="bg-white border border-gray-100 shadow-sm overflow-x-auto relative min-h-[400px]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
             <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : null}
        
        <table className="w-full text-left whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              <th className="px-5 py-4">Código</th>
              <th className="px-5 py-4">Artículo</th>
              <th className="px-5 py-4">Categoría</th>
              <th className="px-5 py-4">Unidad</th>
              <th className="px-5 py-4 text-right">Stock Físico</th>
              <th className="px-5 py-4 text-right">Comprometido</th>
              <th className="px-5 py-4 text-right">Disponible</th>
              <th className="px-5 py-4 text-right">Mín</th>
              <th className="px-5 py-4 text-right">Máx</th>
              <th className="px-5 py-4 text-right">Precio ($)</th>
              <th className="px-5 py-4 text-right">Costo Total ($)</th>
              <th className="px-5 py-4 text-center">Estado</th>
              <th className="px-5 py-4 text-center sticky right-0 bg-gray-50/80 border-l border-gray-100 z-10">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const stock = item.quantity || 0;
                const committed = item.committed_quantity || 0;
                const available = stock - committed;
                const min = item.min_stock || 0;
                const price = item.price || 0;
                
                const totalCost = stock * price;
                const isLowStock = available <= min;
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-5 py-4 text-sm font-bold text-primary">{item.code}</td>
                    <td className="px-5 py-4 text-sm text-gray-700 font-medium group-hover:text-primary transition-colors">{item.name}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{item.categories?.name || 'N/A'}</td>
                    <td className="px-5 py-4 text-sm text-gray-500 lowercase">{item.units?.name || 'N/A'}</td>
                    
                    <td className="px-5 py-4 text-sm text-right font-bold text-gray-500">
                      {stock}
                    </td>
                    <td className="px-5 py-4 text-sm text-right text-orange-500 font-medium">
                      {committed > 0 ? committed : '-'}
                    </td>
                    <td className="px-5 py-4 text-sm text-right font-bold">
                      <span className={isLowStock ? 'text-red-500 bg-red-50 px-2 py-1 border border-red-100' : 'text-primary'}>
                        {available}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-right text-gray-400">{item.min_stock}</td>
                    <td className="px-5 py-4 text-sm text-right text-gray-400">{item.max_stock}</td>
                    <td className="px-5 py-4 text-sm text-right text-gray-600 font-mono">{price.toFixed(2)}</td>
                    <td className="px-5 py-4 text-sm text-right font-bold text-primary font-mono">{totalCost.toFixed(2)}</td>
                    
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 border ${
                        item.status === 'ACTIVE' ? 'text-green-600 border-green-200 bg-green-50' : 'text-gray-400 border-gray-200 bg-gray-50'
                      }`}>
                        {item.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    
                    <td className="px-5 py-4 text-center sticky right-0 bg-white group-hover:bg-gray-50/50 transition-colors border-l border-gray-100">
                      <div className="flex items-center justify-center gap-3">
                        <button 
                          onClick={() => setHistoryProduct(item)}
                          className="text-gray-400 hover:text-blue-500 transition-colors" title="Ver Historial"
                        >
                          <Eye size={16} strokeWidth={2} />
                        </button>
                        <button 
                          onClick={() => handleEditClick(item)}
                          className="text-gray-400 hover:text-primary transition-colors" title="Editar"
                        >
                          <Edit2 size={16} strokeWidth={2} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors" title="Eliminar"
                        >
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={13} className="px-5 py-12 text-center text-gray-400 text-sm">
                  {isLoading ? 'Cargando inventario...' : 'No se encontraron artículos que coincidan con la búsqueda.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProductFormModal 
        isOpen={isModalOpen} 
        productToEdit={productToEdit} 
        onClose={() => setIsModalOpen(false)} 
        onSaveSuccess={fetchItems}
      />
      <ProductHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
    </div>
  );
}
