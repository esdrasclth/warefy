import { createClient } from '@supabase/supabase-js';

// Este cliente utiliza la SERVICE ROLE KEY y solo debe usarse en entornos de servidor (API routes)
// NUNCA exponer la SERVICE_ROLE_KEY en el cliente (NEXT_PUBLIC_).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
