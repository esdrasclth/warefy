'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Check, X, Search, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';

// Extracted interfaces
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

interface RequisitionDraftItem {
  inventoryItem: InventoryItem;
  quantity: number;
}

interface Employee {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  area_name?: string;
  area_id?: string;
  position?: string;
}

export default function NuevaRequisaView() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  
  // Requester State
  const [requesterSearchInput, setRequesterSearchInput] = useState('');
  const [requesterResults, setRequesterResults] = useState<Employee[]>([]);
  const [requesterData, setRequesterData] = useState<Employee | null>(null);
  const [isSearchingRequester, setIsSearchingRequester] = useState(false);
  
  // Approver State
  const [approverSearchInput, setApproverSearchInput] = useState('');
  const [approverResults, setApproverResults] = useState<Employee[]>([]);
  const [approverData, setApproverData] = useState<Employee | null>(null);
  const [isSearchingApprover, setIsSearchingApprover] = useState(false);

  // Items State
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState<InventoryItem[]>([]);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState<RequisitionDraftItem[]>([]);

  // Comments
  const [comments, setComments] = useState('');

  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      const q = itemCodeInput.trim();
      if (!q) {
        setItemSearchResults([]);
        setIsSearchingItems(false);
        return;
      }
      
      setIsSearchingItems(true);
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, categories(name), units(name)')
        .eq('status', 'ACTIVE')
        .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
        .order('name')
        .limit(10);
        
      if (!error && data) {
        setItemSearchResults(data);
      }
      setIsSearchingItems(false);
    }, 300);
    
    return () => clearTimeout(searchTimer);
  }, [itemCodeInput]);

  const handleSelectItem = (item: InventoryItem) => {
    const availableStock = item.quantity - (item.committed_quantity || 0);

    if (availableStock <= 0) {
      alert(`Atención: El artículo ${item.code} no tiene stock disponible.`);
      return;
    }
    
    const exists = selectedItems.find(si => si.inventoryItem.id === item.id);
    if (exists) {
       if (exists.quantity + 1 > availableStock) {
         alert(`No puedes solicitar más de ${availableStock} unidades.`);
         return;
       }
       handleUpdateQuantity(item.id, exists.quantity + 1);
    } else {
       setSelectedItems([...selectedItems, { inventoryItem: item, quantity: 1 }]);
    }
    setItemCodeInput(''); 
    setItemSearchResults([]);
  };

  // Enhanced Employee Search Logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = requesterSearchInput.trim();
      if (!q || requesterData) { setRequesterResults([]); return; }
      setIsSearchingRequester(true);
      const { data } = await supabase
        .from('employees')
        .select('*')
        .or(`code.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(5);
      setRequesterResults(data || []);
      setIsSearchingRequester(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [requesterSearchInput, requesterData]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = approverSearchInput.trim();
      if (!q || approverData) { setApproverResults([]); return; }
      setIsSearchingApprover(true);
      const { data } = await supabase
        .from('employees')
        .select('*')
        .or(`code.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(5);
      setApproverResults(data || []);
      setIsSearchingApprover(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [approverSearchInput, approverData]);

  const handleKeyDownItemInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If there's an exact match in results, picking it
      const exactCodeMatch = itemSearchResults.find(item => item.code.toUpperCase() === itemCodeInput.trim().toUpperCase());
      if (exactCodeMatch) {
        handleSelectItem(exactCodeMatch);
      } else if (itemSearchResults.length > 0) {
        // Just pick the first result if there's no exact match but results exist (e.g scanning by barcode)
        handleSelectItem(itemSearchResults[0]);
      }
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter(si => si.inventoryItem.id !== itemId));
  };

  const handleUpdateQuantity = (itemId: string, newQuantity: number | string) => {
    setSelectedItems(selectedItems.map(si => {
      if (si.inventoryItem.id === itemId) {
        if (newQuantity === "") {
          return { ...si, quantity: 0 };
        }
        
        let validQuantity = Number(newQuantity);
        const availableStock = si.inventoryItem.quantity - (si.inventoryItem.committed_quantity || 0);
        
        if (validQuantity < 0) validQuantity = 0;
        if (validQuantity > availableStock) {
           validQuantity = availableStock;
        }
        
        return { ...si, quantity: validQuantity };
      }
      return si;
    }));
  };

  const handleSubmit = async () => {
    if (!requesterData || !approverData || selectedItems.length === 0) {
      alert('Debes identificar al solicitante, al aprobador, y agregar al menos 1 artículo.');
      return;
    }

    const hasZeroQuantity = selectedItems.some(item => (item.quantity || 0) <= 0);
    if (hasZeroQuantity) {
      alert('Asegúrate de que todos los artículos tengan una cantidad válida (mayor a 0).');
      return;
    }

    setIsSaving(true);
    try {
      const totalCost = selectedItems.reduce((acc, curr) => acc + (curr.quantity * curr.inventoryItem.price), 0);
      
      // --- BUDGETS & LIMITS VALIDATION ---
      let isOverLimit = false;
      let limitReasons: string[] = [];
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      // 1. Check Area Budget
      if (requesterData.area_id) {
        const { data: bData } = await supabase.from('area_budgets').select('monthly_budget').eq('area_id', requesterData.area_id).single();
        if (bData && bData.monthly_budget > 0) {
          // Calculate consumed this month
          const { data: reqsMonth } = await supabase.from('requisitions')
            .select('total_cost')
            .eq('area_name', requesterData.area_name || 'General')
            .neq('status', 'CANCELADA')
            .gte('created_at', startOfMonth);
            
          const consumedBudget = reqsMonth?.reduce((acc, r) => acc + (Number(r.total_cost) || 0), 0) || 0;
          if (consumedBudget + totalCost > bData.monthly_budget) {
            isOverLimit = true;
            limitReasons.push(`El costo ($${totalCost.toFixed(2)}) excede el presupuesto mensual disponible del Área ($${(bData.monthly_budget - consumedBudget).toFixed(2)} restantes).`);
          }
        }
      }

      // 2. Check Product Limits
      const itemIds = selectedItems.map(si => si.inventoryItem.id);
      const { data: limitsData } = await supabase.from('product_limits').select('inventory_item_id, monthly_limit_units').in('inventory_item_id', itemIds);
      
      if (limitsData && limitsData.length > 0) {
        // Fetch consumed units this month for these items
        const { data: consumedItems } = await supabase.from('requisition_items')
          .select('inventory_item_id, quantity, requisitions!inner(status, created_at)')
          .in('inventory_item_id', itemIds)
          .gte('requisitions.created_at', startOfMonth)
          .neq('requisitions.status', 'CANCELADA');
          
        const consumptionMap: Record<string, number> = {};
        consumedItems?.forEach((ci: any) => {
          consumptionMap[ci.inventory_item_id] = (consumptionMap[ci.inventory_item_id] || 0) + ci.quantity;
        });

        for (const limit of limitsData) {
          if (limit.monthly_limit_units > 0) {
            const consumed = consumptionMap[limit.inventory_item_id] || 0;
            const requested = selectedItems.find(si => si.inventoryItem.id === limit.inventory_item_id)?.quantity || 0;
            if (consumed + requested > limit.monthly_limit_units) {
              isOverLimit = true;
               const itemName = selectedItems.find(si => si.inventoryItem.id === limit.inventory_item_id)?.inventoryItem.name;
              limitReasons.push(`El artículo "${itemName}" excede su límite global mensual de ${limit.monthly_limit_units} unidades (${consumed} ya consumidas).`);
            }
          }
        }
      }

      const finalStatus = isOverLimit ? 'PENDIENTE DE APROBACION' : 'PENDIENTE';
      if (isOverLimit) {
        alert(`🚨 ATENCIÓN: Esta requisa excedió los límites establecidos.\n\nMotivos:\n- ${limitReasons.join('\n- ')}\n\nLa requisa será guardada con estado "PENDIENTE DE APROBACION" y requiere revisión gerencial.`);
      }
      // --- END VALIDATION ---

      const { data: reqData, error: reqError } = await supabase
        .from('requisitions')
        .insert({
          requester_code: requesterData.code,
          requester_name: `${requesterData.first_name} ${requesterData.last_name}`,
          area_id: requesterData.area_id,
          area_name: requesterData.area_name || 'General',
          approver_code: approverData.code,
          approver_name: `${approverData.first_name} ${approverData.last_name}`,
          status: finalStatus,
          total_cost: totalCost,
          comments: comments.trim() || null
        })
        .select()
        .single();
        
      if (reqError) throw reqError;
      
      const reqItemsData = selectedItems.map(si => ({
        requisition_id: reqData.id,
        inventory_item_id: si.inventoryItem.id,
        quantity: si.quantity,
        unit_cost: si.inventoryItem.price
      }));
      
      const { error: itemsError } = await supabase.from('requisition_items').insert(reqItemsData);
      if (itemsError) throw itemsError;
      
      router.push('/requisar');
      
    } catch (error: any) {
      console.error(error);
      alert('Error guardando la requisa: ' + error.message);
      setIsSaving(false);
    }
  };


  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-6">
        <div className="flex items-center gap-4">
          <Link href="/requisar" className="p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-light text-primary tracking-tight">Nueva Requisa Directa</h1>
            <p className="text-gray-500 mt-1 text-sm">Registro rápido utilizando códigos de empleado y catálogo.</p>
          </div>
        </div>
        
        <button 
          onClick={handleSubmit} disabled={isSaving || selectedItems.length === 0 || !requesterData || !approverData}
          className="flex items-center gap-2 bg-primary text-background px-6 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Generar Requisa
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Responsibles */}
        <div className="space-y-8">
          
          {/* Box: Solicitante */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm relative">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-4">
              1. Identificación del Solicitante
            </h3>
            
            <div className="relative mb-4">
              <div className="flex items-center bg-gray-50 border border-gray-200 group focus-within:border-primary transition-colors">
                <div className="pl-3 pr-2 text-gray-400">
                  <Search size={18} />
                </div>
                <input 
                  type="text" 
                  placeholder="Escribe Nombre o Código de Empleado..." 
                  value={requesterSearchInput}
                  onChange={e => setRequesterSearchInput(e.target.value)}
                  disabled={!!requesterData}
                  className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none disabled:opacity-50"
                />
                {isSearchingRequester && (
                  <div className="pr-3">
                    <Loader2 size={16} className="animate-spin text-primary" />
                  </div>
                )}
              </div>

              {/* Dropdown Results */}
              {requesterResults.length > 0 && !requesterData && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-[60] max-h-48 overflow-y-auto">
                  {requesterResults.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => { setRequesterData(emp); setRequesterSearchInput(`${emp.first_name} ${emp.last_name}`); setRequesterResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <p className="text-sm font-semibold text-primary">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[10px] text-gray-400 font-mono italic">{emp.code} • {emp.position || 'Emp.'} • {emp.area_name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {requesterData && (
              <div className="bg-green-50 border border-green-100 p-4 flex justify-between items-center animate-in zoom-in-95 duration-200">
                <div>
                  <p className="text-sm font-bold text-green-800">{requesterData.first_name} {requesterData.last_name}</p>
                  <p className="text-xs text-green-600 font-mono mt-0.5">{requesterData.code} • {requesterData.position || 'Empleado'} • {requesterData.area_name}</p>
                </div>
                <button onClick={() => { setRequesterData(null); setRequesterSearchInput(''); }} className="text-green-600 hover:text-green-800 p-1 bg-green-100/50">
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Box: Aprobador */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm relative">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-4">
              2. Identificación del Aprobador
            </h3>
            
            <div className="relative mb-4">
               <div className="flex items-center bg-gray-50 border border-gray-200 group focus-within:border-primary transition-colors">
                <div className="pl-3 pr-2 text-gray-400">
                  <Search size={18} />
                </div>
                <input 
                  type="text" 
                  placeholder="Escribe Nombre o Código de Supervisor..." 
                  value={approverSearchInput}
                  onChange={e => setApproverSearchInput(e.target.value)}
                  disabled={!!approverData}
                  className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none disabled:opacity-50"
                />
                {isSearchingApprover && (
                  <div className="pr-3">
                    <Loader2 size={16} className="animate-spin text-primary" />
                  </div>
                )}
              </div>

              {/* Dropdown Results */}
              {approverResults.length > 0 && !approverData && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-[60] max-h-48 overflow-y-auto">
                  {approverResults.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => { setApproverData(emp); setApproverSearchInput(`${emp.first_name} ${emp.last_name}`); setApproverResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <p className="text-sm font-semibold text-primary">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[10px] text-gray-400 font-mono italic">{emp.code} • {emp.position || 'Supervisor'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {approverData && (
              <div className="bg-gray-50 border border-gray-100 p-4 flex justify-between items-center animate-in zoom-in-95 duration-200">
                <div>
                  <p className="text-sm font-bold text-primary">{approverData.first_name} {approverData.last_name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{approverData.code} • {approverData.position || 'Supervisor'}</p>
                </div>
                <button onClick={() => { setApproverData(null); setApproverSearchInput(''); }} className="text-gray-500 hover:text-primary p-1 bg-gray-100/50">
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Box: Comentarios */}
          <div className="bg-white border border-gray-100 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-4">
              3. Comentarios y Justificación
            </h3>
            <textarea 
              placeholder="Agregue aquí cualquier nota o justificación adicional para esta requisa..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              className="w-full h-32 p-4 text-sm bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:outline-none transition-all resize-none text-primary placeholder-gray-400"
            />
          </div>

        </div>

        {/* Right Column: Items */}
        <div className="bg-white border border-gray-100 p-6 shadow-sm flex flex-col h-[600px] relative">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3 mb-4">
            4. Registro de Artículos
          </h3>
          
          <div className="relative mb-6">
            <div className="flex gap-3">
              <input 
                type="text" 
                placeholder="Buscar por Nombre o escanear Código..." 
                value={itemCodeInput}
                onChange={e => setItemCodeInput(e.target.value)}
                onKeyDown={handleKeyDownItemInput}
                className="flex-1 border border-gray-200 bg-gray-50 focus:bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors shadow-inner"
                autoFocus
              />
              <div className="bg-gray-100 text-gray-400 px-4 py-2 text-sm flex items-center justify-center border border-transparent">
                {isSearchingItems ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </div>
            </div>

            {/* Dropdown Results */}
            {itemSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl z-50 max-h-60 overflow-y-auto">
                {itemSearchResults.map(item => {
                  const availableStock = item.quantity - (item.committed_quantity || 0);
                  const hasStock = availableStock > 0;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      disabled={!hasStock}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-center justify-between transition-colors ${
                        hasStock ? 'hover:bg-gray-50 cursor-pointer' : 'bg-gray-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-primary">{item.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono tracking-wider">{item.code} • {item.categories?.name}</span>
                      </div>
                      <div className={`text-xs font-bold ${hasStock ? 'text-primary' : 'text-red-400'}`}>
                        {availableStock} dispo.
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 border border-gray-200 bg-gray-50/50 p-2 custom-scrollbar">
            {selectedItems.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm opacity-60">
                 <Search size={32} className="mb-2" />
                 Ingresa códigos para poblar la lista.
               </div>
            ) : (
              selectedItems.map((item, i) => {
                const availableStock = item.inventoryItem.quantity - (item.inventoryItem.committed_quantity || 0);
                
                return (
                  <div key={item.inventoryItem.id} className="flex items-center gap-3 bg-white border border-gray-100 p-3 shadow-sm group animate-in slide-in-from-top-2">
                     <span className="text-xs font-bold text-gray-300 w-4 text-center">{i + 1}</span>
                     <div className="flex-1 min-w-0">
                       <p className="text-sm font-semibold text-primary truncate">{item.inventoryItem.name}</p>
                       <div className="flex items-center gap-2 mt-0.5">
                         <p className="text-[10px] text-gray-400 font-mono tracking-wider">{item.inventoryItem.code}</p>
                         <span className="text-[10px] text-primary/40 font-bold px-1.5 py-0.5 bg-gray-50 border border-gray-100">
                           INV: {availableStock}
                         </span>
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                       <div className="flex flex-col">
                         <span className="text-[9px] text-gray-400 uppercase tracking-widest text-center">Cant.</span>
                         <div className="flex items-center">
                           <input 
                             type="number"
                             min="1"
                             max={availableStock}
                             value={item.quantity || ""}
                             onChange={(e) => handleUpdateQuantity(item.inventoryItem.id, e.target.value)}
                             className="w-16 border border-gray-200 px-2 py-1 text-sm text-center focus:outline-none focus:border-primary font-bold text-primary"
                           />
                         </div>
                       </div>
                       <button onClick={() => handleRemoveItem(item.inventoryItem.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors mt-3">
                         <Trash2 size={16} />
                       </button>
                     </div>
                  </div>
                );
              })
            )}
          </div>
          
          {selectedItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center px-2">
              <span className="text-sm text-gray-500">Total de Artículos Diversos:</span>
              <span className="text-lg font-bold text-primary">{selectedItems.length}</span>
            </div>
          )}
          
        </div>

      </div>
    </div>
  );
}
