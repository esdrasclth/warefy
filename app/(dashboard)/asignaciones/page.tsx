'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, X, Save, Loader2, Wrench, Users, AlertTriangle, Undo2, ArrowRightLeft, ChevronDown, ShieldAlert, History, CheckCircle2, Printer, FileText, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardsSkeleton } from '@/components/ui/TableSkeleton';
import { logAudit } from '@/lib/audit';
import type { ToolAssignment, ToolAssignmentType, ToolAssignmentStatus } from '@/types';

interface AssignableItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
}

interface EmployeeOption {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  position?: string | null;
  areas?: { name: string } | null;
}

const TYPE_LABELS: Record<ToolAssignmentType, string> = {
  NUEVA: 'Nueva Asignación',
  REEMPLAZO_DANO: 'Reemplazo por Daño',
  REEMPLAZO_EXTRAVIO: 'Reemplazo por Extravío',
  CAMBIO_ASIGNACION: 'Cambio de Asignación',
};

const STATUS_LABELS: Record<ToolAssignmentStatus, string> = {
  ACTIVA: 'Activa',
  DEVUELTA: 'Devuelta',
  TRANSFERIDA: 'Transferida',
  DANADA: 'Dañada',
  EXTRAVIADA: 'Extraviada',
};

const STATUS_STYLES: Record<ToolAssignmentStatus, string> = {
  ACTIVA: 'text-green-700 border-green-200 bg-green-50',
  DEVUELTA: 'text-blue-600 border-blue-200 bg-blue-50',
  TRANSFERIDA: 'text-purple-600 border-purple-200 bg-purple-50',
  DANADA: 'text-orange-600 border-orange-200 bg-orange-50',
  EXTRAVIADA: 'text-red-600 border-red-200 bg-red-50',
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  inventory_item_id: '',
  employee_id: '',
  assigned_date: today(),
  serial_number: '',
  item_state: 'NUEVO' as 'NUEVO' | 'USADO',
  condition_notes: '',
  assignment_type: 'NUEVA' as ToolAssignmentType,
  previous_assignment_id: '',
  notes: '',
};

