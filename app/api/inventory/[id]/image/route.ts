import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from '@/lib/r2';
import { supabaseAdmin } from '@/utils/supabase/admin';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Cliente Supabase autenticado con el JWT del usuario (pasa por RLS correctamente)
function createUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

async function getAuthenticatedRole(
  request: Request
): Promise<{ userId: string; role: string; token: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) return null;
  return { userId: user.id, role: profile.role, token };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
        !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || !process.env.CLOUDFLARE_R2_BUCKET_NAME ||
        !process.env.CLOUDFLARE_R2_PUBLIC_URL) {
      return NextResponse.json({ error: 'Configuración de almacenamiento incompleta en el servidor.' }, { status: 500 });
    }

    const auth = await getAuthenticatedRole(request);
    if (!auth) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (auth.role !== 'ADMIN' && auth.role !== 'ALMACEN') {
      return NextResponse.json({ error: 'Sin permisos para esta acción' }, { status: 403 });
    }

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido. Use JPG, PNG o WebP.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo supera el tamaño máximo de 2MB.' }, { status: 400 });
    }

    // Usar cliente con JWT del usuario para operaciones de DB (respeta RLS)
    const db = createUserClient(auth.token);

    const { data: product, error: selectError } = await db
      .from('inventory_items')
      .select('image_url')
      .eq('id', id)
      .single();

    // PGRST116 = fila no encontrada (producto nuevo aún no guardado en BD)
    if (selectError && selectError.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Error al consultar el producto: ' + selectError.message }, { status: 500 });
    }

    if (product?.image_url) {
      const existingKey = product.image_url.replace(`${R2_PUBLIC_URL}/`, '');
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: existingKey }));
    }

    const ext = EXT_MAP[file.type];
    const key = `products/${id}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    const imageUrl = `${R2_PUBLIC_URL}/${key}`;

    // Si el producto ya existe en BD, actualizamos image_url.
    // Si es nuevo (no existe aún), el INSERT del formulario lo incluirá.
    if (!selectError) {
      const { error: updateError } = await db
        .from('inventory_items')
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updateError) {
        console.error('[image/POST] Error al actualizar Supabase:', updateError.message);
        return NextResponse.json({ error: 'Error al guardar la URL de la imagen: ' + updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, imageUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[image/POST] Error:', msg);
    return NextResponse.json({ error: 'Error interno del servidor', detail: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedRole(request);
    if (!auth) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (auth.role !== 'ADMIN' && auth.role !== 'ALMACEN') {
      return NextResponse.json({ error: 'Sin permisos para esta acción' }, { status: 403 });
    }

    const { id } = await params;
    const db = createUserClient(auth.token);

    const { data: product } = await db
      .from('inventory_items')
      .select('image_url')
      .eq('id', id)
      .single();

    if (product?.image_url) {
      const key = product.image_url.replace(`${R2_PUBLIC_URL}/`, '');
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    }

    const { error: updateError } = await db
      .from('inventory_items')
      .update({ image_url: null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      console.error('[image/DELETE] Error al actualizar Supabase:', updateError.message);
      return NextResponse.json({ error: 'Error al eliminar la imagen: ' + updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[image/DELETE] Error:', msg);
    return NextResponse.json({ error: 'Error interno del servidor', detail: msg }, { status: 500 });
  }
}
