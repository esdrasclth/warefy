'use client';
import { useState, useEffect } from 'react';
import { Package, Wallet, ClipboardList, Activity, Loader2, ArrowRight, DollarSign } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalProducts: 0,
    totalInventoryValue: 0,
    totalBudget: 0,
    totalRequisitionsMTD: 0,
    monthlyCost: 0
  });

  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);

  // Charts State
  const [timelineChartData, setTimelineChartData] = useState<any[]>([]);
  const [productChartData, setProductChartData] = useState<any[]>([]);
  const [budgetChartData, setBudgetChartData] = useState<any[]>([]);
  const [categoryChartData, setCategoryChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearAgoStr = oneYearAgo.toISOString();

      try {
        // Querying all data in parallel
        const [
          { count: prodCount },
          { data: budgets },
          { count: reqCount },
          { data: reqsMonth },
          { data: recentReqs },
          { data: items },
          { data: histReqs },
          { data: areasWithBudgets }
        ] = await Promise.all([
          supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
          supabase.from('area_budgets').select('monthly_budget'),
          supabase.from('requisitions').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
          supabase.from('requisitions').select('total_cost, area_name').neq('status', 'CANCELADA').gte('created_at', startOfMonth),
          supabase.from('requisitions').select('id, created_at, status, area_name').order('created_at', { ascending: false }).limit(5),
          supabase.from('inventory_items').select('id, name, code, quantity, committed_quantity, min_stock, price').eq('status', 'ACTIVE'),
          supabase.from('requisitions').select(`
            id, 
            area_name, 
            created_at,
            total_cost,
            requisition_items ( inventory_item_id, quantity, unit_cost, inventory_items(name, code, categories(name)) )
          `).neq('status', 'CANCELADA').gte('created_at', oneYearAgoStr),
          supabase.from('areas').select('name, area_budgets ( monthly_budget )')
        ]);

        // Process Metrics
        const totalBudget = budgets?.reduce((acc, b) => acc + (Number(b.monthly_budget) || 0), 0) || 0;
        const monthlyCost = reqsMonth?.reduce((acc, r) => acc + (Number(r.total_cost) || 0), 0) || 0;
        
        // Process Valuation & Alerts
        const totalInventoryValue = items?.reduce((acc, item) => acc + ((item.quantity || 0) * (item.price || 0)), 0) || 0;
        const alerts = items?.filter(item => {
          const available = (item.quantity || 0) - (item.committed_quantity || 0);
          return available <= (item.min_stock || 0);
        }).sort((a, b) => ((a.quantity || 0) - (a.committed_quantity || 0)) - ((b.quantity || 0) - (b.committed_quantity || 0))).slice(0, 10) || [];

        setMetrics({
          totalProducts: prodCount || 0,
          totalInventoryValue,
          totalBudget,
          totalRequisitionsMTD: reqCount || 0,
          monthlyCost
        });
        setRecentActivity(recentReqs || []);
        setStockAlerts(alerts);

        if (histReqs) {
          const timelineMap: Record<string, number> = {};
          const prodMap: Record<string, { code: string, name: string, cost: number }> = {};
          const catMap: Record<string, number> = {};

          for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            timelineMap[d.toLocaleString('es-ES', { month: 'short', year: 'numeric' })] = 0;
          }

          histReqs.forEach((req: any) => {
            const d = new Date(req.created_at);
            const monthKey = d.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
            if (timelineMap[monthKey] !== undefined) timelineMap[monthKey] += (Number(req.total_cost) || 0);

            req.requisition_items?.forEach((item: any) => {
              const pid = item.inventory_item_id;
              const cost = (item.quantity || 0) * (item.unit_cost || 0);
              if (!prodMap[pid]) prodMap[pid] = { code: item.inventory_items?.code || 'N/A', name: item.inventory_items?.name || 'Item', cost: 0 };
              prodMap[pid].cost += cost;

              const catName = (item.inventory_items?.categories as any)?.name || 'Sin Categoría';
              catMap[catName] = (catMap[catName] || 0) + cost;
            });
          });

          setTimelineChartData(Object.entries(timelineMap).map(([mes, consumo]) => ({ mes: mes.charAt(0).toUpperCase() + mes.slice(1), consumo })));
          setProductChartData(Object.values(prodMap).sort((a, b) => b.cost - a.cost).slice(0, 15));
          setCategoryChartData(Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
        }

        const budgetMap: Record<string, { name: string, presupuesto: number, consumido: number }> = {};
        areasWithBudgets?.forEach(area => {
          const bdg = (area.area_budgets as any)?.monthly_budget || 0;
          if (bdg > 0) budgetMap[area.name] = { name: area.name, presupuesto: Number(bdg), consumido: 0 };
        });

        reqsMonth?.forEach((req: any) => {
          if (req.area_name) {
            if (!budgetMap[req.area_name]) budgetMap[req.area_name] = { name: req.area_name, presupuesto: 0, consumido: 0 };
            budgetMap[req.area_name].consumido += Number(req.total_cost || 0);
          }
        });

        setBudgetChartData(Object.values(budgetMap));
      } catch (err) {
        console.error('Data fetching error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours} hr`;
    if (diffDays === 1) return `ayer`;
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
    { label: 'Total Productos', value: metrics.totalProducts.toLocaleString(), icon: Package, iconBg: 'bg-blue-600', iconColor: 'text-white', accent: 'border-l-blue-600' },
    { label: 'Valor en Inventario', value: `$${metrics.totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, iconBg: 'bg-green-600', iconColor: 'text-white', accent: 'border-l-green-600' },
    { label: 'Presupuesto Total', value: `$${metrics.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet, iconBg: 'bg-primary', iconColor: 'text-white', accent: 'border-l-primary' },
    { label: 'Requisas (Mes)', value: metrics.totalRequisitionsMTD.toString(), icon: ClipboardList, iconBg: 'bg-purple-600', iconColor: 'text-white', accent: 'border-l-purple-600' },
    { label: 'Gasto del Mes', value: `$${metrics.monthlyCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Activity, iconBg: 'bg-sky-500', iconColor: 'text-white', accent: 'border-l-sky-500' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-light text-primary tracking-tight">Dashboard General</h1>
        <p className="text-gray-500 mt-2 text-sm">Métricas analíticas del mes actual e inventario en tiempo real.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-24">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {stats.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className={`bg-white border border-gray-100 border-l-4 ${stat.accent} p-5 shadow-sm hover:shadow-md transition-all duration-300 group`}>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">

            {/* Actividad Reciente */}
            <div className="bg-white border border-gray-100 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Requisas Recientes</h2>
                <Link href="/requisar" className="text-xs text-accent hover:text-white transition-colors flex items-center gap-1 font-bold">
                  Ver todo <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-4 overflow-y-auto px-4 py-3 custom-scrollbar flex-1">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center mt-10">No hay requisas creadas recientemente.</p>
                ) : (
                  recentActivity.map((req) => (
                    <Link href={`/requisar/${req.id}`} key={req.id} className="flex items-center justify-between group cursor-pointer block hover:bg-gray-50 p-2 -mx-2 rounded transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-8 w-1 bg-transparent group-hover:bg-white/30 transition-colors rounded"></div>
                        <div>
                          <p className="text-sm font-semibold text-primary group-hover:text-blue-600 transition-colors">
                            REQ-{req.id.split('-')[0]}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(req.created_at)} • {req.area_name}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold tracking-widest border px-2 py-1 uppercase ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Alertas de Stock */}
            <div className="bg-white border border-gray-100 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between px-6 py-3 bg-red-700 border-b-2 border-red-400">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Alertas de Stock ({stockAlerts.length})</h2>
                <Link href="/almacen" className="text-xs text-red-200 hover:text-white transition-colors flex items-center gap-1 font-bold">
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

            {/* Table 1: Top 15 Products (12 Months) */}
            <div className="bg-white border border-gray-100 shadow-sm col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Top 15 Productos por Consumo USD (Últimos 12 Meses)</h2>
              </div>
              <div className="w-full overflow-x-auto p-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-2 px-3 text-xs font-bold text-primary/70 uppercase tracking-widest w-12">#</th>
                      <th className="py-2 px-3 text-xs font-bold text-primary/70 uppercase tracking-widest">Código</th>
                      <th className="py-2 px-3 text-xs font-bold text-primary/70 uppercase tracking-widest">Producto</th>
                      <th className="py-2 px-3 text-xs font-bold text-primary/70 uppercase tracking-widest text-right">Consumo Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productChartData.length > 0 ? (
                      productChartData.map((prod, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 px-3 text-sm font-mono text-gray-400">{idx + 1}</td>
                          <td className="py-2.5 px-3 text-xs font-mono text-gray-500">{prod.code}</td>
                          <td className="py-2.5 px-3 text-sm font-semibold text-primary">{prod.name}</td>
                          <td className="py-2.5 px-3 text-sm font-bold text-green-700 text-right">${prod.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No hay datos históricos suficientes.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Chart 2: Consumption by Category (PieChart) */}
            <div className="bg-white border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Consumo por Categoría (12 Meses)</h2>
              </div>
              <div className="p-6">
                <div className="h-[350px] w-full">
                  {categoryChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <Pie
                          data={categoryChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={120}
                          paddingAngle={2}
                        >
                          {categoryChartData.map((entry, index) => {
                            const COLORS = ['#001d3d', '#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e293b'];
                            return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                          })}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total Consumido']}
                          contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb' }}
                        />
                        <Legend
                          layout="vertical"
                          verticalAlign="middle"
                          align="right"
                          wrapperStyle={{ fontSize: '12px', paddingLeft: '20px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">No hay datos históricos por categoría.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Chart 3: Budget vs Actuals (Current Month) */}
            <div className="bg-white border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Presupuesto vs Consumo (Mes Actual)</h2>
              </div>
              <div className="p-6">
                <div className="h-[350px] w-full">
                  {budgetChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={budgetChartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tick={{ fill: '#4b5563' }} />
                        <YAxis tickFormatter={(val) => `$${val}`} stroke="#9ca3af" fontSize={12} />
                        <Tooltip
                          formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']}
                          contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb' }}
                          cursor={{ fill: '#f9fafb' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Bar dataKey="presupuesto" name="Presupuesto Asignado" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                         <Bar dataKey="consumido" name="Consumo MTD" fill="#003566" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">No hay áreas con presupuesto o consumo activo.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Chart 4: Consumption Timeline (12 Months) */}
            <div className="bg-white border border-gray-100 shadow-sm col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between px-6 py-3 bg-primary border-b-2 border-white/20">
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Consumo por Mes (Últimos 12 Meses)</h2>
              </div>
              <div className="p-6">
                <div className="h-[350px] w-full">
                  {timelineChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={timelineChartData}
                        margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="mes" stroke="#9ca3af" fontSize={11} tick={{ fill: '#4b5563' }} />
                        <YAxis tickFormatter={(val) => `$${val}`} stroke="#9ca3af" fontSize={12} />
                        <Tooltip
                          formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total USD']}
                          contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb' }}
                        />
                        <Line type="monotone" dataKey="consumo" name="Consumo Mensual Global" stroke="#001d3d" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">No hay datos históricos suficientes.</div>
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
