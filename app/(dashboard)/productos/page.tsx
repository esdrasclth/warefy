'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, Eye, Loader2, FileSpreadsheet, ClipboardList, AlertTriangle } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useUrlFilterState } from '@/utils/useUrlFilterState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import Link from 'next/link';
import ProductFormModal, { ProductData } from '@/components/almacen/ProductFormModal';
import { supabase } from '@/utils/supabase/client';
import { fetchAllRows } from '@/utils/supabase/fetchAll';
import type { InventoryItem } from '@/types';

const ITEMS_PER_PAGE = 50;

// Columnas de la vista enriquecida. `inventory_items_enriched` expone i.* mas
// search_text, pending_oc y avg_consumption; los embeds siguen resolviendose
// porque la vista deja pasar category_id, unit_id y package_unit_id intactos.
const SELECT_COLS = `
  *,
  categories(name),
  units!unit_id(name),
  package_unit:units!package_unit_id(name)
`;

// PostgREST trata % y _ como comodines en ilike; hay que escaparlos para que
// una busqueda literal no se convierta en un comodin accidental.
// pending_oc y avg_consumption vienen de agregados numeric. Se normalizan a
// number para que el JSX pueda hacer .toFixed() sin depender de como serialice
// PostgREST cada tipo.
const toItems = (data: unknown): InventoryItem[] =>
  ((data as Record<string, unknown>[] | null) || []).map((row) => ({
    ...row,
    pending_oc: Number(row.pending_oc) || 0,
    avg_consumption: Number(row.avg_consumption) || 0,
  })) as unknown as InventoryItem[];

const escapeLike = (v: string) => v.replace(/%/g, '\\%').replace(/_/g, '\\_');

