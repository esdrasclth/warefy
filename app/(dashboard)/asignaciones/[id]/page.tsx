'use client';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Printer, Loader2, Wrench } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import type { ToolAssignment, ToolAssignmentType } from '@/types';

const TYPE_LABELS: Record<ToolAssignmentType, string> = {
  NUEVA: 'Nueva Asignación',
  REEMPLAZO_DANO: 'Reemplazo por Daño',
  REEMPLAZO_EXTRAVIO: 'Reemplazo por Extravío',
  CAMBIO_ASIGNACION: 'Cambio de Asignación',
};

const CONDITIONS = [
  'El empleado se hace responsable de la herramienta o equipo recibido, comprometiéndose a mantenerlo en óptimas condiciones para trabajar.',
  'La herramienta es para uso exclusivo de las labores asignadas por la empresa. Queda prohibido su uso personal o el préstamo a terceros sin autorización previa.',
  'En caso de daño ocasionado por negligencia o mal uso, el empleado asumirá el costo de reparación o reposición, según evaluación de la empresa.',
  'En caso de extravío o robo, el empleado deberá reportarlo de inmediato a su supervisor y al almacén. Podrá aplicarse el descuento correspondiente conforme a las políticas internas.',
  'Cualquier falla o desperfecto deberá reportarse oportunamente al almacén. No se permiten reparaciones por cuenta propia sin autorización.',
  'El empleado deberá devolver la herramienta al almacén al finalizar la relación laboral, al cambiar de puesto o cuando la empresa lo solicite, en las condiciones en que le fue entregada, salvo el desgaste normal por uso.',
  'La firma del presente documento constituye la aceptación de la entrega de la herramienta y de las condiciones aquí descritas.',
];

export default function ActaAsignacionPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [assignment, setAssignment] = useState<ToolAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAssignment = async () => {
      const { data } = await supabase
        .from('tool_assignments')
        .select(`
          *,
          inventory_items ( code, name, units!unit_id ( name ) ),
          employees ( code, first_name, last_name, position, areas ( name ) )
        `)
        .eq('id', params.id)
        .single();
      setAssignment(data as unknown as ToolAssignment);
      setIsLoading(false);
    };
    fetchAssignment();
  }, [params.id]);

  useEffect(() => {
    if (!isLoading && assignment && searchParams.get('print') === 'true') {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [isLoading, assignment, searchParams]);

  const fmtDate = (d?: string | null) =>
    d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-primary">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="text-center py-24 text-gray-400">
        <Wrench size={32} className="mx-auto mb-2 text-gray-200" />
        Asignación no encontrada.
        <div className="mt-4">
          <Link href="/asignaciones" className="text-primary text-sm underline">Volver a Asignaciones</Link>
        </div>
      </div>
    );
  }

  const empName = assignment.employees ? `${assignment.employees.first_name} ${assignment.employees.last_name}`.trim() : '—';
  const consecutive = `AS-${String(assignment.consecutive ?? 0).padStart(4, '0')}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:space-y-3 pb-12 print:pb-0 animate-in fade-in duration-500">
      <style type="text/css" media="print">
        {`
          @page { size: letter; margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
      <div className="bg-white border border-gray-100 shadow-sm print:shadow-none print:border-none p-10 print:p-0 space-y-8 print:space-y-5">
        {/* Encabezado */}
        <div className="flex justify-between items-start border-b-2 border-primary pb-4">
          <div>
            <Image src="/logowarefy.png" alt="Warefy" width={110} height={33} className="object-contain mb-2" />
            <h1 className="text-xl print:text-lg font-bold text-primary tracking-tight uppercase">
              Acta de Entrega y Responsabilidad de Herramienta
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Documento N°</p>
            <p className="text-lg font-mono font-bold text-primary">{consecutive}</p>
            <p className="text-xs text-gray-500 mt-1">{fmtDate(assignment.assigned_date)}</p>
          </div>
        </div>

        {/* Datos del empleado */}
        <div>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1.5 mb-3">Datos del Empleado Responsable</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div><span className="text-gray-400 text-xs uppercase">Nombre:</span> <span className="font-semibold text-gray-800">{empName}</span></div>
            <div><span className="text-gray-400 text-xs uppercase">Código:</span> <span className="font-mono text-gray-800">{assignment.employees?.code || '—'}</span></div>
            <div><span className="text-gray-400 text-xs uppercase">Área:</span> <span className="text-gray-800">{assignment.employees?.areas?.name || '—'}</span></div>
            <div><span className="text-gray-400 text-xs uppercase">Cargo:</span> <span className="text-gray-800">{assignment.employees?.position || '—'}</span></div>
          </div>
        </div>

        {/* Condiciones */}
        <div>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1.5 mb-3">Condiciones de la Asignación</h2>
          <ol className="space-y-2 text-[13px] print:text-xs text-gray-700 leading-relaxed list-none">
            {CONDITIONS.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-bold text-primary flex-shrink-0">{i + 1}.</span>
                <span>{c}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Detalle de la herramienta */}
        <div>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1.5 mb-3">Herramienta Asignada</h2>
          <table className="w-full text-left text-sm border border-gray-200">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Código</th>
                <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Descripción</th>
                <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">N° Serie</th>
                <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Estado</th>
                <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">F. Asignación</th>
                <th className="py-2 px-3 text-[10px] font-bold text-primary/70 uppercase tracking-widest">Tipo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2.5 px-3 font-mono text-xs">{assignment.inventory_items?.code}</td>
                <td className="py-2.5 px-3 font-semibold text-gray-800">{assignment.inventory_items?.name}</td>
                <td className="py-2.5 px-3 font-mono text-xs">{assignment.serial_number || 'N/A'}</td>
                <td className="py-2.5 px-3 text-xs font-bold">{assignment.item_state}</td>
                <td className="py-2.5 px-3 text-xs">{fmtDate(assignment.assigned_date)}</td>
                <td className="py-2.5 px-3 text-xs">{TYPE_LABELS[assignment.assignment_type]}</td>
              </tr>
            </tbody>
          </table>
          {(assignment.condition_notes || assignment.notes) && (
            <div className="mt-3 space-y-1 text-[13px] print:text-xs text-gray-700">
              {assignment.condition_notes && <p><span className="text-gray-400 text-xs uppercase">Condición del artículo:</span> {assignment.condition_notes}</p>}
              {assignment.notes && <p><span className="text-gray-400 text-xs uppercase">Observaciones:</span> {assignment.notes}</p>}
            </div>
          )}
        </div>

        {/* Firmas */}
        <div className="pt-12 print:pt-10 grid grid-cols-2 gap-16">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-semibold text-gray-800">{empName}</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest mt-0.5">Recibí Conforme — Empleado</p>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{assignment.employees?.code}</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-semibold text-gray-800">&nbsp;</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest mt-0.5">Entregado por — Almacén</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Nombre y Firma</p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center pt-4 border-t border-gray-100">
          Documento generado por Warefy · {consecutive} · {new Date().toLocaleDateString('es-ES')}
        </p>
      </div>
    </div>
  );
}
