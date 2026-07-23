import { supabaseAdmin } from '@/utils/supabase/admin';

type RequisitionEvent = 'approved' | 'delivered' | 'cancelled';

const EVENT_CONTENT: Record<RequisitionEvent, { type: string; title: string; verb: string }> = {
  approved:  { type: 'requisition_approved',  title: 'Requisa aprobada',  verb: 'fue aprobada y enviada a almacén' },
  delivered: { type: 'requisition_delivered', title: 'Requisa entregada', verb: 'fue entregada por almacén' },
  cancelled: { type: 'requisition_cancelled', title: 'Requisa cancelada', verb: 'fue cancelada' },
};

/**
 * Notifica al solicitante (dueño) de una requisa sobre un cambio de estado.
 * Resuelve el usuario a partir de requester_code -> employees.user_id.
 * Nunca lanza: las notificaciones no deben romper el flujo principal.
 */
export async function notifyRequisitionRequester(requisitionId: string, event: RequisitionEvent) {
  try {
    const { data: req } = await supabaseAdmin
      .from('requisitions')
      .select('consecutive, requester_code')
      .eq('id', requisitionId)
      .single();

    if (!req?.requester_code) return;

    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('user_id')
      .eq('code', req.requester_code)
      .single();

    if (!emp?.user_id) return;

    const { type, title, verb } = EVENT_CONTENT[event];
    const code = `REQ-${String(req.consecutive ?? 0).padStart(6, '0')}`;

    await supabaseAdmin.from('notifications').insert({
      type,
      title,
      message: `Tu requisa ${code} ${verb}.`,
      link: `/requisar/${requisitionId}`,
      target_role: null,
      target_user_id: emp.user_id,
    });
  } catch {
    // Non-critical — never throw
  }
}
