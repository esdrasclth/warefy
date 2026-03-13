import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  try {
    const { email, password, role, employeeId, first_name, last_name } = await request.json();

    if (!email || !password || !role || !employeeId) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    // 1. Crear el usuario en auth.users usando el cliente admin
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name }
    });

    if (userError) {
      return NextResponse.json({ error: 'Error en auth: ' + userError.message }, { status: 500 });
    }

    const userId = userData.user.id;

    // 2. Crear el perfil vinculado al empleado y rol
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        employee_id: employeeId,
        role: role
      });

    if (profileError) {
      // Intentar limpiar el usuario si falla el perfil (opcional)
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Error en perfil: ' + profileError.message }, { status: 500 });
    }

    // 3. Opcional: Actualizar el employee_id para marcar que tiene usuario
    await supabaseAdmin
      .from('employees')
      .update({ user_id: userId })
      .eq('id', employeeId);

    return NextResponse.json({ success: true, userId });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
