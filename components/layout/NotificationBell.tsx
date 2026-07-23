'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Package, ClipboardList, ShoppingCart, Info, CheckCircle2, XCircle, Truck, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase/client';
import type { UserProfile } from '@/types';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  created_at: string;
  read: boolean;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  low_stock:             <Package size={14} className="text-orange-500 shrink-0" />,
  pending_approval:      <ClipboardList size={14} className="text-blue-500 shrink-0" />,
  oc_received:           <ShoppingCart size={14} className="text-green-600 shrink-0" />,
  requisition_approved:  <CheckCircle2 size={14} className="text-green-600 shrink-0" />,
  requisition_delivered: <Truck size={14} className="text-teal-600 shrink-0" />,
  requisition_cancelled: <XCircle size={14} className="text-red-500 shrink-0" />,
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
  const userId = userProfile?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    // RLS ya limita a lo dirigido a este usuario o su rol.
    const { data: notis } = await supabase
      .from('notifications')
      .select('id, type, title, message, link, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!notis) return;
    const ids = notis.map(n => n.id);
    if (ids.length === 0) { setNotifications([]); return; }

    // Estado por usuario: leído / descartado.
    const { data: states } = await supabase
      .from('notification_states')
      .select('notification_id, read_at, dismissed_at')
      .eq('user_id', userId)
      .in('notification_id', ids);

    const stateMap = new Map((states ?? []).map(s => [s.notification_id, s]));

    const visible = notis
      .filter(n => !stateMap.get(n.id)?.dismissed_at)
      .map(n => ({ ...n, read: !!stateMap.get(n.id)?.read_at }));

    setNotifications(visible as Notification[]);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();

    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchNotifications]);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const unread = notifications.filter(n => !n.read);

  const upsertStates = (rows: Record<string, unknown>[]) =>
    supabase.from('notification_states').upsert(rows, { onConflict: 'notification_id,user_id' });

  const markAllRead = async () => {
    if (!userId || unread.length === 0) return;
    const now = new Date().toISOString();
    const rows = unread.map(n => ({ notification_id: n.id, user_id: userId, read_at: now }));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await upsertStates(rows);
  };

  const dismissOne = async (id: string) => {
    if (!userId) return;
    setNotifications(prev => prev.filter(n => n.id !== id));
    await upsertStates([{ notification_id: id, user_id: userId, dismissed_at: new Date().toISOString() }]);
  };

  const dismissAll = async () => {
    if (!userId || notifications.length === 0) return;
    const now = new Date().toISOString();
    const rows = notifications.map(n => ({ notification_id: n.id, user_id: userId, dismissed_at: now }));
    setNotifications([]);
    await upsertStates(rows);
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
            <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">
              Notificaciones{unread.length > 0 && <span className="ml-1.5 text-red-500">({unread.length})</span>}
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={dismissAll}
                className="flex items-center gap-1 text-[9px] text-gray-400 hover:text-red-500 uppercase tracking-widest font-bold transition-colors"
                title="Descartar todas"
              >
                <CheckCheck size={12} /> Limpiar
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
                  <div key={n.id} className={`group relative px-4 py-3 transition-colors ${n.read ? '' : 'bg-blue-50/40'}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">{TYPE_ICON[n.type] ?? <Info size={14} className="text-gray-400 shrink-0" />}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-primary leading-snug pr-5">{n.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-gray-300 font-mono">{timeAgo(n.created_at)}</span>
                          {n.link && (
                            <Link
                              href={n.link}
                              onClick={() => { dismissOne(n.id); setIsOpen(false); }}
                              className="text-[9px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors"
                            >
                              Ver →
                            </Link>
                          )}
                        </div>
                      </div>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1" />
                      )}
                    </div>
                    <button
                      onClick={() => dismissOne(n.id)}
                      className="absolute top-2 right-2 p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Descartar"
                    >
                      <X size={13} />
                    </button>
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
