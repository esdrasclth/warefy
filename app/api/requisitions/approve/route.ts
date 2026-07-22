import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from '@/lib/r2';
import { supabaseAdmin } from '@/utils/supabase/admin';

const MAX_SIZE = 1 * 1024 * 1024; // 1MB

async function getAuthenticatedProfile(
  request: Request
): Promise<{ userId: string; role: string; code: string | null } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, employees(code)')
    .eq('id', user.id)
    .single();

  if (!profile) return null;
  const employees = profile.employees as { code?: string } | { code?: string }[] | null;
  const code = Array.isArray(employees) ? employees[0]?.code ?? null : employees?.code ?? null;
  return { userId: user.id, role: profile.role, code };
}

export async function POST(request: Request) {
  try {
    if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
        !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || !process.env.CLOUDFLARE_R2_BUCKET_NAME ||
        !process.env.CLOUDFLARE_R2_PUBLIC_URL) {
      return NextResponse.json({ error: 'Configuración de almacenamiento incompleta en el servidor.' }, { status: 500 });
    }

    const auth = await getAuthenticatedProfile(request);
    if (!auth) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const formData = await request.formData();
    const requisitionId = formData.get('requisitionId') as string | null;
    const file = formData.get('signature') as File | null;

    if (!requisitionId) {
      return NextResponse.json({ error: 'Falta el identificador de la requisa' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'La firma es obligatoria para autorizar' }, { status: 400 });
    }
    if (file.type !== 'image/png') {
      return NextResponse.json({ error: 'Formato de firma no válido' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'La firma supera el tamaño máximo permitido' }, { status: 400 });
    }

    const { data: requisition, error: reqError } = await supabaseAdmin
      .from('requisitions')
      .select('status, approver_code')
      .eq('id', requisitionId)
      .single();

    if (reqError || !requisition) {
      return NextResponse.json({ error: 'Requisa no encontrada' }, { status: 404 });
    }
    if (requisition.status !== 'PENDIENTE DE APROBACION') {
      return NextResponse.json({ error: 'La requisa no está pendiente de aprobación' }, { status: 409 });
    }

    const canApprove =
      auth.role === 'ADMIN' ||
      (auth.role === 'APROBADOR' && auth.code && requisition.approver_code === auth.code);
    if (!canApprove) {
      return NextResponse.json({ error: 'Sin permisos para aprobar esta requisa' }, { status: 403 });
    }

    const key = `signatures/${requisitionId}/${crypto.randomUUID()}.png`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    }));

    const signatureUrl = `${R2_PUBLIC_URL}/${key}`;

    const { error: updateError } = await supabaseAdmin
      .from('requisitions')
      .update({ status: 'PENDIENTE', approver_signature_url: signatureUrl, approved_at: new Date().toISOString() })
      .eq('id', requisitionId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, signatureUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[requisitions/approve] Error:', msg);
    return NextResponse.json({ error: 'Error interno del servidor', detail: msg }, { status: 500 });
  }
}
