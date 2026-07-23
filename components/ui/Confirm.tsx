'use client';
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type ConfirmVariant = 'danger' | 'default';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface DialogState extends ConfirmOptions {
  open: boolean;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>({ open: false, message: '' });
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    setDialog({ open: true, ...opts });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog((prev) => ({ ...prev, open: false }));
  }, []);

  const isDanger = dialog.variant !== 'default';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog.open && (
        <div
          className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => close(false)}
        >
          <div
            className="bg-white w-full max-w-sm shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-start gap-4 bg-gray-50">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 shrink-0 ${
                    isDanger ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                  }`}
                >
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary uppercase tracking-widest">
                    {dialog.title || (isDanger ? 'Confirmar acción' : 'Confirmación')}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => close(false)}
                className="text-gray-400 hover:text-primary transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{dialog.message}</p>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => close(true)}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors ${
                  isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {dialog.confirmText || 'Confirmar'}
              </button>
              <button
                onClick={() => close(false)}
                className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors"
              >
                {dialog.cancelText || 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
