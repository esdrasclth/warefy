'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Eye, Loader2 } from 'lucide-react';
import ProductFormModal, { ProductData } from '@/components/almacen/ProductFormModal';
import ProductHistoryModal from '@/components/almacen/ProductHistoryModal';
import { supabase } from '@/utils/supabase/client';
import type { InventoryItem } from '@/types';

export default function AlmacenPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyProduct, setHistoryProduct] = useState<InventoryItem | null>(null);
  const [productToEdit, setProductToEdit] = useState<ProductData | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Inventory Items
      const { data: invData, error: invError } = await supabase
        .from('inventory_items')
        .select('*, categories(name), units(name)')
        .order('created_at', { ascending: false });

      if (invError) throw invError;

      // 2. Fetch PENDING Purchase Items (to calculate OC)
      const { data: ocData, error: ocError } = await supabase
        .from('purchase_items')
        .select('inventory_item_id, quantity, purchases!inner(status)')
        .eq('purchases.status', 'PENDIENTE');

      if (ocError) throw ocError;

      // 3. Fetch Requisition Items from last 6 months (to calculate Average Consumption)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const { data: reqData, error: reqError } = await supabase
        .from('requisition_items')
        .select('inventory_item_id, quantity, requisitions!inner(status, created_at)')
        .eq('requisitions.status', 'ENTREGADA') // or however delivered is marked
        .gte('requisitions.created_at', sixMonthsAgo.toISOString());

      if (reqError) throw reqError;

      // Aggregate data
      const ocMap: Record<string, number> = {};
      ocData?.forEach(item => {
        ocMap[item.inventory_item_id] = (ocMap[item.inventory_item_id] || 0) + item.quantity;
      });

      const consumptionMap: Record<string, number> = {};
      reqData?.forEach(item => {
        consumptionMap[item.inventory_item_id] = (consumptionMap[item.inventory_item_id] || 0) + item.quantity;
      });

      const enrichedItems = invData?.map(item => ({
        ...item,
        pending_oc: ocMap[item.id] || 0,
        avg_consumption: (consumptionMap[item.id] || 0) / 6
      }));

      setItems(enrichedItems || []);
    } catch (error: unknown) {
      console.error('Error fetching inventory:', error);
      const message = error instanceof Error ? error.message : 'Error inesperado.';
      alert('Error cargando datos: ' + message);
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

  const handleEditClick = (product: InventoryItem) => {
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

      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden relative min-h-[400px]">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Catálogo de Inventario — {items.length.toLocaleString()} artículos totales
          </h2>
        </div>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : null}

        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse table-fixed min-w-[1200px] lg:min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
              <th className="py-2 px-3 w-[80px]">Código</th>
              <th className="py-2 px-3 w-[200px]">Artículo</th>
              <th className="py-2 px-3 w-[100px]">Categoría</th>
              <th className="py-2 px-3 w-[100px] text-right">Existencia</th>
              <th className="py-2 px-3 w-[80px] text-right">OC Pen.</th>
              <th className="py-2 px-3 w-[80px] text-right">Comprom.</th>
              <th className="py-2 px-3 w-[80px] text-right">Dispo.</th>
              <th className="py-2 px-3 w-[90px] text-right">Cons. Prom.</th>
              <th className="py-2 px-3 w-[80px] text-right">Mín/Máx</th>
              <th className="py-2 px-3 w-[90px] text-right">Precio</th>
              <th className="py-2 px-3 w-[100px] text-right">Total</th>
              <th className="py-2 px-3 w-[70px] text-center">Estado</th>
              <th className="py-2 px-3 w-[100px] text-center sticky right-0 bg-gray-50 border-l border-gray-100 z-10">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
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
                  <tr key={item.id} className="hover:bg-blue-50/20 transition-colors group border-b border-gray-50">
                    <td className="py-2 px-3 text-[11px] font-mono text-primary truncate">{item.code}</td>
                    <td className="py-2 px-3 text-xs text-gray-700 font-medium group-hover:text-primary transition-colors truncate">
                      <div className="flex flex-col">
                        <span className="truncate">{item.name}</span>
                        <span className="text-[9px] text-gray-400 font-normal uppercase">{item.units?.name || 'UND'}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-[10px] text-gray-500 uppercase truncate">{item.categories?.name || 'N/A'}</td>

                    <td className="py-2 px-3 text-xs text-right font-bold text-gray-500">
                      {stock.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-xs text-right text-blue-600 font-bold bg-blue-50/30">
                      {item.pending_oc > 0 ? `+${item.pending_oc.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-xs text-right text-orange-400 font-medium">
                      {committed > 0 ? committed.toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-3 text-xs text-right font-black">
                      <span className={isLowStock ? 'text-red-600 bg-red-50 px-1.5 py-0.5 border border-red-100 ring-2 ring-white shadow-sm' : 'text-primary'}>
                        {available.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-right text-purple-600 font-semibold italic">
                      {item.avg_consumption > 0 ? item.avg_consumption.toFixed(1) : '0.0'}
                    </td>
                    <td className="py-2 px-3 text-[10px] text-right text-gray-400 font-mono">
                      {item.min_stock}/{item.max_stock}
                    </td>
                    <td className="py-2 px-3 text-xs text-right text-gray-600 font-mono">${price.toFixed(2)}</td>
                    <td className="py-2 px-3 text-xs text-right font-bold text-primary font-mono">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

                    <td className="py-2 px-3 text-center">
                      <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${item.status === 'ACTIVE' ? 'text-green-600 border-green-200 bg-green-50' : 'text-gray-300 border-gray-100 bg-gray-50'
                        }`}>
                        {item.status === 'ACTIVE' ? 'ACT' : 'INA'}
                      </span>
                    </td>

                    <td className="py-2 px-3 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setHistoryProduct(item)}
                          className="text-gray-400 hover:text-blue-500 transition-colors p-1" title="Ver Historial"
                        >
                          <Eye size={14} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => handleEditClick(item)}
                          className="text-gray-400 hover:text-primary transition-colors p-1" title="Editar"
                        >
                          <Edit2 size={14} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Eliminar"
                        >
                          <Trash2 size={14} strokeWidth={2} />
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
