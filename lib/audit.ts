import { supabase } from '@/utils/supabase/client';

export async function logAudit({
  tableName,
  recordId,
  action,
  description,
  changedById,
  changedByName,
  oldValues,
  newValues,
}: {
  tableName: string;
  recordId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'INVENTORY_ADJUST';
  description: string;
  changedById?: string;
  changedByName?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}) {
  try {
    await supabase.from('audit_logs').insert({
      table_name: tableName,
      record_id: recordId,
      action,
      description,
      changed_by_id: changedById ?? null,
      changed_by_name: changedByName ?? null,
      old_values: oldValues ?? null,
      new_values: newValues ?? null,
    });
  } catch {
    // Non-critical — never throw
  }
}
