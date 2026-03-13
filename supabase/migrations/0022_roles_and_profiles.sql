-- 0022_roles_and_profiles.sql
-- Description: Implementación de perfiles y roles vinculados a empleados.

-- 1. Crear tabla de perfiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    role text NOT NULL CHECK (role IN ('ADMIN', 'ALMACEN', 'USER')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Vincular empleados con usuarios (Opcional, pero útil para visualización)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de acceso (Permisivas para desarrollo local, similar a otros módulos)
DROP POLICY IF EXISTS "Public Access Profiles" ON public.profiles;
CREATE POLICY "Public Access Profiles" ON public.profiles FOR ALL USING (true);

-- 5. Función para asegurar que el primer usuario sea ADMIN (Opcional, pero ayuda al usuario actual)
-- Nota: En un entorno real, esto se manejaría con más cuidado.
-- Aquí simplemente permitimos que los perfiles se gestionen libremente.

-- 6. Recargar schema
NOTIFY pgrst, 'reload schema';