export default function AlmacenPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useUrlFilterState('q', '', { debounceMs: 300 });
  const [lowStockRaw, setLowStockRaw] = useUrlFilterState('bajo', '');
  const lowStockOnly = lowStockRaw === '1';
  const [productToEdit, setProductToEdit] = useState<ProductData | null>(null);

  // `items` ahora es SOLO la pagina visible. Los totales los calcula Postgres:
  // traer el catalogo entero para contar y filtrar en JS era lo que chocaba con
  // el limite de 1000 filas de PostgREST.
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // La busqueda se debouncea aparte: useUrlFilterState solo retrasa el sync de
  // la URL, el valor que devuelve es inmediato.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim().toLowerCase());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Unico lugar donde viven los filtros, compartido por la consulta de pagina y
  // la de exportacion, para que el Excel corresponda exactamente a lo que se ve.
  const buildQuery = useCallback((opts?: { count: 'exact' }) => {
    let q = supabase.from('inventory_items_enriched').select(SELECT_COLS, opts);
    if (debouncedSearch) q = q.ilike('search_text', `%${escapeLike(debouncedSearch)}%`);
    if (lowStockOnly) q = q.eq('is_below_min', true);
    return q;
  }, [debouncedSearch, lowStockOnly]);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const [pageRes, lowRes] = await Promise.all([
        buildQuery({ count: 'exact' })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
        // El contador del boton "bajo minimo" es global (no lo afecta la
        // busqueda), asi que va contra la tabla base, que tiene el indice
        // parcial sobre is_below_min y evita evaluar los agregados de la vista.
        supabase
          .from('inventory_items')
          .select('id', { count: 'exact', head: true })
          .eq('is_below_min', true),
      ]);

      if (pageRes.error) throw pageRes.error;

      setItems(toItems(pageRes.data));
      setTotalCount(pageRes.count || 0);
      setLowStockCount(lowRes.count || 0);
    } catch (error: unknown) {
      console.error('Error fetching inventory:', error);
      const message = error instanceof Error ? error.message : 'Error inesperado.';
      toast.error('Error cargando datos: ' + message);
    }
    setIsLoading(false);
  }, [currentPage, buildQuery, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Con paginacion de servidor ya no sirve parchear filas en memoria: un cambio
  // puede sacar o meter un articulo en la pagina actual, o mover los totales.
  // Se refresca la pagina visible con debounce para no recargar en cada evento.
  const fetchItemsRef = useRef(fetchItems);
  fetchItemsRef.current = fetchItems;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel('almacen-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => fetchItemsRef.current(), 400);
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDelete = async (idToDelete: string, itemName: string) => {
    const [reqCheck, ocCheck] = await Promise.all([
      supabase.from('requisition_items').select('id', { count: 'exact', head: true }).eq('inventory_item_id', idToDelete),
      supabase.from('purchase_items').select('id', { count: 'exact', head: true }).eq('inventory_item_id', idToDelete),
    ]);

    const reqCount = reqCheck.count ?? 0;
    const ocCount = ocCheck.count ?? 0;

    if (reqCount > 0 || ocCount > 0) {
      const refs = [
        reqCount > 0 ? `${reqCount} requisa(s)` : '',
        ocCount > 0 ? `${ocCount} orden(es) de compra` : '',
      ].filter(Boolean).join(' y ');
      toast.error(`"${itemName}" tiene ${refs}. Márcalo como INACTIVO en lugar de eliminarlo.`);
      return;
    }

    const ok = await confirm({
      title: 'Eliminar producto',
      message: `¿Eliminar "${itemName}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase.from('inventory_items').delete().eq('id', idToDelete);
    if (error) toast.error('Error eliminando: ' + error.message);
    else fetchItems();
  };

  const handleEditClick = (product: InventoryItem) => {
    setProductToEdit({
      id: product.id,
      code: product.code,
      name: product.name,
      category_id: product.category_id!,
      unit_id: product.unit_id!,
      quantity: product.quantity,
      min_stock: product.min_stock,
      max_stock: product.max_stock,
      price: product.price,
      status: product.status,
      image_url: product.image_url,
      preferred_supplier_id: (product as any).preferred_supplier_id ?? null,
      origin: product.origin ?? 'LOCAL',
      lead_time_days: product.lead_time_days ?? 5,
      min_order_qty: product.min_order_qty ?? 1,
      package_unit_id: (product as any).package_unit_id ?? null,
      units_per_package: product.units_per_package ?? null,
      is_assignable: product.is_assignable ?? false,
    });
    setIsModalOpen(true);
  };

  const handleNewClick = () => {
    setProductToEdit(null);
    setIsModalOpen(true);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // Mismos filtros que la pantalla, pero trayendo TODAS las coincidencias:
      // la tabla muestra una pagina, el Excel se espera completo.
      const { rows, error, truncated } = await fetchAllRows((from, to) =>
        buildQuery()
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      );

      if (error) { toast.error('Error al exportar: ' + error.message); return; }

      const exportItems = toItems(rows);
      if (exportItems.length === 0) {
        toast.warning('No hay datos para exportar.');
        return;
      }

      const XLSX = await import('xlsx');

      const dataToExport = exportItems.map(item => ({
        'Código': item.code,
        'Artículo': item.name,
        'Categoría': item.categories?.name || 'N/A',
        'Unidad': item.units?.name || 'UND',
        'Existencia': item.quantity || 0,
        'OC Pendiente': item.pending_oc || 0,
        'Comprometido': item.committed_quantity || 0,
        'Disponible': (item.quantity || 0) - (item.committed_quantity || 0),
        'Consumo Prom.': (item.avg_consumption || 0).toFixed(2),
        'Mínimo': item.min_stock || 0,
        'Máximo': item.max_stock || 0,
        'Precio ($)': item.price || 0,
        'Total ($)': (item.quantity || 0) * (item.price || 0),
        'Estado': item.status === 'ACTIVE' ? 'ACTIVO' : 'INACTIVO'
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
      worksheet['!cols'] = [
        { wch: 10 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }
      ];

      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Inventario_Warefy_${date}.xlsx`);

      if (truncated) {
        toast.warning('Se alcanzó el máximo de filas exportables; el archivo está incompleto.');
      } else {
        toast.success(`${exportItems.length.toLocaleString()} artículos exportados.`);
      }
    } catch (e: unknown) {
      toast.error('Error al exportar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Productos</h1>
          <p className="text-gray-500 mt-2 text-sm">Catálogo de artículos y control de existencias.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 flex-1 sm:flex-none bg-green-700 hover:bg-green-800 text-white px-5 py-3 text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
          >
            {isExporting
              ? <Loader2 size={16} className="animate-spin" />
              : <FileSpreadsheet size={16} />
            }
            {isExporting ? 'Exportando…' : 'Exportar Excel'}
          </button>
          <Link
            href="/productos/conteo"
            className="flex items-center justify-center gap-2 flex-1 sm:flex-none bg-white border border-gray-200 text-primary px-5 py-3 text-sm font-semibold hover:border-primary hover:bg-gray-50 transition-all shadow-sm"
          >
            <ClipboardList size={16} />
            Conteo Físico
          </Link>
          <button
            onClick={handleNewClick}
            className="flex items-center justify-center gap-2 flex-1 sm:flex-none bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nuevo Artículo
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
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
        <button
          type="button"
          onClick={() => {
            setLowStockRaw(lowStockOnly ? '' : '1');
            setCurrentPage(1);
          }}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest border transition-colors shadow-sm ${
            lowStockOnly
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-primary'
          }`}
        >
          <AlertTriangle size={16} />
          Bajo mínimo
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] leading-none ${
            lowStockOnly ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}>
            {lowStockCount}
          </span>
        </button>
      </div>

      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden relative min-h-[400px]">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">
            Catálogo de Inventario — {totalCount.toLocaleString()} artículos
          </h2>
        </div>


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
              {isLoading ? (
                <TableSkeleton rows={12} cols={13} />
              ) : items.length > 0 ? (
                items.map((item) => {
                  const stock = item.quantity || 0;
                  const committed = item.committed_quantity || 0;
                  const available = stock - committed;
                  const min = item.min_stock || 0;
                  const price = item.price || 0;

                  const totalCost = stock * price;
                  const isLowStock = available <= min;
                  const avgDaily = (item.avg_consumption || 0) / 30;
                  const leadTime = item.lead_time_days || 7;
                  const suggestedMin = avgDaily > 0 ? Math.ceil(avgDaily * leadTime) : null;
                  const suggestedMax = suggestedMin !== null ? Math.ceil(suggestedMin + avgDaily * 30) : null;

                  return (
                    <tr key={item.id} className="hover:bg-blue-50/20 transition-colors group border-b border-gray-50">
                      <td className="py-2 px-3 text-[11px] font-mono text-primary truncate">{item.code}</td>
                      <td className="py-2 px-3 text-xs text-gray-700 font-medium group-hover:text-primary transition-colors truncate">
                        <div className="flex flex-col">
                          <span className="truncate">{item.name}</span>
                          <span className="text-[9px] text-gray-400 font-normal uppercase">
                            {item.units?.name || 'UND'}
                            {item.units_per_package && (item as any).package_unit?.name && (
                              <span className="ml-1 text-blue-400">
                                · {(item as any).package_unit.name} ×{item.units_per_package}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[10px] text-gray-500 uppercase truncate">{item.categories?.name || 'N/A'}</td>

                      <td className="py-2 px-3 text-xs text-right font-bold text-gray-500">
                        {stock.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-xs text-right text-blue-600 font-bold bg-blue-50/30">
                        {(item.pending_oc ?? 0) > 0 ? `+${(item.pending_oc ?? 0).toLocaleString()}` : '-'}
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
                        {(item.avg_consumption ?? 0) > 0 ? (item.avg_consumption ?? 0).toFixed(1) : '0.0'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-[10px] text-gray-400 font-mono block">{item.min_stock}/{item.max_stock}</span>
                        {suggestedMin !== null && (
                          <span className="text-[9px] text-blue-400 font-mono block">
                            Sug: {suggestedMin}/{suggestedMax}
                          </span>
                        )}
                      </td>
                      <td className={`py-2 px-3 text-xs text-right font-mono ${price === 0 ? 'text-orange-400 font-bold' : 'text-gray-600'}`}>
                        {price === 0 ? '⚠ $0.00' : `$${price.toFixed(2)}`}
                      </td>
                      <td className="py-2 px-3 text-xs text-right font-bold text-primary font-mono">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

                      <td className="py-2 px-3 text-center">
                        <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${item.status === 'ACTIVE' ? 'text-green-600 border-green-200 bg-green-50' : 'text-gray-300 border-gray-100 bg-gray-50'
                          }`}>
                          {item.status === 'ACTIVE' ? 'ACT' : 'INA'}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/productos/historial/${item.id}`}
                            className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                            title="Ver Historial"
                          >
                            <Eye size={14} strokeWidth={2} />
                          </Link>
                          <button
                            onClick={() => handleEditClick(item)}
                            className="text-gray-400 hover:text-primary transition-colors p-1" title="Editar"
                          >
                            <Edit2 size={14} strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.name)}
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
                    No se encontraron artículos que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage - 1}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={ITEMS_PER_PAGE}
          itemLabel="productos"
          onPageChange={(p) => setCurrentPage(p + 1)}
        />
      </div>

      <ProductFormModal
        isOpen={isModalOpen}
        productToEdit={productToEdit}
        onClose={() => setIsModalOpen(false)}
        onSaveSuccess={fetchItems}
      />
    </div>
  );
}
