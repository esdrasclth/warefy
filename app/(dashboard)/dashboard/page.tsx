'use client';
import { useState, useEffect, useCallback } from 'react';
import { Package, Wallet, ClipboardList, Activity, ArrowRight, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { CardsSkeleton, TableSkeleton } from '@/components/ui/TableSkeleton';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell, LabelList } from 'recharts';
import type { InventoryItem, Requisition } from '@/types';

interface ActivityRequisition extends Pick<Requisition, 'id' | 'consecutive' | 'created_at' | 'status' | 'area_name'> { }

interface StockAlertItem extends InventoryItem {
  minimum_stock?: number;
}

interface BudgetChartRow {
  name: string;
  presupuesto: number;
  consumido: number;
}

interface TimelineChartRow {
  mes: string;
  consumo: number;
}

interface ProductChartRow {
  code: string;
  name: string;
  cost: number;
}

interface CategoryChartRow {
  name: string;
  value: number;
}

interface AreaChartRow {
  name: string;
  consumido: number;
}

interface DashboardState {
  isLoading: boolean;
  metrics: {
    totalProducts: number;
    totalInventoryValue: number;
    totalBudget: number;
    totalRequisitionsMTD: number;
    monthlyCost: number;
  };
  recentActivity: ActivityRequisition[];
  stockAlerts: StockAlertItem[];
  timelineChartData: TimelineChartRow[];
  productChartDataByPeriod: Record<string, ProductChartRow[]>;
  categoryChartDataByPeriod: Record<string, CategoryChartRow[]>;
  areaChartDataByPeriod: Record<string, AreaChartRow[]>;
  budgetChartData: BudgetChartRow[];
}

type ProductPeriod = '1m' | '3m' | '6m' | '12m';

