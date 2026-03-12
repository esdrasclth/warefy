'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, ClipboardList, Wallet, Users, X, Settings } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Almacén', href: '/almacen', icon: Package },
    { name: 'Requisar', href: '/requisar', icon: ClipboardList },
    { name: 'Presupuestos', href: '/presupuestos', icon: Wallet },
    { name: 'Empleados', href: '/empleados', icon: Users },
    { name: 'Configuración', href: '/configuracion', icon: Settings },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 bg-primary-dark/20 backdrop-blur-sm z-20 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsOpen(false)}
      />
      
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-background border-r border-gray-200 text-primary transform transition-transform duration-300 md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col h-full`}
      >
        <div className="flex h-20 items-center justify-between px-8 border-b border-gray-100">
          <span className="text-xl font-bold tracking-widest text-primary uppercase">Warefy</span>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-primary hover:text-accent transition-colors">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary text-background shadow-md' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-primary'
                }`}
                onClick={() => setIsOpen(false)}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span className="tracking-wide">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-auto p-6 border-t border-gray-100 text-xs text-gray-400 font-medium tracking-wider uppercase text-center">
          ERP System v1.0
        </div>
      </aside>
    </>
  );
}
