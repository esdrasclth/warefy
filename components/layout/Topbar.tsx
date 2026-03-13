'use client';

import { Menu, UserCircle, LogOut, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';

interface TopbarProps {
  onMenuClick: () => void;
  userProfile?: any;
}

export default function Topbar({ onMenuClick, userProfile }: TopbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const displayName = userProfile?.employees 
    ? `${userProfile.employees.first_name} ${userProfile.employees.last_name}`
    : 'Admin User';

  const displayPosition = userProfile?.employees?.position || '';
  const displayAreaName = userProfile?.employees?.area_name || userProfile?.employees?.areas?.name || 'Administración';
  const displayArea = displayPosition ? `${displayPosition} - ${displayAreaName}` : displayAreaName;
  const roleLabel = userProfile?.role || 'ADMIN';

  return (
    <header className="h-20 bg-background border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="md:hidden text-primary hover:text-accent transition-colors p-2 -ml-2"
        >
          <Menu size={24} />
        </button>
        <div className="hidden md:block text-xs font-bold tracking-widest uppercase text-gray-500 flex items-center gap-2">
          <Shield size={12} className="text-primary/40" />
          {roleLabel} - Panel de Control
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-semibold text-primary">{displayName}</span>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{displayArea}</span>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-gray-500 hover:text-red-600 transition-colors group"
          title="Cerrar Sesión"
        >
          <LogOut size={20} strokeWidth={1.5} className="group-hover:translate-x-1 transition-transform" />
          <span className="text-xs font-bold tracking-widest uppercase hidden md:inline-block">Salir</span>
        </button>
      </div>
    </header>
  );
}
