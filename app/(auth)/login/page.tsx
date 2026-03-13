'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Loader2, ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  // Mensaje de error personalizado según query param
  const getErrorMessage = () => {
    if (errorParam === 'no_profile') {
      return 'Tu cuenta no tiene permisos asignados. Contacta al administrador.';
    }
    if (errorParam === 'invalid_role') {
      return 'Tu rol no es válido. Contacta al administrador.';
    }
    if (errorParam === 'auth_error') {
      return 'Error de autenticación. Intenta de nuevo o contacta a soporte.';
    }
    return errorMsg;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Successfully logged in
      router.replace('/dashboard');
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-primary">
      {/* Left Axis: Abstract Premium Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary-dark">
        <Image
          src="/login-bg.jpg"
          alt="Warehouse Abstract Concept"
          fill
          unoptimized
          className="object-cover opacity-80 mix-blend-screen animate-in fade-in duration-1000"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-dark/80 to-transparent" />

        <div className="absolute bottom-16 left-16 z-10 max-w-lg">
          <h2 className="text-4xl md:text-5xl font-bold tracking-widest uppercase text-white leading-tight">
            Gestión Inteligente de <span className="text-yellow-400">Almacenes.</span>
          </h2>
          <p className="mt-4 text-white font-medium tracking-wide text-lg">
            Control preciso, análisis dinámico y trazabilidad absoluta en cada requisa.
          </p>
        </div>
      </div>

      {/* Right Axis: Login Form */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center p-8 sm:p-12 md:p-16 lg:p-24 bg-white relative">
        <div className="absolute top-8 right-8 text-xs font-bold tracking-widest uppercase text-gray-400">
          ERP System v1.0
        </div>

        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Brand Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-widest uppercase text-primary mb-2">
              Warefy
            </h1>
            <p className="text-gray-500 font-medium">
              Panel Administrativo de Control. Inicia sesión para continuar.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">

            {/* Error Banner */}
            {(getErrorMessage()) && (
              <div className="p-4 bg-red-50 text-red-600 border border-red-200 text-sm flex items-start gap-3 animate-in fade-in zoom-in-95 duration-300">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{getErrorMessage()}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold tracking-wider uppercase text-gray-500">Correo Electrónico</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-gray-50 border border-gray-200 text-primary placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all rounded-none"
                  placeholder="admin@warefy.com"
                />
                <Mail className="absolute left-4 top-3.5 text-gray-400" size={20} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold tracking-wider uppercase text-gray-500">Contraseña</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-gray-50 border border-gray-200 text-primary placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all rounded-none"
                  placeholder="••••••••"
                />
                <Lock className="absolute left-4 top-3.5 text-gray-400" size={20} />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary text-white font-medium hover:bg-primary-dark transition-colors disabled:opacity-70 disabled:cursor-not-allowed group flex items-center justify-center gap-2 mt-8 rounded-none"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

          </form>

          <p className="mt-8 text-center text-xs text-gray-400">
            En caso de pérdida de accesos, contacte al soporte técnico.
          </p>
        </div>
      </div>
    </div>
  );
}
