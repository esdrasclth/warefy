import { Menu, UserCircle } from 'lucide-react';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
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
      
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end hidden sm:flex">
          <span className="text-sm font-semibold text-primary">Admin User</span>
          <span className="text-xs text-gray-400 font-medium">Almacén Central</span>
        </div>
        <button className="text-primary hover:text-accent transition-colors">
          <UserCircle size={36} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
