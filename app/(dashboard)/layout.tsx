'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Confirm';
import type { UserProfile } from '@/types';
import { clearCache } from '@/utils/queryCache';

// RBAC: rutas permitidas por rol (whitelist).
const ROLE_WHITELIST: Record<string, string[]> = {
  ADMIN: ['/dashboard', '/productos', '/requisar', '/compras', '/empleados', '/presupuestos', '/configuracion', '/registros', '/auditoria', '/proveedores', '/asignaciones'],
  ALMACEN: ['/dashboard', '/productos', '/requisar', '/compras', '/registros', '/proveedores', '/asignaciones'],
  USER: ['/requisar'],
  APROBADOR: ['/requisar'],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // 1. Sesión y perfil: una sola vez por carga, NO en cada navegación.
  //    Antes este efecto dependía de `pathname`, así que cambiar de pantalla
  //    volvía a consultar `profiles` (con sus joins) y re-suscribía el listener
  //    de auth cada vez, antes de que la pantalla pudiera pintar nada.
  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.replace('/login');
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select(`
            *,
            employees (
              id,
              first_name,
              last_name,
              area_id,
              area_name,
              position,
              areas ( name )
            )
          `)
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          // SECURITY: Usuarios sin perfil o con error de auth no deben acceder al dashboard.
          // Cerramos la sesión para que /login no rebote de vuelta al dashboard (loop).
          await supabase.auth.signOut();
          if (profileError.code === 'PGRST116') {
            router.replace('/login?error=no_profile');
            return;
          }

          console.error('Error fetching profile:', profileError);
          // SECURITY: Redirigir cualquier error de perfil a un flujo de auth seguro
          router.replace('/login?error=auth_error');
          return;
        }

        if (!cancelled) setProfile(profileData);
      } catch (error) {
        console.error('Error checking auth session:', error);
        router.replace('/login?error=auth_error');
      }
    };

    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        // SECURITY: el cache puede tener filas que el siguiente usuario que
        // inicie sesión en este navegador no tiene permiso de ver.
        clearCache();
        router.replace('/login');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  // 2. RBAC en cada navegación, evaluado contra el perfil ya cargado.
  //    Es la misma verificación de antes, pero sin red: ya no cuesta un
  //    round-trip por pantalla.
  const role = profile?.role;
  const allowedRoutes = role ? ROLE_WHITELIST[role] : undefined;
  const isPathAllowed = allowedRoutes?.some(p => pathname.startsWith(p)) ?? false;

  // Derivado, no estado: no hay nada que sincronizar con un efecto.
  // ADMIN puede permanecer en rutas fuera del whitelist, como antes.
  const canRender = !!profile && !!allowedRoutes && (isPathAllowed || role === 'ADMIN');

  // El efecto solo redirige; no fija estado.
  useEffect(() => {
    if (!profile) return;

    if (!allowedRoutes) {
      // SECURITY: Bloquear roles inexistentes o faltantes
      router.replace('/login?error=invalid_role');
      return;
    }

    // SECURITY: Denegar cualquier ruta no incluida explícitamente en el whitelist
    if (!isPathAllowed && role !== 'ADMIN') {
      router.replace((role === 'USER' || role === 'APROBADOR') ? '/requisar' : '/dashboard');
    }
  }, [profile, allowedRoutes, isPathAllowed, role, router]);

  if (!canRender) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <Loader2 size={48} className="animate-spin text-primary shrink-0" />
          <div className="text-center">
            <span className="block text-primary font-bold tracking-[0.2em] uppercase text-sm">Verificando Credenciales</span>
            <span className="block text-gray-400 text-[10px] uppercase mt-2 font-medium tracking-widest">Iniciando entorno de seguridad...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppLayout userProfile={profile ?? undefined}>{children}</AppLayout>
      </ConfirmProvider>
    </ToastProvider>
  );
}
