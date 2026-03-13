'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [profile, setProfile] = useState<any>(null);
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
          // PGRST116 means no rows found (expected for initial admin or users without roles)
          if (profileError.code !== 'PGRST116') {
            console.error('Error fetching profile:', profileError);
          }
          // Permitir acceso como ADMIN por defecto si no hay perfil (para el admin inicial)
          setIsChecking(false);
          return;
        }

        setProfile(profileData);

        // RBAC: Route Protection
        const role = profileData?.role || 'ADMIN';
        const isUserAccessingUnauthorized = (
          (role === 'USER' && (pathname === '/dashboard' || !['/dashboard', '/requisar'].some(path => pathname.startsWith(path)))) ||
          (role === 'ALMACEN' && ['/empleados', '/presupuestos', '/configuracion'].some(path => pathname.startsWith(path)))
        );

        if (isUserAccessingUnauthorized) {
          const redirectPath = role === 'USER' ? '/requisar' : '/dashboard';
          router.replace(redirectPath);
        } else {
          setIsChecking(false);
        }

      } catch (error) {
        console.error('Error checking auth session:', error);
        router.replace('/login');
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
