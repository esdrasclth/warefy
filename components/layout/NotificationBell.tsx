'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, X, Package, ClipboardList, ShoppingCart, Info } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase/client';
import type { UserProfile } from '@/types';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  low_stock:        <Package size={14} className="text-orange-500 shrink-0" />,
  pending_approval: <ClipboardList size={14} className="text-blue-500 shrink-0" />,
  oc_received:      <ShoppingCart size={14} className="text-green-600 shrink-0" />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function NotificationBell({ userProfile }: { userProfile?: UserProfile }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);
    if (data) setNotifications(data as Notification[]);
  };

  useEffect(() => {
    if (!userProfile) return;
    fetchNotifications();

    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userProfile]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const unread = notifications.filter(n => !n.is_read);

  const markAllRead = async () => {
    if (unread.length === 0) return;
    const ids = unread.map(n => n.id);
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markOneRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) markAllRead();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-400 hover:text-primary transition-colors"
        title="Notificaciones"
      >
        <Bell size={20} strokeWidth={1.5} />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full px-0.5">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">Notificaciones</h3>
            {notifications.length > 0 && (
              <button
                onClick={() => { setNotifications([]); supabase.from('notifications').update({ is_read: true }).eq('is_read', false); }}
                className="text-[9px] text-gray-400 hover:text-gray-600 uppercase tracking-widest font-bold transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <Bell size={24} strokeWidth={1} />
                <p className="text-xs">Sin notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map(n => (
                  <div key={n.id} className={`px-4 py-3 transition-colors ${n.is_read ? '' : 'bg-blue-50/40'}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">{TYPE_ICON[n.type] ?? <Info size={14} className="text-gray-400 shrink-0" />}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-primary leading-snug">{n.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-gray-300 font-mono">{timeAgo(n.created_at)}</span>
                          {n.link && (
                            <Link
                              href={n.link}
                              onClick={() => { markOneRead(n.id); setIsOpen(false); }}
                              className="text-[9px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors"
                            >
                              Ver →
                            </Link>
                          )}
                        </div>
                      </div>
                      {!n.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
