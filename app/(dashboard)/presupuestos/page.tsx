'use client';
import { useState, useEffect } from 'react';
import { DollarSign, Package, Save, Loader2, AlertCircle, Search } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

export default function PresupuestosPage() {
  const [areas, setAreas] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [areaBudgets, setAreaBudgets] = useState<Record<string, number>>({});
  const [productLimits, setProductLimits] = useState<Record<string, number>>({});
  
  const [savingArea, setSavingArea] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [areaSearch, setAreaSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch areas and their budgets
    const { data: areasData } = await supabase.from('areas').select('id, name').order('name');
    const { data: budgetsData } = await supabase.from('area_budgets').select('area_id, monthly_budget');
    
    // Fetch products and their limits
    const { data: productsData } = await supabase.from('inventory_items').select('id, code, name, units(name)').order('name');
    const { data: limitsData } = await supabase.from('product_limits').select('inventory_item_id, monthly_limit_units');

    if (areasData) setAreas(areasData);
    if (productsData) setProducts(productsData);

    const bMap: Record<string, number> = {};
    budgetsData?.forEach(b => bMap[b.area_id] = b.monthly_budget);
    setAreaBudgets(bMap);

    const lMap: Record<string, number> = {};
    limitsData?.forEach(l => lMap[l.inventory_item_id] = l.monthly_limit_units);
    setProductLimits(lMap);

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveAreaBudget = async (areaId: string) => {
    setSavingArea(areaId);
    const value = areaBudgets[areaId] || 0;
    
    const { error } = await supabase.from('area_budgets').upsert(
      { area_id: areaId, monthly_budget: value },
      { onConflict: 'area_id' }
    );

    if (error) alert('Error guardando presupuesto: ' + error.message);
    setSavingArea(null);
  };

  const saveProductLimit = async (productId: string) => {
    setSavingProduct(productId);
    const value = productLimits[productId] || 0;
    
    const { error } = await supabase.from('product_limits').upsert(
      { inventory_item_id: productId, monthly_limit_units: value },
      { onConflict: 'inventory_item_id' }
    );

    if (error) alert('Error guardando límite: ' + error.message);
    setSavingProduct(null);
  };

  const filteredAreas = areas.filter(a => a.name.toLowerCase().includes(areaSearch.toLowerCase()));
  
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  const totalBudgetAssigned = Object.values(areaBudgets).reduce((sum, val) => sum + (val || 0), 0);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-light text-primary tracking-tight">Presupuestos y Límites</h1>
        <p className="text-gray-500 mt-2 text-sm max-w-2xl">
          Establece topes mensuales de gasto en dólares por Área y límites máximos de unidades solicitables por Producto.
          Las requisas que excedan estos valores pasarán a estado de <span className="font-bold text-yellow-600">Pendiente de Aprobación</span>.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* SECTION 1: AREA BUDGETS */}
          <div className="bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-primary border-b-2 border-white/20 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign size={20} className="text-white" />
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-widest uppercase">Presupuesto por Área</h3>
                    <p className="text-[10px] text-white/60 uppercase tracking-widest font-semibold mt-0.5">Asignación Mensual USD</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-white/40">Total Asignado</p>
                  <p className="text-lg font-bold text-white">${totalBudgetAssigned.toFixed(2)}</p>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar área..." 
                  value={areaSearch}
                  onChange={e => setAreaSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white/10 border border-white/20 focus:outline-none focus:border-white/40 transition-colors text-white placeholder-white/50"
                />
              </div>
            </div>
            
            <div className="p-0 overflow-y-auto max-h-[600px]">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10 shadow-sm">
                  <tr className="text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                    <th className="px-6 py-3">Área Organizacional</th>
                    <th className="px-6 py-3 text-right">Tope USD Mensual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAreas.map((area) => (
                    <tr key={area.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-primary">{area.name}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <span className="text-gray-400 font-bold">$</span>
                          <input 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={areaBudgets[area.id] || ''}
                            onChange={(e) => setAreaBudgets({ ...areaBudgets, [area.id]: parseFloat(e.target.value) || 0 })}
                            className="w-28 bg-gray-50 border border-gray-200 px-3 py-1.5 text-right text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold"
                            placeholder="0.00"
                          />
                          <button 
                            onClick={() => saveAreaBudget(area.id)}
                            disabled={savingArea === area.id}
                            className={`flex items-center gap-2 px-3 py-1 text-xs font-bold transition-colors ${savingArea === area.id ? 'bg-gray-100 text-gray-400' : 'bg-primary text-white hover:bg-primary-dark'}`}
                            title="Guardar Presupuesto"
                          >
                            {savingArea === area.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Guardar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAreas.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-12 text-center text-gray-400 text-sm">
                        No se encontraron áreas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 2: PRODUCT LIMITS */}
          <div className="bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-primary border-b-2 border-white/20 p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Package size={20} className="text-white" />
                <div>
                  <h3 className="text-sm font-bold text-white tracking-widest uppercase">Límites por Producto</h3>
                  <p className="text-[10px] text-white/60 uppercase tracking-widest font-semibold mt-0.5">Consumo Global Máximo (Unidades)</p>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar producto por nombre o código..." 
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white/10 border border-white/20 focus:outline-none focus:border-white/40 transition-colors text-white placeholder-white/50"
                />
              </div>
            </div>
            
            <div className="p-0 overflow-y-auto max-h-[600px]">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10 shadow-sm">
                  <tr className="text-[9px] font-bold text-primary/70 uppercase tracking-tighter">
                    <th className="px-6 py-3">Artículo de Inventario</th>
                    <th className="px-6 py-3 text-right">Límite (Unds)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProducts.map((prod) => (
                    <tr key={prod.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                           <span className="text-sm font-semibold text-primary">{prod.name}</span>
                           <span className="text-xs text-gray-400 font-mono">{prod.code} • {prod.units?.name || 'UND'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <input 
                            type="number" 
                            min="0"
                            step="1"
                            value={productLimits[prod.id] || ''}
                            onChange={(e) => setProductLimits({ ...productLimits, [prod.id]: parseInt(e.target.value) || 0 })}
                            className="w-24 bg-gray-50 border border-gray-200 px-3 py-1.5 text-right text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold"
                            placeholder="0"
                          />
                          <button 
                            onClick={() => saveProductLimit(prod.id)}
                            disabled={savingProduct === prod.id}
                            className={`flex items-center gap-2 px-3 py-1 text-xs font-bold transition-colors ${savingProduct === prod.id ? 'bg-gray-100 text-gray-400' : 'bg-primary text-white hover:bg-primary-dark'}`}
                            title="Guardar Límite"
                          >
                            {savingProduct === prod.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Guardar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-12 text-center text-gray-400 text-sm">
                        No se encontraron productos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
