import { supabase } from '@/utils/supabase/client';

export async function createNotification({
  type,
  title,
  message,
  link,
  targetRole,
  targetUserId,
}: {
  type: string;
  title: string;
  message: string;
  link?: string;
  targetRole?: string;
  targetUserId?: string;
}) {
  try {
    await supabase.from('notifications').insert({
      type,
      title,
      message,
      link: link ?? null,
      target_role: targetRole ?? null,
      target_user_id: targetUserId ?? null,
    });
  } catch {
    // Non-critical — never throw
  }
}

export async function notifyLowStock(productName: string, productId: string, current: number, minimum: number) {
  await createNotification({
    type: 'low_stock',
    title: 'Stock bajo',
    message: `"${productName}" tiene ${current} unidades (mínimo: ${minimum}).`,
    link: `/productos`,
    targetRole: 'ALMACEN',
  });
}

export async function notifyPendingApproval(consecutive: number, requisitionId: string, requester: string, approverUserId?: string) {
  await createNotification({
    type: 'pending_approval',
    title: 'Requisa pendiente de aprobación',
    message: `REQ-${String(consecutive).padStart(6, '0')} de ${requester} requiere tu aprobación.`,
    link: `/requisar/${requisitionId}`,
    targetRole: approverUserId ? undefined : 'ADMIN',
    targetUserId: approverUserId,
  });
}

export async function notifyPurchaseReceived(consecutive: number, purchaseId: string) {
  await createNotification({
    type: 'oc_received',
    title: 'Orden de compra recibida',
    message: `OC #${consecutive} fue marcada como RECIBIDA e inventario actualizado.`,
    link: `/compras/${purchaseId}`,
    targetRole: 'ALMACEN',
  });
}
