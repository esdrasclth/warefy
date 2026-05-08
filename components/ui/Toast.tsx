'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />,
  error:   <XCircle     size={16} className="text-red-500   shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />,
  info:    <Info        size={16} className="text-blue-500  shrink-0 mt-0.5" />,
};

const STYLES: Record<ToastType, string> = {
  success: 'border-green-200  bg-green-50  text-green-900',
  error:   'border-red-200    bg-red-50    text-red-900',
  warning: 'border-orange-200 bg-orange-50 text-orange-900',
  info:    'border-blue-200   bg-blue-50   text-blue-900',
};

const TTL: Record<ToastType, number> = {
  success: 4000,
  info:    4000,
  warning: 6000,
  error:   6000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) =>
    setToasts(prev => prev.filter(t => t.id !== id)), []);

  const add = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => dismiss(id), TTL[type]);
  }, [dismiss]);

  const ctx: ToastCtx = {
    success: (msg) => add('success', msg),
    error:   (msg) => add('error',   msg),
    warning: (msg) => add('warning', msg),
    info:    (msg) => add('info',    msg),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 w-80 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 border shadow-lg animate-in slide-in-from-right-4 duration-200 ${STYLES[t.type]}`}
          >
            {ICONS[t.type]}
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
