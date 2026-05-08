'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, ClipboardList, Wallet, Users, X, Settings, BookOpen, ShoppingCart, TrendingDown, ScrollText } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  userRole?: 'ADMIN' | 'ALMACEN' | 'USER';
}

export default function Sidebar({ isOpen, setIsOpen, userRole }: SidebarProps) {
  const pathname = usePathname();

  const allNavItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'ALMACEN'] },
    { name: 'Productos', href: '/productos', icon: Package, roles: ['ADMIN', 'ALMACEN'] },
    { name: 'Compras', href: '/compras', icon: ShoppingCart, roles: ['ADMIN', 'ALMACEN'] },
    { name: 'Sugerencias', href: '/compras/sugerencias', icon: TrendingDown, roles: ['ADMIN', 'ALMACEN'] },
    { name: 'Requisar', href: '/requisar', icon: ClipboardList, roles: ['ADMIN', 'ALMACEN', 'USER'] },
    { name: 'Registros', href: '/registros', icon: BookOpen, roles: ['ADMIN', 'ALMACEN'] },
    { name: 'Presupuestos', href: '/presupuestos', icon: Wallet, roles: ['ADMIN'] },
    { name: 'Empleados', href: '/empleados', icon: Users, roles: ['ADMIN'] },
    { name: 'Auditoría', href: '/auditoria', icon: ScrollText, roles: ['ADMIN'] },
    { name: 'Configuración', href: '/configuracion', icon: Settings, roles: ['ADMIN'] },
  ];

  const navItems = userRole
    ? allNavItems.filter(item => item.roles.includes(userRole))
    : [];

  return (
    <>
      <div
        className={`fixed inset-0 bg-midnight-ink/20 backdrop-blur-sm z-20 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-surface-white border-r border-ash-cloud/40 text-foreground transform transition-transform duration-300 md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col h-full`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-ash-cloud/40">
          <div className="flex items-center">
            <span className="text-2xl font-bold tracking-[0.12em] text-midnight-ink uppercase">Warefy</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-stone-whisper hover:text-midnight-ink transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 rounded-sm ${
                  isActive
                    ? 'bg-oceanic-deep text-white'
                    : 'text-slate-grille hover:bg-canvas hover:text-midnight-ink'
                }`}
                onClick={() => setIsOpen(false)}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 1.75} />
                <span className="tracking-[0.01em]">{item.name}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-spring-leaf" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ash-cloud/40 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-spring-leaf animate-pulse" />
          <span className="text-[10px] text-stone-whisper font-medium tracking-[0.08em] uppercase">Sistema activo v1.0</span>
        </div>
      </aside>
    </>
  );
}
