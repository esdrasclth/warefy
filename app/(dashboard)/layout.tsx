'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          router.replace('/login');
        } else {
          setIsChecking(false);
        }
      } catch (error) {
        console.error('Error checking auth session:', error);
        router.replace('/login');
      }
    };

    checkUser();

    // Set up auth state listener for logouts taking place while in the app
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
        <Loader2 size={48} className="animate-spin text-primary" />
        <span className="ml-4 text-primary font-medium tracking-widest uppercase">Verificando Credenciales...</span>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
