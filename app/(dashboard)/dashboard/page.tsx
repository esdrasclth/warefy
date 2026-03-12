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

      // 1. Total Products
      const { count: prodCount } = await supabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');

      // 2. Total Budget Assigned
      const { data: budgets } = await supabase.from('area_budgets').select('monthly_budget');
      const totalBudget = budgets?.reduce((acc, b) => acc + (Number(b.monthly_budget) || 0), 0) || 0;

      // 3. Requisitions MTD
      const { count: reqCount } = await supabase
        .from('requisitions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth);

      // 4. Monthly Cost Consumed
      const { data: reqsMonth } = await supabase
        .from('requisitions')
        .select('total_cost')
        .neq('status', 'CANCELADA')
        .gte('created_at', startOfMonth);
      const monthlyCost = reqsMonth?.reduce((acc, r) => acc + (Number(r.total_cost) || 0), 0) || 0;

      // 5. Recent Activity (Top 5 requisitions)
      const { data: recentReqs } = await supabase
        .from('requisitions')
        .select('id, created_at, status, area_name')
        .order('created_at', { ascending: false })
        .limit(5);

      // 6. Stock Alerts & Inventory Valuation
      const { data: items, error: itemsError } = await supabase
        .from('inventory_items')
        .select('id, name, code, quantity, committed_quantity, min_stock, price')
        .eq('status', 'ACTIVE');
        
      if (itemsError) console.error('Items query error:', itemsError);

      const totalInventoryValue = items?.reduce((acc, item) => {
        return acc + ((item.quantity || 0) * (item.price || 0));
      }, 0) || 0;

      const alerts = items?.filter(item => {
        const available = (item.quantity || 0) - (item.committed_quantity || 0);
        const threshold = item.min_stock || 0;
        return available <= threshold;
      }).sort((a, b) => {
        const availableA = (a.quantity || 0) - (a.committed_quantity || 0);
        const availableB = (b.quantity || 0) - (b.committed_quantity || 0);
        return availableA - availableB;
      }).slice(0, 10) || []; // Show top 10 most critical

      setMetrics({
        totalProducts: prodCount || 0,
        totalInventoryValue,
        totalBudget,
        totalRequisitionsMTD: reqCount || 0,
        monthlyCost
      });
      setRecentActivity(recentReqs || []);
      setStockAlerts(alerts);
      
      // --- ADVANCED CHARTS DATA GATHERING --- //
      
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearAgoStr = oneYearAgo.toISOString();

      // Chart 1 & 2 Base Query: All Requisitions from last 12 months (Not cancelled)
      const { data: histReqs } = await supabase
        .from('requisitions')
        .select(`
          id, 
          area_name, 
          created_at,
          total_cost,
          requisition_items ( inventory_item_id, quantity, unit_cost, inventory_items(name, code, categories(name)) )
        `)
        .neq('status', 'CANCELADA')
        .gte('created_at', oneYearAgoStr);

      if (histReqs) {
        // Build Timeline Data (12 Months)
        const timelineMap: Record<string, number> = {};
        
        // Build Product Data (12 Months)
        const prodMap: Record<string, { code: string, name: string, cost: number }> = {};
        
        // Build Category Data (12 Months)
        const catMap: Record<string, number> = {};

        // Prepare the last 12 months as initial zeroed keys to ensure a continuous line graph
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const monthKey = d.toLocaleString('es-ES', { month: 'short', year: 'numeric' }); // e.g., "mar 2025"
          timelineMap[monthKey] = 0;
        }

        histReqs.forEach(req => {
          // Timeline Map
          const d = new Date(req.created_at);
          const monthKey = d.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
          if (timelineMap[monthKey] !== undefined) {
             timelineMap[monthKey] += (Number(req.total_cost) || 0);
          }

          // Product Map & Category Map
          req.requisition_items?.forEach((item: any) => {
            const pid = item.inventory_item_id;
            const pname = item.inventory_items?.name || 'Item Desconocido';
            const pcode = item.inventory_items?.code || 'N/A';
            const cost = (item.quantity || 0) * (item.unit_cost || 0);
            
            // Collect Product Stats
            if (!prodMap[pid]) prodMap[pid] = { code: pcode, name: pname, cost: 0 };
            prodMap[pid].cost += cost;
            
            // Collect Category Stats
            const categoryData = item.inventory_items?.categories as any; // Handles object un-nesting
            const categoryName = categoryData?.name || 'Sin Categoría';
            if (!catMap[categoryName]) catMap[categoryName] = 0;
            catMap[categoryName] += cost;
          });
        });

        // Format Timeline Data for LineChart
        const timelineDataRaw = Object.entries(timelineMap).map(([mes, consumo]) => ({
          mes: mes.charAt(0).toUpperCase() + mes.slice(1), 
          consumo
        }));
        setTimelineChartData(timelineDataRaw);

        // Format Product Data for Table (Top 15)
        const prodDataRaw = Object.values(prodMap)
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 15);
        setProductChartData(prodDataRaw);

        // Format Category Data for PieChart
        const catDataRaw = Object.entries(catMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
        setCategoryChartData(catDataRaw);
      }

      // Chart 3: Budget vs Consumed (MTD) per Area
      const budgetMap: Record<string, { name: string, presupuesto: number, consumido: number }> = {};
      
      // Init map with all assigned budgets
      const { data: areasWithBudgets } = await supabase
        .from('areas')
        .select(`
          name, 
          area_budgets ( monthly_budget )
        `);
      areasWithBudgets?.forEach(area => {
        // In the one-to-one join, Supabase returns area_budgets as a direct object or null
        const areaBdg = area.area_budgets as any;
        const bdg = areaBdg ? areaBdg.monthly_budget : 0;
        
        // We only map areas that actually have a budget OR we wait for consumption to inject them
        if (bdg > 0) {
           budgetMap[area.name] = { name: area.name, presupuesto: Number(bdg), consumido: 0 };
        }
      });

      // Add MTD consumption
      const { data: reqsMonthWithArea } = await supabase
        .from('requisitions')
        .select('total_cost, area_name')
        .neq('status', 'CANCELADA')
        .gte('created_at', startOfMonth);
        
      reqsMonthWithArea?.forEach(req => {
        const area = req.area_name;
        if (area) {
          if (!budgetMap[area]) {
            // Area has consumption but no budget set? Track it anyway for the chart
            budgetMap[area] = { name: area, presupuesto: 0, consumido: 0 };
          }
          budgetMap[area].consumido += Number(req.total_cost || 0);
        }
      });

      setBudgetChartData(Object.values(budgetMap));

      setIsLoading(false);
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
    switch(status) {
      case 'ENTREGADA': return 'text-green-600 border-green-200';
      case 'CANCELADA': return 'text-red-500 border-red-200';
      case 'PENDIENTE': return 'text-yellow-600 border-yellow-200';
      case 'PENDIENTE DE APROBACION': return 'text-orange-600 border-orange-200';
      default: return 'text-gray-500 border-gray-200';
    }
  };

  const stats = [
    { label: 'Total Productos', value: metrics.totalProducts.toLocaleString(), icon: Package, color: 'text-primary' },
    { label: 'Valor en Inventario', value: `$${metrics.totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-primary' },
    { label: 'Presupuesto Total', value: `$${metrics.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet, color: 'text-primary' },
    { label: 'Requisas (Mes)', value: metrics.totalRequisitionsMTD.toString(), icon: ClipboardList, color: 'text-primary' },
    { label: 'Gasto del Mes', value: `$${metrics.monthlyCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Activity, color: 'text-primary' },
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {stats.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="bg-white border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                      <p className="text-4xl font-light text-primary tracking-tight truncate max-w-[150px]">{stat.value}</p>
                    </div>
                    <div className={`p-4 bg-gray-50/50 transition-colors group-hover:bg-primary/5 ${stat.color}`}>
                      <Icon size={24} strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            
            {/* Actividad Reciente */}
            <div className="bg-white border border-gray-100 p-8 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Requisas Recientes</h2>
                <Link href="/requisar" className="text-xs text-gray-500 hover:text-primary transition-colors flex items-center gap-1">
                  Ver todo <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-5 overflow-y-auto pr-2 custom-scrollbar flex-1">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center mt-10">No hay requisas creadas recientemente.</p>
                ) : (
                  recentActivity.map((req) => (
                    <Link href={`/requisar/${req.id}`} key={req.id} className="flex items-center justify-between group cursor-pointer block hover:bg-gray-50 p-2 -mx-2 rounded transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-8 w-1 bg-accent/0 group-hover:bg-accent transition-colors rounded"></div>
                        <div>
                          <p className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">
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
            <div className="bg-white border border-gray-100 p-8 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Alertas de Stock ({stockAlerts.length})</h2>
                <Link href="/almacen" className="text-xs text-gray-500 hover:text-primary transition-colors flex items-center gap-1">
                  Ir al Almacén <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
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
            <div className="bg-white border border-gray-100 p-8 shadow-sm col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Top 15 Productos por Consumo USD (Últimos 12 Meses)</h2>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-widest w-16">#</th>
                      <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Código</th>
                      <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Producto</th>
                      <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Consumo Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {productChartData.length > 0 ? (
                      productChartData.map((prod, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 text-sm font-mono text-gray-400">{idx + 1}</td>
                          <td className="py-3 text-xs font-mono text-gray-500">{prod.code}</td>
                          <td className="py-3 text-sm font-semibold text-primary">{prod.name}</td>
                          <td className="py-3 text-sm font-bold text-primary text-right">${prod.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
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
            <div className="bg-white border border-gray-100 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Consumo Total por Categoría (12 Meses)</h2>
              </div>
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
                          const COLORS = ['#001d3d', '#ffc300', '#003566', '#ffd60a', '#00509d', '#ffea00', '#1e293b'];
                          return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                        })}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2})}`, 'Total Consumido']}
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

            {/* Chart 3: Budget vs Actuals (Current Month) */}
            <div className="bg-white border border-gray-100 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Presupuesto vs Consumo (Mes Actual)</h2>
              </div>
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
                        formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2})}`, '']}
                        contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb' }}
                        cursor={{fill: '#f9fafb'}}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="presupuesto" name="Presupuesto Asignado" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="consumido" name="Consumo MTD" fill="#ffc300" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="flex items-center justify-center h-full text-gray-400 text-sm">No hay áreas con presupuesto o consumo activo.</div>
                )}
              </div>
            </div>

            {/* Chart 4: Consumption Timeline (12 Months) */}
            <div className="bg-white border border-gray-100 p-8 shadow-sm col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-sm font-bold text-primary uppercase tracking-widest">Consumo por Mes (Últimos 12 Meses)</h2>
              </div>
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
                        formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2})}`, 'Total USD']}
                        contentStyle={{ borderRadius: '0px', border: '1px solid #e5e7eb' }}
                      />
                      <Line type="monotone" dataKey="consumo" name="Consumo Mensual Global" stroke="#001d3d" strokeWidth={3} dot={{ r: 4, fill: '#ffc300', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="flex items-center justify-center h-full text-gray-400 text-sm">No hay datos históricos suficientes.</div>
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