export default function AsignacionesPage() {
  const toast = useToast();
  const [assignments, setAssignments] = useState<ToolAssignment[]>([]);
  const [items, setItems] = useState<AssignableItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | ToolAssignmentStatus>('ACTIVA');

  // Modal reporte de inventario
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportArea, setReportArea] = useState('todas');

  // Exportación a Excel
  const [isExporting, setIsExporting] = useState(false);

  // Panel nueva asignación
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemSearch, setItemSearch] = useState('');
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);

  // Modal devolución / reporte (daño-extravío sin reemplazo)
  const [returnTarget, setReturnTarget] = useState<ToolAssignment | null>(null);
  const [returnStatus, setReturnStatus] = useState<'DEVUELTA' | 'DANADA' | 'EXTRAVIADA'>('DEVUELTA');
  const [returnDate, setReturnDate] = useState(today());
  const [returnNotes, setReturnNotes] = useState('');

  // Modal transferencia
  const [transferTarget, setTransferTarget] = useState<ToolAssignment | null>(null);
  const [transferEmpId, setTransferEmpId] = useState('');
  const [transferEmpSearch, setTransferEmpSearch] = useState('');
  const [transferEmpDropdownOpen, setTransferEmpDropdownOpen] = useState(false);
  const [transferDate, setTransferDate] = useState(today());
  const [transferState, setTransferState] = useState<'NUEVO' | 'USADO'>('USADO');
  const [transferNotes, setTransferNotes] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assignRes, itemsRes, empsRes] = await Promise.all([
        supabase
          .from('tool_assignments')
          .select(`
            *,
            inventory_items ( id, code, name, quantity, units!unit_id ( name ) ),
            employees ( id, code, first_name, last_name, position, areas ( name ) )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('inventory_items')
          .select('id, code, name, quantity')
          .eq('is_assignable', true)
          .eq('status', 'ACTIVE')
          .order('name'),
        supabase
          .from('employees')
          .select('id, code, first_name, last_name, position, areas ( name )')
          .order('first_name'),
      ]);

      if (assignRes.error) throw assignRes.error;
      setAssignments((assignRes.data || []) as unknown as ToolAssignment[]);
      setItems((itemsRes.data || []) as AssignableItem[]);
      setEmployees((empsRes.data || []) as unknown as EmployeeOption[]);
    } catch (err) {
      console.error(err);
      toast.error('Error cargando asignaciones.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const empFullName = (e?: EmployeeOption | ToolAssignment['employees'] | null) =>
    e ? `${e.first_name} ${e.last_name}`.trim() : '—';

  const activeAssignments = useMemo(() => assignments.filter(a => a.status === 'ACTIVA'), [assignments]);

  // Áreas con al menos una asignación activa (para el reporte de inventario)
  const reportAreas = useMemo(() => {
    const set = new Set<string>();
    activeAssignments.forEach(a => set.add(a.employees?.areas?.name || 'Sin Área'));
    return [...set].sort((x, y) => x.localeCompare(y, 'es'));
  }, [activeAssignments]);

  const openReport = () => {
    const areaQuery = reportArea === 'todas' ? 'todas' : encodeURIComponent(reportArea);
    window.open(`/asignaciones/reporte?area=${areaQuery}&print=true`, '_blank');
    setIsReportOpen(false);
  };

  const areaOf = (a: ToolAssignment) => a.area_name || a.employees?.areas?.name || 'Sin Área';
  const isoDate = (d?: string | null) => (d ? d.slice(0, 10) : '');
  const monthKey = (d?: string | null) => (d ? d.slice(0, 7) : '');

  const handleExportExcel = async () => {
    if (assignments.length === 0) { toast.warning('No hay asignaciones para exportar.'); return; }
    setIsExporting(true);
    try {
      // Hoja 1: detalle completo (todas las asignaciones, todos los estatus)
      const detailRows = assignments.map(a => {
        const cost = Number(a.unit_cost) || 0;
        return {
          'N° Acta': `AS-${String(a.consecutive ?? 0).padStart(4, '0')}`,
          'Estatus': STATUS_LABELS[a.status],
          'Tipo': TYPE_LABELS[a.assignment_type],
          'Código Producto': a.inventory_items?.code || '—',
          'Descripción': a.inventory_items?.name || '—',
          'N° Serie': a.serial_number || 'N/A',
          'Estado Artículo': a.item_state,
          'Área': areaOf(a),
          'Código Empleado': a.employees?.code || '—',
          'Empleado': empFullName(a.employees),
          'Cargo': a.employees?.position || '—',
          'Fecha Asignación': fmtDate(a.assigned_date),
          'Fecha Cierre': a.return_date ? fmtDate(a.return_date) : '—',
          'Costo Unitario (USD)': cost,
          'Condición': a.condition_notes || '—',
          'Observaciones': a.notes || '—',
        };
      });

      // Hojas de resumen: solo asignaciones activas (valor actualmente entregado)
      const active = assignments.filter(a => a.status === 'ACTIVA');

      const byAreaMap = new Map<string, { count: number; monto: number }>();
      active.forEach(a => {
        const key = areaOf(a);
        const acc = byAreaMap.get(key) || { count: 0, monto: 0 };
        acc.count += 1;
        acc.monto += Number(a.unit_cost) || 0;
        byAreaMap.set(key, acc);
      });
      const areaRows = [...byAreaMap.entries()]
        .sort((x, y) => x[0].localeCompare(y[0], 'es'))
        .map(([area, v]) => ({ 'Área': area, 'Herramientas Activas': v.count, 'Monto Asignado (USD)': v.monto }));
      areaRows.push({ 'Área': 'TOTAL', 'Herramientas Activas': active.length, 'Monto Asignado (USD)': areaRows.reduce((s, r) => s + r['Monto Asignado (USD)'], 0) });

      const byEmpMap = new Map<string, { area: string; code: string; name: string; count: number; monto: number }>();
      active.forEach(a => {
        const acc = byEmpMap.get(a.employee_id) || { area: areaOf(a), code: a.employees?.code || '—', name: empFullName(a.employees), count: 0, monto: 0 };
        acc.count += 1;
        acc.monto += Number(a.unit_cost) || 0;
        byEmpMap.set(a.employee_id, acc);
      });
      const empRows = [...byEmpMap.values()]
        .sort((x, y) => x.area.localeCompare(y.area, 'es') || x.name.localeCompare(y.name, 'es'))
        .map(v => ({ 'Área': v.area, 'Código Empleado': v.code, 'Empleado': v.name, 'Herramientas Activas': v.count, 'Monto Asignado (USD)': v.monto }));

      // Hoja de incidentes: dañadas y extraviadas, con fecha filtrable por mes/área/empleado
      const incidentRows = assignments
        .filter(a => a.status === 'DANADA' || a.status === 'EXTRAVIADA')
        .sort((x, y) => isoDate(y.return_date).localeCompare(isoDate(x.return_date)))
        .map(a => ({
          'N° Acta': `AS-${String(a.consecutive ?? 0).padStart(4, '0')}`,
          'Estatus': STATUS_LABELS[a.status],
          'Fecha Incidente': isoDate(a.return_date),
          'Mes': monthKey(a.return_date),
          'Área': areaOf(a),
          'Código Empleado': a.employees?.code || '—',
          'Empleado': empFullName(a.employees),
          'Cargo': a.employees?.position || '—',
          'Código Producto': a.inventory_items?.code || '—',
          'Descripción': a.inventory_items?.name || '—',
          'N° Serie': a.serial_number || 'N/A',
          'Costo (USD)': Number(a.unit_cost) || 0,
          'Fecha Asignación': isoDate(a.assigned_date),
          'Detalle Incidente': a.return_notes || a.notes || '—',
        }));

      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      wsDetail['!cols'] = [
        { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 38 }, { wch: 16 }, { wch: 14 },
        { wch: 22 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 36 }, { wch: 36 },
      ];
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle');

      const wsArea = XLSX.utils.json_to_sheet(areaRows);
      wsArea['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsArea, 'Resumen por Área');

      const wsEmp = XLSX.utils.json_to_sheet(empRows);
      wsEmp['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsEmp, 'Resumen por Empleado');

      const wsIncidents = XLSX.utils.json_to_sheet(
        incidentRows.length ? incidentRows : [{ 'N° Acta': 'Sin registros de daño o extravío' }]
      );
      wsIncidents['!cols'] = [
        { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 28 },
        { wch: 20 }, { wch: 16 }, { wch: 38 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, wsIncidents, 'Dañadas y Extraviadas');

      XLSX.writeFile(wb, `asignaciones_completo_${today()}.xlsx`);
      toast.success('Reporte exportado correctamente.');
    } catch (e) {
      toast.error('Error al exportar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsExporting(false);
    }
  };

  // Asignaciones activas del producto seleccionado (para reemplazos)
  const replaceableCandidates = useMemo(() => {
    if (!form.inventory_item_id) return activeAssignments;
    return activeAssignments.filter(a => a.inventory_item_id === form.inventory_item_id);
  }, [activeAssignments, form.inventory_item_id]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignments.filter(a => {
      if (statusFilter !== 'TODAS' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (a.inventory_items?.name || '').toLowerCase().includes(q) ||
        (a.inventory_items?.code || '').toLowerCase().includes(q) ||
        (a.serial_number || '').toLowerCase().includes(q) ||
        empFullName(a.employees).toLowerCase().includes(q) ||
        (a.employees?.code || '').toLowerCase().includes(q)
      );
    });
  }, [assignments, search, statusFilter]);

  const stats = useMemo(() => {
    const active = activeAssignments.length;
    const holders = new Set(activeAssignments.map(a => a.employee_id)).size;
    const damaged = assignments.filter(a => a.status === 'DANADA').length;
    const lost = assignments.filter(a => a.status === 'EXTRAVIADA').length;
    return [
      { label: 'Asignaciones Activas', value: active, icon: Wrench, bg: 'bg-primary' },
      { label: 'Empleados Responsables', value: holders, icon: Users, bg: 'bg-blue-600' },
      { label: 'Dañadas', value: damaged, icon: AlertTriangle, bg: 'bg-orange-500' },
      { label: 'Extraviadas', value: lost, icon: ShieldAlert, bg: 'bg-red-600' },
    ];
  }, [assignments, activeAssignments]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, assigned_date: today() });
    setItemSearch('');
    setEmpSearch('');
    setIsPanelOpen(true);
  };

  const handleSave = async () => {
    if (!form.inventory_item_id || !form.employee_id) {
      toast.warning('Selecciona el artículo y el empleado responsable.');
      return;
    }
    const isReplacement = form.assignment_type === 'REEMPLAZO_DANO' || form.assignment_type === 'REEMPLAZO_EXTRAVIO';
    if (isReplacement && !form.previous_assignment_id) {
      toast.warning('Selecciona la asignación anterior que se está reemplazando.');
      return;
    }
    const item = items.find(i => i.id === form.inventory_item_id);
    if (item && item.quantity <= 0) {
      toast.warning(`"${item.name}" no tiene stock disponible en almacén.`);
      return;
    }

    setIsSaving(true);
    try {
      const { data: created, error } = await supabase
        .from('tool_assignments')
        .insert({
          inventory_item_id: form.inventory_item_id,
          employee_id: form.employee_id,
          assigned_date: form.assigned_date,
          serial_number: form.serial_number.trim() || null,
          item_state: form.item_state,
          condition_notes: form.condition_notes.trim() || null,
          assignment_type: form.assignment_type,
          previous_assignment_id: isReplacement ? form.previous_assignment_id : null,
          notes: form.notes.trim() || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Cerrar la asignación anterior según el tipo de reemplazo
      if (isReplacement && form.previous_assignment_id) {
        const closedStatus = form.assignment_type === 'REEMPLAZO_DANO' ? 'DANADA' : 'EXTRAVIADA';
        const { error: closeErr } = await supabase
          .from('tool_assignments')
          .update({ status: closedStatus, return_date: form.assigned_date, return_notes: `Cerrada por ${TYPE_LABELS[form.assignment_type].toLowerCase()}.` })
          .eq('id', form.previous_assignment_id)
          .eq('status', 'ACTIVA');
        if (closeErr) toast.warning('Asignación creada, pero no se pudo cerrar la anterior: ' + closeErr.message);
      }

      const emp = employees.find(e => e.id === form.employee_id);
      logAudit({
        tableName: 'tool_assignments',
        recordId: created?.id || '',
        action: 'CREATE',
        description: `Herramienta "${item?.name}" (${item?.code}) asignada a ${empFullName(emp)} — ${TYPE_LABELS[form.assignment_type]}.`,
        newValues: { ...form },
      });

      toast.success('Asignación registrada. Generando acta de entrega...');
      setIsPanelOpen(false);
      fetchData();
      if (created?.id) window.open(`/asignaciones/${created.id}?print=true`, '_blank');
    } catch (err) {
      toast.error('Error guardando la asignación: ' + (err instanceof Error ? err.message : String(err)));
    }
    setIsSaving(false);
  };

  const handleReturnSave = async () => {
    if (!returnTarget) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('tool_assignments')
      .update({ status: returnStatus, return_date: returnDate, return_notes: returnNotes.trim() || null })
      .eq('id', returnTarget.id)
      .eq('status', 'ACTIVA');
    setIsSaving(false);

    if (error) {
      toast.error('Error actualizando la asignación: ' + error.message);
      return;
    }

    logAudit({
      tableName: 'tool_assignments',
      recordId: returnTarget.id,
      action: 'STATUS_CHANGE',
      description: `Asignación de "${returnTarget.inventory_items?.name}" a ${empFullName(returnTarget.employees)} marcada como ${STATUS_LABELS[returnStatus]}.`,
      oldValues: { status: 'ACTIVA' },
      newValues: { status: returnStatus, return_date: returnDate, return_notes: returnNotes },
    });

    toast.success(
      returnStatus === 'DEVUELTA'
        ? 'Herramienta devuelta. El stock fue reingresado al almacén.'
        : `Asignación marcada como ${STATUS_LABELS[returnStatus].toLowerCase()}.`
    );
    setReturnTarget(null);
    fetchData();
  };

  const handleTransferSave = async () => {
    if (!transferTarget || !transferEmpId) {
      toast.warning('Selecciona el empleado que recibirá la herramienta.');
      return;
    }
    if (transferEmpId === transferTarget.employee_id) {
      toast.warning('El empleado destino debe ser distinto al actual.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: created, error } = await supabase
        .from('tool_assignments')
        .insert({
          inventory_item_id: transferTarget.inventory_item_id,
          employee_id: transferEmpId,
          assigned_date: transferDate,
          serial_number: transferTarget.serial_number,
          item_state: transferState,
          condition_notes: transferNotes.trim() || null,
          assignment_type: 'CAMBIO_ASIGNACION',
          previous_assignment_id: transferTarget.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      const { error: closeErr } = await supabase
        .from('tool_assignments')
        .update({ status: 'TRANSFERIDA', return_date: transferDate, return_notes: 'Transferida a otro empleado.' })
        .eq('id', transferTarget.id)
        .eq('status', 'ACTIVA');
      if (closeErr) throw closeErr;

      const emp = employees.find(e => e.id === transferEmpId);
      logAudit({
        tableName: 'tool_assignments',
        recordId: created?.id || '',
        action: 'STATUS_CHANGE',
        description: `Herramienta "${transferTarget.inventory_items?.name}" transferida de ${empFullName(transferTarget.employees)} a ${empFullName(emp)}.`,
      });

      toast.success('Cambio de asignación registrado. Generando acta de entrega...');
      setTransferTarget(null);
      fetchData();
      if (created?.id) window.open(`/asignaciones/${created.id}?print=true`, '_blank');
    } catch (err) {
      toast.error('Error en la transferencia: ' + (err instanceof Error ? err.message : String(err)));
    }
    setIsSaving(false);
  };

  const fmtDate = (d?: string | null) =>
    d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isReplacementType = form.assignment_type === 'REEMPLAZO_DANO' || form.assignment_type === 'REEMPLAZO_EXTRAVIO';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Asignación de Herramientas</h1>
          <p className="text-gray-500 mt-1 text-sm">Control de herramientas y equipos entregados bajo responsabilidad de empleados.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 bg-white text-green-700 border border-green-600 px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-green-50 transition-colors shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Exportar Excel
          </button>
          <button
            onClick={() => { setReportArea('todas'); setIsReportOpen(true); }}
            className="flex items-center gap-2 bg-white text-primary border border-primary px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary/5 transition-colors shadow-sm"
          >
            <FileText size={16} /> Reporte de Inventario
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-background px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm"
          >
            <Plus size={16} /> Nueva Asignación
          </button>
        </div>
      </div>

      {/* Stats */}
      {isLoading ? <CardsSkeleton count={4} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Filtros + Tabla */}
      <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por producto, código, serie o empleado..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {(['ACTIVA', 'DEVUELTA', 'TRANSFERIDA', 'DANADA', 'EXTRAVIADA', 'TODAS'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors whitespace-nowrap ${
                  statusFilter === st ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                }`}
              >
                {st === 'TODAS' ? 'Todas' : STATUS_LABELS[st]}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap sm:ml-auto">{filtered.length} resultado(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">#</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Producto</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">N° Serie</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Responsable</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">F. Asignación</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center">Condición</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Tipo</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center">Estatus</th>
                <th className="py-2 px-4 text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center sticky right-0 bg-gray-50 border-l border-gray-100">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <TableSkeleton rows={8} cols={9} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-gray-400">
                    <Wrench size={32} className="mx-auto mb-2 text-gray-200" />
                    {search || statusFilter !== 'TODAS'
                      ? 'No se encontraron asignaciones con ese criterio.'
                      : 'No hay asignaciones registradas. Crea la primera.'}
                  </td>
                </tr>
              ) : (
                filtered.map(a => (
                  <tr key={a.id} className="hover:bg-blue-50/20 transition-colors group border-b border-gray-50">
                    <td className="py-3 px-4 text-xs font-mono text-gray-400">AS-{String(a.consecutive ?? 0).padStart(4, '0')}</td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-semibold text-primary">{a.inventory_items?.name || '—'}</p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">{a.inventory_items?.code}</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-gray-500">{a.serial_number || <span className="text-gray-300">N/A</span>}</td>
                    <td className="py-3 px-4">
                      <p className="text-xs font-semibold text-gray-700">{empFullName(a.employees)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {a.employees?.code}{a.employees?.areas?.name ? ` · ${a.employees.areas.name}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-gray-600">{fmtDate(a.assigned_date)}</p>
                      {a.return_date && <p className="text-[10px] text-gray-400 mt-0.5">Cierre: {fmtDate(a.return_date)}</p>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wider ${a.item_state === 'NUEVO' ? 'text-green-600 border-green-200 bg-green-50' : 'text-amber-600 border-amber-200 bg-amber-50'}`}>
                        {a.item_state}
                      </span>
                      {a.condition_notes && <p className="text-[10px] text-gray-400 mt-1 max-w-[140px] truncate mx-auto" title={a.condition_notes}>{a.condition_notes}</p>}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{TYPE_LABELS[a.assignment_type]}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wider ${STATUS_STYLES[a.status]}`}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4 sticky right-0 bg-white group-hover:bg-blue-50/20 border-l border-gray-100 transition-colors">
                      {a.status === 'ACTIVA' ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/asignaciones/${a.id}?print=true`}
                            target="_blank"
                            className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="Imprimir acta de entrega"
                          >
                            <Printer size={15} />
                          </Link>
                          <button
                            onClick={() => { setReturnTarget(a); setReturnStatus('DEVUELTA'); setReturnDate(today()); setReturnNotes(''); }}
                            className="p-1.5 text-gray-400 hover:text-green-600 transition-colors" title="Devolver al almacén"
                          >
                            <Undo2 size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setTransferTarget(a); setTransferEmpId(''); setTransferEmpSearch('');
                              setTransferDate(today()); setTransferState('USADO'); setTransferNotes('');
                            }}
                            className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors" title="Cambio de asignación (transferir)"
                          >
                            <ArrowRightLeft size={15} />
                          </button>
                          <button
                            onClick={() => { setReturnTarget(a); setReturnStatus('DANADA'); setReturnDate(today()); setReturnNotes(''); }}
                            className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors" title="Reportar daño (sin reemplazo)"
                          >
                            <AlertTriangle size={15} />
                          </button>
                          <button
                            onClick={() => { setReturnTarget(a); setReturnStatus('EXTRAVIADA'); setReturnDate(today()); setReturnNotes(''); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Reportar extravío (sin reemplazo)"
                          >
                            <ShieldAlert size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/asignaciones/${a.id}?print=true`}
                            target="_blank"
                            className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="Imprimir acta de entrega"
                          >
                            <Printer size={15} />
                          </Link>
                          <span className="p-1.5 text-gray-300" title="Asignación cerrada">
                            <History size={15} />
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Reporte de Inventario */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-md w-full shadow-2xl border border-gray-100 animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-light text-primary tracking-tight flex items-center gap-2">
                <FileText size={18} /> Reporte de Inventario
              </h2>
              <button onClick={() => setIsReportOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">
                Genera un documento imprimible de las herramientas <span className="font-semibold">activas</span> agrupadas por área y empleado, con casillas de verificación para el conteo físico.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-primary">Alcance</label>
                <select
                  value={reportArea}
                  onChange={e => setReportArea(e.target.value)}
                  className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="todas">Reporte completo (todas las áreas)</option>
                  {reportAreas.map(area => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
                {reportAreas.length === 0 && (
                  <p className="text-[10px] text-gray-400">No hay herramientas asignadas activas actualmente.</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setIsReportOpen(false)} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={openReport}
                disabled={reportAreas.length === 0}
                className="px-5 py-2.5 bg-primary text-background text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Printer size={16} /> Generar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel: Nueva Asignación */}
      {isPanelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-primary-dark/20 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-background border-l border-gray-200 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <h2 className="text-xl font-light text-primary tracking-tight">Nueva Asignación</h2>
              <button onClick={() => setIsPanelOpen(false)} disabled={isSaving} className="text-gray-400 hover:text-red-500 transition-colors">
                <X size={24} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 bg-gray-50/30">
              {/* Tipo de movimiento */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Tipo de Movimiento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['NUEVA', 'REEMPLAZO_DANO', 'REEMPLAZO_EXTRAVIO'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, assignment_type: t, previous_assignment_id: '' }))}
                      className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                        form.assignment_type === t ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400">
                  Para mover una herramienta de un empleado a otro usa la acción <span className="font-semibold">Transferir</span> directamente en la asignación activa.
                </p>
              </div>

              {/* Producto */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Herramienta / Equipo</h3>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Artículo asignable <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <div className="relative flex items-center border border-gray-200 bg-white focus-within:border-primary transition-colors">
                      <Search size={13} className="absolute left-3 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={e => {
                          setItemSearch(e.target.value);
                          setItemDropdownOpen(true);
                          if (!e.target.value) setForm(p => ({ ...p, inventory_item_id: '', previous_assignment_id: '' }));
                        }}
                        onFocus={() => setItemDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setItemDropdownOpen(false), 150)}
                        placeholder="Buscar por código o nombre..."
                        className="w-full pl-8 pr-8 py-2 text-sm bg-transparent focus:outline-none"
                      />
                      <ChevronDown size={13} className="absolute right-3 text-gray-400 pointer-events-none" />
                    </div>
                    {itemDropdownOpen && (
                      <div className="absolute z-50 w-full bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                        {items
                          .filter(i => `${i.code} ${i.name}`.toLowerCase().includes(itemSearch.toLowerCase()))
                          .map(i => (
                            <div
                              key={i.id}
                              className={`px-3 py-2 cursor-pointer hover:bg-primary/5 transition-colors flex justify-between items-center ${form.inventory_item_id === i.id ? 'bg-primary/10' : ''}`}
                              onMouseDown={() => {
                                setForm(p => ({ ...p, inventory_item_id: i.id, previous_assignment_id: '' }));
                                setItemSearch(`${i.code} — ${i.name}`);
                                setItemDropdownOpen(false);
                              }}
                            >
                              <span className="text-sm text-gray-700">{i.name} <span className="text-[10px] font-mono text-gray-400">{i.code}</span></span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${i.quantity > 0 ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-500 border-red-200 bg-red-50'}`}>
                                Stock: {i.quantity}
                              </span>
                            </div>
                          ))}
                        {items.length === 0 && (
                          <div className="px-3 py-3 text-xs text-gray-400 italic">
                            No hay artículos marcados como asignables. Marca el check &quot;Se entrega bajo asignación&quot; al crear o editar un artículo.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">N° de Serie (si aplica)</label>
                    <input
                      value={form.serial_number}
                      onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))}
                      placeholder="Ej. SN-90X22"
                      className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">Estado del artículo</label>
                    <div className="flex gap-2">
                      {(['NUEVO', 'USADO'] as const).map(st => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setForm(p => ({ ...p, item_state: st }))}
                          className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                            form.item_state === st
                              ? st === 'NUEVO' ? 'bg-green-600 text-white border-green-600' : 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Condición del artículo</label>
                  <textarea
                    value={form.condition_notes}
                    onChange={e => setForm(p => ({ ...p, condition_notes: e.target.value }))}
                    placeholder="Describe la condición física al momento de la entrega..."
                    rows={2}
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Reemplazo: asignación anterior */}
              {isReplacementType && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Asignación que se Reemplaza</h3>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-primary">
                      Asignación anterior <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={form.previous_assignment_id}
                      onChange={e => {
                        const prev = activeAssignments.find(a => a.id === e.target.value);
                        setForm(p => ({
                          ...p,
                          previous_assignment_id: e.target.value,
                          employee_id: prev ? prev.employee_id : p.employee_id,
                        }));
                        if (prev) setEmpSearch(`${prev.employees?.code} — ${empFullName(prev.employees)}`);
                      }}
                      className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="">Seleccione la asignación activa a cerrar</option>
                      {replaceableCandidates.map(a => (
                        <option key={a.id} value={a.id}>
                          AS-{String(a.consecutive ?? 0).padStart(4, '0')} · {a.inventory_items?.name} · {empFullName(a.employees)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400">
                      Se marcará como {form.assignment_type === 'REEMPLAZO_DANO' ? 'Dañada' : 'Extraviada'} al guardar. El empleado se precarga automáticamente.
                    </p>
                  </div>
                </div>
              )}

              {/* Empleado */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Empleado Responsable</h3>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Empleado <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <div className="relative flex items-center border border-gray-200 bg-white focus-within:border-primary transition-colors">
                      <Search size={13} className="absolute left-3 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={empSearch}
                        onChange={e => {
                          setEmpSearch(e.target.value);
                          setEmpDropdownOpen(true);
                          if (!e.target.value) setForm(p => ({ ...p, employee_id: '' }));
                        }}
                        onFocus={() => setEmpDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setEmpDropdownOpen(false), 150)}
                        placeholder="Buscar por código o nombre..."
                        className="w-full pl-8 pr-8 py-2 text-sm bg-transparent focus:outline-none"
                      />
                      <ChevronDown size={13} className="absolute right-3 text-gray-400 pointer-events-none" />
                    </div>
                    {empDropdownOpen && (
                      <div className="absolute z-50 w-full bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                        {employees
                          .filter(e => `${e.code} ${e.first_name} ${e.last_name}`.toLowerCase().includes(empSearch.toLowerCase()))
                          .map(e => (
                            <div
                              key={e.id}
                              className={`px-3 py-2 cursor-pointer hover:bg-primary/5 transition-colors ${form.employee_id === e.id ? 'bg-primary/10' : ''}`}
                              onMouseDown={() => {
                                setForm(p => ({ ...p, employee_id: e.id }));
                                setEmpSearch(`${e.code} — ${empFullName(e)}`);
                                setEmpDropdownOpen(false);
                              }}
                            >
                              <p className="text-sm text-gray-700">{empFullName(e)}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{e.code}{e.areas?.name ? ` · ${e.areas.name}` : ''}{e.position ? ` · ${e.position}` : ''}</p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Fecha de asignación</label>
                  <input
                    type="date"
                    value={form.assigned_date}
                    onChange={e => setForm(p => ({ ...p, assigned_date: e.target.value }))}
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Observaciones</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Notas adicionales de la entrega..."
                    rows={2}
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] text-blue-700 flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                Al guardar se descontará 1 unidad del stock del almacén y la herramienta quedará bajo responsabilidad del empleado.
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
              <button onClick={() => setIsPanelOpen(false)} disabled={isSaving} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 border border-transparent transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-primary text-background text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSaving ? 'Guardando...' : 'Guardar Asignación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Devolución / Daño / Extravío */}
      {returnTarget && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-md w-full shadow-2xl border border-gray-100 animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-light text-primary tracking-tight flex items-center gap-2">
                {returnStatus === 'DEVUELTA' ? <Undo2 size={18} /> : returnStatus === 'DANADA' ? <AlertTriangle size={18} className="text-orange-500" /> : <ShieldAlert size={18} className="text-red-500" />}
                {returnStatus === 'DEVUELTA' ? 'Devolver al Almacén' : returnStatus === 'DANADA' ? 'Reportar Daño' : 'Reportar Extravío'}
              </h2>
              <button onClick={() => setReturnTarget(null)} disabled={isSaving} className="text-gray-400 hover:text-red-500 transition-colors">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600">
                <p className="font-semibold text-primary">{returnTarget.inventory_items?.name} <span className="font-mono text-gray-400">{returnTarget.inventory_items?.code}</span></p>
                <p className="mt-0.5">Responsable: {empFullName(returnTarget.employees)}{returnTarget.serial_number ? ` · Serie: ${returnTarget.serial_number}` : ''}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-primary">Fecha</label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={e => setReturnDate(e.target.value)}
                  className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-primary">Notas {returnStatus !== 'DEVUELTA' && '(detalle del incidente)'}</label>
                <textarea
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  rows={3}
                  placeholder={returnStatus === 'DEVUELTA' ? 'Condición en la que se recibe...' : 'Describe lo ocurrido...'}
                  className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
              <p className="text-[10px] text-gray-400">
                {returnStatus === 'DEVUELTA'
                  ? 'La unidad se reingresará automáticamente al stock del almacén.'
                  : 'La unidad NO se reingresa al stock. Si se entregará un reemplazo, créalo luego como "Reemplazo" desde Nueva Asignación.'}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setReturnTarget(null)} disabled={isSaving} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleReturnSave}
                disabled={isSaving}
                className={`px-5 py-2.5 text-white text-xs font-bold uppercase tracking-widest transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 ${
                  returnStatus === 'DEVUELTA' ? 'bg-green-600 hover:bg-green-700' : returnStatus === 'DANADA' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Transferencia */}
      {transferTarget && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-md w-full shadow-2xl border border-gray-100 animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-light text-primary tracking-tight flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-purple-600" /> Cambio de Asignación
              </h2>
              <button onClick={() => setTransferTarget(null)} disabled={isSaving} className="text-gray-400 hover:text-red-500 transition-colors">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600">
                <p className="font-semibold text-primary">{transferTarget.inventory_items?.name} <span className="font-mono text-gray-400">{transferTarget.inventory_items?.code}</span></p>
                <p className="mt-0.5">Actualmente asignada a: <span className="font-semibold">{empFullName(transferTarget.employees)}</span></p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-primary">Nuevo responsable <span className="text-red-400">*</span></label>
                <div className="relative">
                  <div className="relative flex items-center border border-gray-200 bg-white focus-within:border-primary transition-colors">
                    <Search size={13} className="absolute left-3 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={transferEmpSearch}
                      onChange={e => {
                        setTransferEmpSearch(e.target.value);
                        setTransferEmpDropdownOpen(true);
                        if (!e.target.value) setTransferEmpId('');
                      }}
                      onFocus={() => setTransferEmpDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setTransferEmpDropdownOpen(false), 150)}
                      placeholder="Buscar empleado..."
                      className="w-full pl-8 pr-8 py-2 text-sm bg-transparent focus:outline-none"
                    />
                    <ChevronDown size={13} className="absolute right-3 text-gray-400 pointer-events-none" />
                  </div>
                  {transferEmpDropdownOpen && (
                    <div className="absolute z-50 w-full bg-white border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                      {employees
                        .filter(e => e.id !== transferTarget.employee_id)
                        .filter(e => `${e.code} ${e.first_name} ${e.last_name}`.toLowerCase().includes(transferEmpSearch.toLowerCase()))
                        .map(e => (
                          <div
                            key={e.id}
                            className={`px-3 py-2 cursor-pointer hover:bg-primary/5 transition-colors ${transferEmpId === e.id ? 'bg-primary/10' : ''}`}
                            onMouseDown={() => {
                              setTransferEmpId(e.id);
                              setTransferEmpSearch(`${e.code} — ${empFullName(e)}`);
                              setTransferEmpDropdownOpen(false);
                            }}
                          >
                            <p className="text-sm text-gray-700">{empFullName(e)}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{e.code}{e.areas?.name ? ` · ${e.areas.name}` : ''}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Fecha del cambio</label>
                  <input
                    type="date"
                    value={transferDate}
                    onChange={e => setTransferDate(e.target.value)}
                    className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Estado actual</label>
                  <div className="flex gap-2">
                    {(['NUEVO', 'USADO'] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTransferState(st)}
                        className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                          transferState === st
                            ? st === 'NUEVO' ? 'bg-green-600 text-white border-green-600' : 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-primary">Condición / Notas</label>
                <textarea
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  rows={2}
                  placeholder="Condición de la herramienta al momento del cambio..."
                  className="w-full border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
              <p className="text-[10px] text-gray-400">
                La herramienta física pasa de un empleado a otro: no afecta el stock del almacén. Se conserva el historial completo.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setTransferTarget(null)} disabled={isSaving} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleTransferSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-purple-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
