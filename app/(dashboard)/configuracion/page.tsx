'use client';
import { useState, useEffect } from 'react';
import { Save, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

export default function ConfiguracionPage() {
  const [exchangeRate, setExchangeRate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .eq('id', 1)
        .single();
        
      if (data) {
        setExchangeRate(data.exchange_rate_usd_hnl.toString());
      }
      if (error && error.code !== 'PGRST116') { // PGRST116 means zero rows returned
         console.error('Error fetching global settings:', error);
      }
      setIsLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!exchangeRate || isNaN(Number(exchangeRate))) {
      setMessage({ type: 'error', text: 'Debe ingresar una tasa de cambio válida.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('global_settings')
      .upsert({ id: 1, exchange_rate_usd_hnl: Number(exchangeRate) }, { onConflict: 'id' });

    setIsSaving(false);

    if (error) {
      setMessage({ type: 'error', text: 'Error guardando la configuración: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Tasa de cambio actualizada existosamente.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-light text-primary tracking-tight">Configuración del Sistema</h1>
        <p className="text-gray-500 mt-2 text-sm">Administración centralizada de variables globales y entorno del ERP.</p>
      </div>

      <div className="bg-white border border-gray-100 p-8 shadow-sm">
        <h2 className="text-sm font-bold text-primary uppercase tracking-widest border-b border-gray-100 pb-4 mb-6">Finanzas y Monedas</h2>
        
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tasa de Cambio Base</label>
                <div className="text-xs text-gray-400 mb-2">Utilizada globalmente para convertir Lempiras (HNL) a Dólares (USD).</div>
                
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    L.<span className="mx-1 text-gray-200">|</span> 1.00 $ = 
                  </div>
                   <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full pl-[85px] pr-4 py-3 bg-gray-50 border border-gray-200 text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-colors"
                    placeholder="25.00"
                  />
                </div>
              </div>
              
              <div className="flex flex-col justify-end">
                <div className="bg-primary-dark/5 p-4 border border-primary-dark/10 rounded flex items-start gap-4">
                  <div className="p-2 bg-primary text-white rounded shrink-0">
                    <DollarSign size={20} />
                  </div>
                   <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Conversión Activa</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      El sistema multiplicará automáticamente o dividirá las cantidades ingresadas por los usuarios basándose en este factor `(Ej: Lps. 500 / {exchangeRate || '25.00'})`.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-primary text-white font-medium px-8 py-3 hover:bg-primary-dark transition-colors disabled:opacity-70 flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Guardar Cambios
              </button>

              {message && (
                <span className={`text-sm font-medium animate-in fade-in slide-in-from-left-2 ${message.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                  {message.text}
                </span>
              )}
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