export default function DashboardPage() {
  const [productPeriod, setProductPeriod] = useState<ProductPeriod>('1m');
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const now = new Date();
  const isCurrentMonth = selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth();
  const navigateMonth = (dir: -1 | 1) => setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
  const [state, setState] = useState<DashboardState>({
    isLoading: true,
    metrics: { totalProducts: 0, totalInventoryValue: 0, totalBudget: 0, totalRequisitionsMTD: 0, monthlyCost: 0 },
    recentActivity: [],
    stockAlerts: [],
    timelineChartData: [],
    productChartDataByPeriod: { '1m': [], '3m': [], '6m': [], '12m': [] },
    categoryChartDataByPeriod: { '1m': [], '3m': [], '6m': [], '12m': [] },
    areaChartDataByPeriod: { '1m': [], '3m': [], '6m': [], '12m': [] },
    budgetChartData: [],
  });

  // Fast queries: metrics, recent activity, stock alerts — called on realtime too
  const fetchLiveMetrics = useCallback(async (month: Date) => {
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

    const [
      { count: prodCount },
      { data: budgets },
      { count: reqCount },
      { data: deliveredItems },
      { data: recentReqs },
      { data: stockItems },
      { data: areasWithBudgets },
    ] = await Promise.all([
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabase.from('area_budgets').select('monthly_budget'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).lt('created_at', monthEnd),
      // Only ENTREGADA, using delivered_quantity for accurate cost
      supabase.from('requisition_items')
        .select('quantity, delivered_quantity, unit_cost, requisitions!inner(area_name, status, created_at)')
        .eq('requisitions.status', 'ENTREGADA')
        .gte('requisitions.created_at', monthStart)
        .lt('requisitions.created_at', monthEnd),
      supabase.from('requisitions').select('id, consecutive, created_at, status, area_name').gte('created_at', monthStart).lt('created_at', monthEnd).order('created_at', { ascending: false }).limit(5),
      supabase.from('inventory_items').select('id, name, code, quantity, committed_quantity, min_stock, max_stock, price, status').eq('status', 'ACTIVE'),
      supabase.from('area_budgets').select('monthly_budget, areas(name)'),
    ]);

    const totalBudget = budgets?.reduce((acc, b) => acc + (Number(b.monthly_budget) || 0), 0) || 0;
    const totalInventoryValue = stockItems?.reduce((acc, i) => acc + ((i.quantity || 0) * (i.price || 0)), 0) || 0;
    const alerts = stockItems
      ?.filter(item => (item.quantity - (item.committed_quantity || 0)) <= (item.min_stock || 0))
      .sort((a, b) => (a.quantity - (a.committed_quantity || 0)) - (b.quantity - (b.committed_quantity || 0)))
      .slice(0, 10) || [];

    // Calculate monthlyCost and budgetMap from delivered items only
    let monthlyCost = 0;
    const budgetMap: Record<string, BudgetChartRow> = {};
    areasWithBudgets?.forEach(budget => {
      const areaName = (budget.areas as unknown as { name: string } | null)?.name;
      const bdg = Number(budget.monthly_budget) || 0;
      if (bdg > 0 && areaName) budgetMap[areaName] = { name: areaName, presupuesto: bdg, consumido: 0 };
    });
    deliveredItems?.forEach(item => {
      const req = item.requisitions as unknown as { area_name: string };
      const qty = (item.delivered_quantity ?? item.quantity) || 0;
      const cost = qty * (item.unit_cost || 0);
      monthlyCost += cost;
      if (req.area_name) {
        if (!budgetMap[req.area_name]) budgetMap[req.area_name] = { name: req.area_name, presupuesto: 0, consumido: 0 };
        budgetMap[req.area_name].consumido += cost;
      }
    });

    return {
      metrics: { totalProducts: prodCount || 0, totalInventoryValue, totalBudget, totalRequisitionsMTD: reqCount || 0, monthlyCost },
      recentActivity: (recentReqs || []) as ActivityRequisition[],
      stockAlerts: alerts as StockAlertItem[],
      budgetChartData: Object.values(budgetMap),
    };
  }, []);

  // Heavy queries: chart data — only on initial load, not on realtime
  const fetchChartData = useCallback(async (month: Date) => {
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    const twelveMonthsAgo = new Date(month.getFullYear() - 1, month.getMonth(), 1).toISOString();

    const [
      { data: timelineItems },
      { data: productItems },
      { data: categoryItems },
      { data: areaItems },
    ] = await Promise.all([
      supabase.from('requisition_items')
        .select('quantity, delivered_quantity, unit_cost, requisitions!inner(created_at, status)')
        .eq('requisitions.status', 'ENTREGADA')
        .gte('requisitions.created_at', twelveMonthsAgo)
        .lt('requisitions.created_at', monthEnd),

      supabase.from('requisition_items')
        .select('inventory_item_id, quantity, delivered_quantity, unit_cost, inventory_items!inner(name, code), requisitions!inner(created_at, status)')
        .eq('requisitions.status', 'ENTREGADA')
        .gte('requisitions.created_at', twelveMonthsAgo)
        .lt('requisitions.created_at', monthEnd),

      // Categories: now 12 months to support period filtering
      supabase.from('requisition_items')
        .select('quantity, delivered_quantity, unit_cost, inventory_items!inner(categories(name)), requisitions!inner(created_at, status)')
        .eq('requisitions.status', 'ENTREGADA')
        .gte('requisitions.created_at', twelveMonthsAgo)
        .lt('requisitions.created_at', monthEnd),

      // Areas: 12 months for period filtering
      supabase.from('requisition_items')
        .select('quantity, delivered_quantity, unit_cost, requisitions!inner(area_name, created_at, status)')
        .eq('requisitions.status', 'ENTREGADA')
        .gte('requisitions.created_at', twelveMonthsAgo)
        .lt('requisitions.created_at', monthEnd),
    ]);

    return { timelineItems, productItems, categoryItems, areaItems, month };
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setState(prev => ({ ...prev, isLoading: true }));

      try {
        const [liveData, chartData] = await Promise.all([
          fetchLiveMetrics(selectedMonth),
          fetchChartData(selectedMonth),
        ]);

        const { timelineItems, productItems, categoryItems, areaItems, month } = chartData;

        const mEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        const periodCutoffs: Record<string, Date> = {
          '1m': new Date(month.getFullYear(), month.getMonth(), 1),
          '3m': new Date(month.getFullYear(), month.getMonth() - 2, 1),
          '6m': new Date(month.getFullYear(), month.getMonth() - 5, 1),
          '12m': new Date(month.getFullYear() - 1, month.getMonth(), 1),
        };

        // Timeline map
        const timelineMap: Record<string, number> = {};
        for (let i = 11; i >= 0; i--) {
          const d = new Date(month.getFullYear(), month.getMonth() - i, 1);
          timelineMap[d.toLocaleString('es-ES', { month: 'short', year: 'numeric' })] = 0;
        }
        timelineItems?.forEach(item => {
          const req = item.requisitions as unknown as { created_at: string };
          const key = new Date(req.created_at).toLocaleString('es-ES', { month: 'short', year: 'numeric' });
          if (key in timelineMap) {
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            timelineMap[key] += qty * (item.unit_cost || 0);
          }
        });

        // Products by period
        const buildProdMap = (cutoff: Date) => {
          const map: Record<string, { code: string; name: string; cost: number }> = {};
          productItems?.forEach(item => {
            const req = item.requisitions as unknown as { created_at: string };
            const d = new Date(req.created_at);
            if (d < cutoff || d >= mEnd) return;
            const inv = item.inventory_items as unknown as { name: string; code: string };
            const pid = item.inventory_item_id;
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            if (!map[pid]) map[pid] = { code: inv?.code || 'N/A', name: inv?.name || 'Item', cost: 0 };
            map[pid].cost += qty * (item.unit_cost || 0);
          });
          return Object.values(map).sort((a, b) => b.cost - a.cost).slice(0, 15);
        };

        // Categories by period
        const buildCatMap = (cutoff: Date) => {
          const map: Record<string, number> = {};
          categoryItems?.forEach(item => {
            const req = item.requisitions as unknown as { created_at: string };
            const d = new Date(req.created_at);
            if (d < cutoff || d >= mEnd) return;
            const inv = item.inventory_items as unknown as { categories?: { name: string } | null };
            const catName = inv?.categories?.name || 'Sin Categoría';
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            map[catName] = (map[catName] || 0) + qty * (item.unit_cost || 0);
          });
          return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
        };

        // Areas by period
        const buildAreaMap = (cutoff: Date) => {
          const map: Record<string, number> = {};
          areaItems?.forEach(item => {
            const req = item.requisitions as unknown as { area_name: string; created_at: string };
            const d = new Date(req.created_at);
            if (d < cutoff || d >= mEnd) return;
            const areaName = req.area_name || 'Sin Área';
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            map[areaName] = (map[areaName] || 0) + qty * (item.unit_cost || 0);
          });
          return Object.entries(map).map(([name, consumido]) => ({ name, consumido })).sort((a, b) => b.consumido - a.consumido);
        };

        setState({
          isLoading: false,
          ...liveData,
          timelineChartData: Object.entries(timelineMap).map(([mes, consumo]) => ({
            mes: mes.charAt(0).toUpperCase() + mes.slice(1),
            consumo,
          })),
          productChartDataByPeriod: {
            '1m': buildProdMap(periodCutoffs['1m']),
            '3m': buildProdMap(periodCutoffs['3m']),
            '6m': buildProdMap(periodCutoffs['6m']),
            '12m': buildProdMap(periodCutoffs['12m']),
          },
          categoryChartDataByPeriod: {
            '1m': buildCatMap(periodCutoffs['1m']),
            '3m': buildCatMap(periodCutoffs['3m']),
            '6m': buildCatMap(periodCutoffs['6m']),
            '12m': buildCatMap(periodCutoffs['12m']),
          },
          areaChartDataByPeriod: {
            '1m': buildAreaMap(periodCutoffs['1m']),
            '3m': buildAreaMap(periodCutoffs['3m']),
            '6m': buildAreaMap(periodCutoffs['6m']),
            '12m': buildAreaMap(periodCutoffs['12m']),
          },
        });
      } catch (err) {
        console.error('Data fetching error:', err);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchDashboardData();

    // Realtime: only when viewing current month
    const currentMonth = new Date();
    const viewingCurrent = selectedMonth.getFullYear() === currentMonth.getFullYear() && selectedMonth.getMonth() === currentMonth.getMonth();
    if (!viewingCurrent) return;

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, async () => {
        // Requisition changes affect ALL charts (categories, timeline, products, areas)
        const [liveData, chartData] = await Promise.all([
          fetchLiveMetrics(selectedMonth),
          fetchChartData(selectedMonth),
        ]);

        const { timelineItems, productItems, categoryItems, areaItems, month } = chartData;

        const mEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        const periodCutoffs: Record<string, Date> = {
          '1m': new Date(month.getFullYear(), month.getMonth(), 1),
          '3m': new Date(month.getFullYear(), month.getMonth() - 2, 1),
          '6m': new Date(month.getFullYear(), month.getMonth() - 5, 1),
          '12m': new Date(month.getFullYear() - 1, month.getMonth(), 1),
        };

        const timelineMap: Record<string, number> = {};
        for (let i = 11; i >= 0; i--) {
          const d = new Date(month.getFullYear(), month.getMonth() - i, 1);
          timelineMap[d.toLocaleString('es-ES', { month: 'short', year: 'numeric' })] = 0;
        }
        timelineItems?.forEach(item => {
          const req = item.requisitions as unknown as { created_at: string };
          const key = new Date(req.created_at).toLocaleString('es-ES', { month: 'short', year: 'numeric' });
          if (key in timelineMap) {
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            timelineMap[key] += qty * (item.unit_cost || 0);
          }
        });

        const buildProdMap = (cutoff: Date) => {
          const map: Record<string, { code: string; name: string; cost: number }> = {};
          productItems?.forEach(item => {
            const req = item.requisitions as unknown as { created_at: string };
            const d = new Date(req.created_at);
            if (d < cutoff || d >= mEnd) return;
            const inv = item.inventory_items as unknown as { name: string; code: string };
            const pid = item.inventory_item_id;
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            if (!map[pid]) map[pid] = { code: inv?.code || 'N/A', name: inv?.name || 'Item', cost: 0 };
            map[pid].cost += qty * (item.unit_cost || 0);
          });
          return Object.values(map).sort((a, b) => b.cost - a.cost).slice(0, 15);
        };

        const buildCatMap = (cutoff: Date) => {
          const map: Record<string, number> = {};
          categoryItems?.forEach(item => {
            const req = item.requisitions as unknown as { created_at: string };
            const d = new Date(req.created_at);
            if (d < cutoff || d >= mEnd) return;
            const inv = item.inventory_items as unknown as { categories?: { name: string } | null };
            const catName = inv?.categories?.name || 'Sin Categoría';
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            map[catName] = (map[catName] || 0) + qty * (item.unit_cost || 0);
          });
          return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
        };

        const buildAreaMap = (cutoff: Date) => {
          const map: Record<string, number> = {};
          areaItems?.forEach(item => {
            const req = item.requisitions as unknown as { area_name: string; created_at: string };
            const d = new Date(req.created_at);
            if (d < cutoff || d >= mEnd) return;
            const areaName = req.area_name || 'Sin Área';
            const qty = (item.delivered_quantity ?? item.quantity) || 0;
            map[areaName] = (map[areaName] || 0) + qty * (item.unit_cost || 0);
          });
          return Object.entries(map).map(([name, consumido]) => ({ name, consumido })).sort((a, b) => b.consumido - a.consumido);
        };

        setState(prev => ({
          ...prev,
          ...liveData,
          timelineChartData: Object.entries(timelineMap).map(([mes, consumo]) => ({
            mes: mes.charAt(0).toUpperCase() + mes.slice(1),
            consumo,
          })),
          productChartDataByPeriod: {
            '1m': buildProdMap(periodCutoffs['1m']),
            '3m': buildProdMap(periodCutoffs['3m']),
            '6m': buildProdMap(periodCutoffs['6m']),
            '12m': buildProdMap(periodCutoffs['12m']),
          },
          categoryChartDataByPeriod: {
            '1m': buildCatMap(periodCutoffs['1m']),
            '3m': buildCatMap(periodCutoffs['3m']),
            '6m': buildCatMap(periodCutoffs['6m']),
            '12m': buildCatMap(periodCutoffs['12m']),
          },
          areaChartDataByPeriod: {
            '1m': buildAreaMap(periodCutoffs['1m']),
            '3m': buildAreaMap(periodCutoffs['3m']),
            '6m': buildAreaMap(periodCutoffs['6m']),
            '12m': buildAreaMap(periodCutoffs['12m']),
          },
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, async () => {
        const liveData = await fetchLiveMetrics(selectedMonth);
        setState(prev => ({ ...prev, ...liveData }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedMonth, fetchLiveMetrics, fetchChartData]);

  const { isLoading, metrics, recentActivity, stockAlerts, timelineChartData, productChartDataByPeriod, categoryChartDataByPeriod, areaChartDataByPeriod, budgetChartData } = state;
  const productChartData = productChartDataByPeriod[productPeriod] ?? [];
  const categoryChartData = categoryChartDataByPeriod[productPeriod] ?? [];
  const areaChartData = areaChartDataByPeriod[productPeriod] ?? [];

  const formatTimeAgo = (dateString: string) => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours} hr`;
    if (diffDays === 1) return 'ayer';
    return `hace ${diffDays} días`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ENTREGADA': return 'text-green-600 border-green-200';
      case 'CANCELADA': return 'text-red-500 border-red-200';
      case 'PENDIENTE': return 'text-yellow-600 border-yellow-200';
      case 'PENDIENTE DE APROBACION': return 'text-orange-600 border-orange-200';
      default: return 'text-gray-500 border-gray-200';
    }
  };

  const stats = [
    { label: 'Total Productos', value: metrics.totalProducts.toLocaleString(), icon: Package, iconBg: 'bg-blue-600', iconColor: 'text-white' },
    { label: 'Valor en Inventario', value: `$${metrics.totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, iconBg: 'bg-green-600', iconColor: 'text-white' },
    { label: 'Presupuesto Total', value: `$${metrics.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet, iconBg: 'bg-primary', iconColor: 'text-white' },
    { label: 'Requisas (Mes)', value: metrics.totalRequisitionsMTD.toString(), icon: ClipboardList, iconBg: 'bg-purple-600', iconColor: 'text-white' },
    { label: 'Gasto del Mes', value: `$${metrics.monthlyCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Activity, iconBg: 'bg-sky-500', iconColor: 'text-white' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-light text-primary tracking-tight">Dashboard General</h1>
        <p className="text-gray-500 mt-2 text-sm">Métricas analíticas del mes actual e inventario en tiempo real.</p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <CardsSkeleton count={5} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="h-3 w-40 bg-gray-100 animate-pulse" />
              <div className="h-56 bg-gray-100 animate-pulse" />
            </div>
            <div className="bg-white border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="h-3 w-32 bg-gray-100 animate-pulse" />
              <div className="h-56 bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-10 bg-gray-100 animate-pulse" />
            <table className="w-full"><tbody><TableSkeleton rows={6} cols={5} /></tbody></table>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {stats.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className={`bg-white border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-300 group`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{stat.label}</p>
                      <p className="text-3xl font-light text-primary tracking-tight truncate">{stat.value}</p>
                    </div>
                    <div className={`p-3 ml-3 shrink-0 ${stat.iconBg} ${stat.iconColor} transition-all group-hover:scale-110`}>
                      <Icon size={20} strokeWidth={2} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month Navigator */}
          <div className="flex items-center justify-center gap-3 py-2">
            <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded hover:bg-gray-100 text-primary transition-colors">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <span className="text-sm font-semibold text-primary min-w-[140px] text-center capitalize">
              {selectedMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
              {isCurrentMonth && <span className="ml-2 text-[10px] font-bold text-sky-500 uppercase tracking-widest">actual</span>}
            </span>
            <button onClick={() => navigateMonth(1)} disabled={isCurrentMonth} className="p-1.5 rounded hover:bg-gray-100 text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={20} strokeWidth={2.5} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">

            {/* Presupuesto Disponible por Área */}
            <div className="bg-white border border-gray-100 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Presupuesto por Área (Mes Actual)</h2>
              </div>
              <div className="space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar flex-1">
                {budgetChartData.filter(a => a.presupuesto > 0).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center mt-10">No hay áreas con presupuesto asignado.</p>
                ) : (
                  budgetChartData
                    .filter(a => a.presupuesto > 0)
                    .sort((a, b) => (b.consumido / b.presupuesto) - (a.consumido / a.presupuesto))
                    .map((area) => {
                      const pct = Math.min((area.consumido / area.presupuesto) * 100, 100);
                      const disponible = area.presupuesto - area.consumido;
                      const isOver = area.consumido > area.presupuesto;
                      const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500';
                      return (
                        <div key={area.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-primary truncate max-w-[55%]">{area.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[10px] font-bold ${isOver ? 'text-red-600' : 'text-gray-500'}`}>
                                {isOver ? 'Excedido' : `$${disponible.toLocaleString(undefined, { maximumFractionDigits: 0 })} disp.`}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${pct >= 90 ? 'text-red-600 bg-red-50 border-red-200' : pct >= 70 ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-green-600 bg-green-50 border-green-200'}`}>
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 h-2">
                            <div className={`h-2 transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[9px] text-gray-400">${area.consumido.toLocaleString(undefined, { maximumFractionDigits: 0 })} consumido</span>
                            <span className="text-[9px] text-gray-400">${area.presupuesto.toLocaleString(undefined, { maximumFractionDigits: 0 })} total</span>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Alertas de Stock */}
            <div className="bg-white border border-gray-100 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between px-6 py-3 bg-red-700 border-b-2 border-red-400">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Alertas de Stock ({stockAlerts.length})</h2>
                <Link href="/productos" className="text-xs text-red-200 hover:text-white transition-colors flex items-center gap-1 font-bold">
                  Ir al Almacén <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-3 overflow-y-auto px-4 py-3 custom-scrollbar flex-1">
                {stockAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-sm text-green-600 font-semibold">¡Todo en orden!</p>
                    <p className="text-xs text-gray-400 mt-1">Ningún producto ha alcanzado su límite mínimo.</p>
                  </div>
                ) : (
                  stockAlerts.map((item) => {
                    const available = item.quantity - (item.committed_quantity || 0);
                    const isZero = available <= 0;
                    return (
                      <div key={item.id} className="flex items-center justify-between group p-2 hover:bg-red-50 -mx-2 transition-colors border-l-2 border-transparent hover:border-red-400">
                        <div>
                          <p className={`text-sm font-medium ${isZero ? 'text-red-600 font-bold' : 'text-orange-600'}`}>{item.name}</p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{item.code} • Min: {item.minimum_stock || 0}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            {isZero && <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>}
                            <span className={`text-[12px] font-bold ${isZero ? 'text-red-600' : 'text-orange-600'}`}>
                              {available} dispo.
                            </span>
                          </div>
                          <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400 border px-1 border-gray-200 bg-white">
                            {item.quantity} Físico / {item.committed_quantity || 0} Compr.
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ADVANCED CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">

            {/* Chart: Consumption by Area — ancho completo, contiene los botones de período */}
            <div className="bg-white border border-gray-100 shadow-sm col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Consumo por Áreas</h2>
                <div className="flex gap-1">
                  {(['1m', '3m', '6m', '12m'] as ProductPeriod[]).map((p) => {
                    const labels: Record<ProductPeriod, string> = { '1m': 'Mes actual', '3m': '3 meses', '6m': '6 meses', '12m': '12 meses' };
                    return (
                      <button
                        key={p}
                        onClick={() => setProductPeriod(p)}
                        className={`text-[10px] font-bold px-2.5 py-1 uppercase tracking-widest transition-colors ${productPeriod === p ? 'bg-white text-primary' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                      >
                        {labels[p]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-6">
                <div className="h-[350px] w-full">
                  {areaChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={areaChartData} margin={{ top: 30, right: 30, left: 20, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tick={{ fill: '#9ca3af' }} angle={-45} textAnchor="end" interval={0} />
                        <YAxis tickFormatter={(val) => `$${val}`} stroke="#9ca3af" fontSize={11} tick={{ fill: '#9ca3af' }} />
                        <Tooltip
                          formatter={(value) => [`$${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Consumo']}
                          contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb', fontSize: '11px', color: '#00262b' }}
                          cursor={{ fill: '#f9fafb' }}
                        />
                        <Bar dataKey="consumido" name="Consumo" fill="#0b363b" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="consumido" position="top" formatter={(val: unknown) => Number(val) > 0 ? `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ''} style={{ fontSize: 11, fill: '#0b363b', fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">No hay consumo registrado por áreas en el período seleccionado.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Chart: Consumption by Category */}
            <div className="bg-white border border-gray-100 shadow-sm">
              <div className="flex items-center px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Consumo por Categoría</h2>
              </div>
              <div className="p-6">
                <div className="h-[400px] w-full">
                  {categoryChartData.length > 0 ? (() => {
                    const CAT_COLORS = ['#0b363b', '#1e40af', '#2563eb', '#0891b2', '#0d9488', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#65a30d', '#ea580c'];
                    const total = categoryChartData.reduce((sum, d) => sum + d.value, 0);
                    const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
                      cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number;
                    }) => {
                      if ((percent ?? 0) < 0.05) return null;
                      const RADIAN = Math.PI / 180;
                      const ri = innerRadius ?? 0;
                      const ro = outerRadius ?? 0;
                      const angle = midAngle ?? 0;
                      const radius = ri + (ro - ri) * 0.5;
                      const x = (cx ?? 0) + radius * Math.cos(-angle * RADIAN);
                      const y = (cy ?? 0) + radius * Math.sin(-angle * RADIAN);
                      return (
                        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
                          {`${((percent ?? 0) * 100).toFixed(1)}%`}
                        </text>
                      );
                    };
                    return (
                      <div className="flex gap-4 h-full">
                        <div className="flex-1 min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={categoryChartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={130}
                                paddingAngle={2}
                                labelLine={false}
                                label={renderCustomLabel}
                              >
                                {categoryChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CAT_COLORS[index % CAT_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value) => [`$${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total Consumido']}
                                contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb', fontSize: '11px', color: '#00262b' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex flex-col justify-center gap-1.5 min-w-[200px] max-w-[220px] overflow-y-auto pr-1 custom-scrollbar">
                          {categoryChartData.map((entry, index) => {
                            const pct = total > 0 ? (entry.value / total) * 100 : 0;
                            return (
                              <div key={entry.name} className="flex items-center gap-2 text-xs">
                                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CAT_COLORS[index % CAT_COLORS.length] }} />
                                <span className="flex-1 truncate text-primary font-medium">{entry.name}</span>
                                <span className="text-gray-400 whitespace-nowrap">{pct.toFixed(1)}%</span>
                                <span className="text-primary font-semibold whitespace-nowrap">${entry.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">No hay datos de consumo para el mes actual.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Table: Top 15 Products — media columna */}
            <div className="bg-white border border-gray-100 shadow-sm">
              <div className="flex items-center px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Top 15 Productos por Consumo USD</h2>
              </div>
              <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50">
                      <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest w-10">#</th>
                      <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Código</th>
                      <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Producto</th>
                      <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-right">Consumo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productChartData.length > 0 ? (
                      productChartData.map((prod, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2 px-3 text-xs font-mono text-gray-400">{idx + 1}</td>
                          <td className="py-2 px-3 text-xs font-mono text-gray-400">{prod.code}</td>
                          <td className="py-2 px-3 text-xs font-medium text-primary">{prod.name}</td>
                          <td className="py-2 px-3 text-xs font-semibold text-primary text-right">${prod.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-xs text-gray-400">No hay datos históricos suficientes.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Chart: Consumption Timeline (12 Months) */}
            <div className="bg-white border border-gray-100 shadow-sm col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Consumo por Mes (Últimos 12 Meses)</h2>
              </div>
              <div className="p-6">
                <div className="h-[350px] w-full">
                  {timelineChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineChartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="mes" stroke="#9ca3af" fontSize={11} tick={{ fill: '#9ca3af' }} />
                        <YAxis tickFormatter={(val) => `$${val}`} stroke="#9ca3af" fontSize={11} tick={{ fill: '#9ca3af' }} />
                        <Tooltip
                          formatter={(value) => [`$${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total USD']}
                          contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb', fontSize: '11px', color: '#00262b' }}
                        />
                        <Line type="monotone" dataKey="consumo" name="Consumo Mensual Global" stroke="#0b363b" strokeWidth={2.5} dot={{ r: 4, fill: '#0b363b', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#437278' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">No hay datos históricos suficientes.</div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
