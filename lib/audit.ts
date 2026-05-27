import { supabase } from '@/utils/supabase/client';

async function resolveUser(changedById?: string, changedByName?: string) {
  if (changedByName) return { id: changedById ?? null, name: changedByName };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { id: null, name: null };

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, employees(first_name, last_name)')
      .eq('id', session.user.id)
      .single();

    if (!profile) return { id: session.user.id, name: null };

    const emp = Array.isArray(profile.employees) ? profile.employees[0] : profile.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : session.user.email ?? null;

    return { id: session.user.id, name };
  } catch {
    return { id: null, name: null };
  }
}

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
    const user = await resolveUser(changedById, changedByName);
    await supabase.from('audit_logs').insert({
      table_name: tableName,
      record_id: recordId,
      action,
      description,
      changed_by_id: user.id,
      changed_by_name: user.name,
      old_values: oldValues ?? null,
      new_values: newValues ?? null,
    });
  } catch {
    // Non-critical — never throw
  }
}
