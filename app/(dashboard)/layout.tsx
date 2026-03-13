'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import type { UserProfile } from '@/types';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          router.replace('/login');
          return;
        }

        // Fetch user profile with role and associated area
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
          // SECURITY: Usuarios sin perfil o con error de auth no deben acceder al dashboard
          if (profileError.code === 'PGRST116') {
            router.replace('/login?error=no_profile');
            return;
          }

          console.error('Error fetching profile:', profileError);
          // SECURITY: Redirigir cualquier error de perfil a un flujo de auth seguro
          router.replace('/login?error=auth_error');
          return;
        }

        setProfile(profileData);

        // RBAC: Whitelist-based Route Protection
        const role = profileData?.role;

        // Rutas permitidas por rol (whitelist)
        const ROLE_WHITELIST: Record<string, string[]> = {
          ADMIN: ['/dashboard', '/almacen', '/requisar', '/compras', '/empleados', '/presupuestos', '/configuracion', '/registros'],
          ALMACEN: ['/dashboard', '/almacen', '/requisar', '/compras', '/registros'],
          USER: ['/requisar'],
        };

        const roleAllowedRoutes = role ? ROLE_WHITELIST[role] : undefined;
        if (!roleAllowedRoutes) {
          // SECURITY: Bloquear roles inexistentes o faltantes
          router.replace('/login?error=invalid_role');
          return;
        }

        const isPathAllowed = roleAllowedRoutes.some(path => pathname.startsWith(path));
        if (!isPathAllowed) {
          // SECURITY: Denegar cualquier ruta no incluida explícitamente en el whitelist
          const redirectPath = role === 'USER' ? '/requisar' : '/dashboard';
          if (role !== 'ADMIN') {
            router.replace(redirectPath);
            return;
          }
        }

        setIsChecking(false);

      } catch (error) {
        console.error('Error checking auth session:', error);
        router.replace('/login?error=auth_error');
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (isChecking) {
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

  return <AppLayout userProfile={profile}>{children}</AppLayout>;
}
