'use client';

import { Menu, UserCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <header className="h-20 bg-background border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="md:hidden text-primary hover:text-accent transition-colors p-2 -ml-2"
        >
          <Menu size={24} />
        </button>
        <div className="hidden md:block text-xs font-bold tracking-widest uppercase text-gray-500">
          Panel de Control
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-semibold text-primary">Admin User</span>
            <span className="text-xs text-gray-400 font-medium">Almacén Central</span>
          </div>
          <button className="text-primary hover:text-accent transition-colors">
            <UserCircle size={36} strokeWidth={1.5} />
          </button>
        </div>

        <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-gray-500 hover:text-red-600 transition-colors"
          title="Cerrar Sesión"
        >
          <LogOut size={20} strokeWidth={1.5} />
          <span className="text-xs font-bold tracking-widest uppercase hidden md:inline-block">Salir</span>
        </button>
      </div>
    </header>
  );
}
