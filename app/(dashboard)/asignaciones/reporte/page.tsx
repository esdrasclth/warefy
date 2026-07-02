'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Printer, Loader2, Wrench } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import type { ToolAssignment } from '@/types';

const NO_AREA = 'Sin Área';

export default function ReporteInventarioPage() {
  const searchParams = useSearchParams();
  const areaParam = searchParams.get('area'); // null o 'todas' => completo; en otro caso, nombre de área
  const [assignments, setAssignments] = useState<ToolAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('tool_assignments')
        .select(`
          *,
          inventory_items ( code, name, units!unit_id ( name ) ),
          employees ( code, first_name, last_name, position, areas ( name ) )
        `)
        .eq('status', 'ACTIVA')
        .order('assigned_date', { ascending: true });
      setAssignments((data || []) as unknown as ToolAssignment[]);
      setIsLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!isLoading && searchParams.get('print') === 'true') {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [isLoading, searchParams]);

  const empFullName = (e?: ToolAssignment['employees'] | null) =>
    e ? `${e.first_name} ${e.last_name}`.trim() : '—';

  const fmtDate = (d?: string | null) =>
    d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // Agrupar por área -> empleado (solo activas, omitiendo empleados sin herramientas por construcción)
  const grouped = useMemo(() => {
    const filtered = assignments.filter(a => {
      if (!areaParam || areaParam === 'todas') return true;
      return (a.employees?.areas?.name || NO_AREA) === areaParam;
    });

    const areas = new Map<string, Map<string, { employee: ToolAssignment['employees']; items: ToolAssignment[] }>>();
    for (const a of filtered) {
      const areaName = a.employees?.areas?.name || NO_AREA;
      const empKey = a.employee_id;
      if (!areas.has(areaName)) areas.set(areaName, new Map());
      const empMap = areas.get(areaName)!;
      if (!empMap.has(empKey)) empMap.set(empKey, { employee: a.employees, items: [] });
      empMap.get(empKey)!.items.push(a);
    }

    return [...areas.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([areaName, empMap]) => ({
        areaName,
        total: [...empMap.values()].reduce((s, e) => s + e.items.length, 0),
        employees: [...empMap.values()].sort((x, y) => empFullName(x.employee).localeCompare(empFullName(y.employee), 'es')),
      }));
  }, [assignments, areaParam]);

  const totals = useMemo(() => {
    const toolCount = grouped.reduce((s, g) => s + g.total, 0);
    const empCount = grouped.reduce((s, g) => s + g.employees.length, 0);
    return { toolCount, empCount };
  }, [grouped]);

  const scopeLabel = !areaParam || areaParam === 'todas' ? 'Todas las áreas' : areaParam;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-primary">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 print:space-y-3 pb-12 print:pb-0 animate-in fade-in duration-500">
      <style type="text/css" media="print">
        {`
          @page { size: letter landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #reporte-doc { zoom: 0.82; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        `}
      </style>

      {/* Barra de acciones (no se imprime) */}
      <div className="flex justify-between items-center print:hidden">
        <Link href="/asignaciones" className="flex items-center gap-2 p-2 border border-gray-200 text-gray-500 hover:text-primary hover:border-primary transition-colors bg-gray-50 text-sm">
          <ArrowLeft size={16} /> Volver
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-primary text-background px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm"
        >
          <Printer size={16} /> Imprimir / Guardar PDF
        </button>
      </div>

      {/* Documento */}
      <div id="reporte-doc" className="bg-white border border-gray-100 shadow-sm print:shadow-none print:border-none p-10 print:p-0 space-y-8 print:space-y-5">
        {/* Encabezado */}
        <div className="flex justify-between items-start border-b-2 border-primary pb-4">
          <div>
            <Image src="/logowarefy.png" alt="Warefy" width={110} height={33} className="object-contain mb-2" />
            <h1 className="text-xl print:text-lg font-bold text-primary tracking-tight uppercase">
              Reporte de Inventario de Herramientas Asignadas
            </h1>
            <p className="text-xs text-gray-500 mt-1">Alcance: <span className="font-semibold text-gray-700">{scopeLabel}</span> · Solo asignaciones activas</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Fecha de emisión</p>
            <p className="text-sm font-semibold text-primary">{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <div className="mt-3 flex gap-4 justify-end text-right">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Herramientas</p>
                <p className="text-lg font-light text-primary">{totals.toolCount}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Empleados</p>
                <p className="text-lg font-light text-primary">{totals.empCount}</p>
              </div>
            </div>
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Wrench size={32} className="mx-auto mb-2 text-gray-200" />
            No hay herramientas asignadas activas{!areaParam || areaParam === 'todas' ? '' : ` en "${scopeLabel}"`}.
          </div>
        ) : (
          grouped.map(area => (
            <div key={area.areaName} className="space-y-4">
              {/* Encabezado de área */}
              <div className="flex justify-between items-center bg-primary/5 border-l-4 border-primary px-3 py-2">
                <h2 className="text-sm font-bold text-primary uppercase tracking-wider">{area.areaName}</h2>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{area.total} herramienta(s)</span>
              </div>

              {area.employees.map(({ employee, items }) => (
                <div key={items[0].employee_id} className="space-y-1.5 pl-1">
                  {/* Encabezado de empleado */}
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-gray-100 pb-1">
                    <span className="text-sm font-semibold text-gray-800">{empFullName(employee)}</span>
                    <span className="text-[11px] font-mono text-gray-400">{employee?.code || '—'}</span>
                    {employee?.position && <span className="text-[11px] text-gray-400">· {employee.position}</span>}
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest ml-auto">{items.length} ítem(s)</span>
                  </div>

                  {/* Tabla de herramientas del empleado */}
                  <table className="w-full text-left text-sm border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest text-center w-8">✓</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest">Acta</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest">Código</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest">Descripción</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest">N° Serie</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest text-center">Estado</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest">F. Asignación</th>
                        <th className="py-1.5 px-2 text-[9px] font-bold text-primary/70 uppercase tracking-widest w-32">Obs. física</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(a => (
                        <tr key={a.id} className="border-b border-gray-50">
                          <td className="py-2 px-2 text-center"><span className="inline-block w-3.5 h-3.5 border border-gray-400" /></td>
                          <td className="py-2 px-2 font-mono text-[11px] text-gray-500">AS-{String(a.consecutive ?? 0).padStart(4, '0')}</td>
                          <td className="py-2 px-2 font-mono text-[11px]">{a.inventory_items?.code}</td>
                          <td className="py-2 px-2 font-semibold text-gray-800 text-[12px]">{a.inventory_items?.name}</td>
                          <td className="py-2 px-2 font-mono text-[11px]">{a.serial_number || 'N/A'}</td>
                          <td className="py-2 px-2 text-center text-[10px] font-bold">{a.item_state}</td>
                          <td className="py-2 px-2 text-[11px]">{fmtDate(a.assigned_date)}</td>
                          <td className="py-2 px-2"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))
        )}

        {/* Firma del inventario */}
        {grouped.length > 0 && (
          <div className="pt-12 print:pt-10 grid grid-cols-2 gap-16">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest">Realizó el inventario</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Nombre, firma y fecha</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest">Revisó — Almacén</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Nombre, firma y fecha</p>
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 text-center pt-4 border-t border-gray-100">
          Documento generado por Warefy · {new Date().toLocaleString('es-ES')}
        </p>
      </div>
    </div>
  );
}
