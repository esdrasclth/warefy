'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Loader2, ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import Image from 'next/image';

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const landingRouteForSession = async (userId: string): Promise<string> => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    return data?.role === 'USER' || data?.role === 'APROBADOR' ? '/requisar' : '/dashboard';
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) router.replace(await landingRouteForSession(session.user.id));
    });
  }, []);

  const getErrorMessage = () => {
    if (errorParam === 'no_profile') return 'Tu cuenta no tiene permisos asignados. Contacta al administrador.';
    if (errorParam === 'invalid_role') return 'Tu rol no es válido. Contacta al administrador.';
    if (errorParam === 'auth_error') return 'Error de autenticación. Intenta de nuevo o contacta a soporte.';
    return errorMsg;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Error al iniciar sesión. Verifica tus credenciales.');
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (sessionError) throw sessionError;

      router.replace(await landingRouteForSession(result.user_id));
    } catch (error: any) {
      setErrorMsg(error.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Panel izquierdo — marca ── */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-16 overflow-hidden"
        style={{ background: '#00262b' }}
      >
        {/* Background image */}
        <Image
          src="/login-bg.webp"
          alt=""
          fill
          className="object-cover opacity-60"
          priority
          quality={75}
        />
        {/* Overlay oscuro para mantener legibilidad */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,38,43,0.55) 0%, rgba(11,54,59,0.45) 100%)' }} />

        {/* Logo */}
        <div className="relative z-10">
          <Image
            src="/logowarefypage.png"
            alt="Warefy"
            width={160}
            height={48}
            className="object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
            priority
          />
        </div>

        {/* Tagline */}
        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-[12px] font-medium tracking-wide"
            style={{ background: 'rgba(171,255,174,0.1)', border: '1px solid rgba(171,255,174,0.2)', color: '#abffae' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#abffae', display: 'inline-block' }} />
            Sistema de Gestión de Almacén — WMS
          </div>
          <h2 className="text-4xl font-semibold text-white leading-tight tracking-tight mb-4">
            Control total de tu<br />
            <span style={{ color: '#abffae' }}>almacén en tiempo real</span>
          </h2>
          <p style={{ color: '#a1c2c6', fontSize: 15, lineHeight: 1.7 }}>
            Inventario, requisiciones, compras y presupuestos<br />
            en una sola plataforma.
          </p>

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-6 mt-10 pt-10" style={{ borderTop: '1px solid rgba(171,255,174,0.1)' }}>
            {[
              { value: '100%', label: 'Control en tiempo real' },
              { value: 'Multi-rol', label: 'Admin · Almacén · User' },
              { value: 'Auditoría', label: 'Trazabilidad completa' },
            ].map((s) => (
              <div key={s.value}>
                <p style={{ color: '#abffae', fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{s.value}</p>
                <p style={{ color: '#4f6466', fontSize: 12 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Panel derecho — formulario ── */}
      <div className="flex w-full lg:w-1/2 flex-col relative bg-white">

        {/* Región del formulario (centrada en el espacio restante) */}
        <div className="flex flex-1 flex-col items-center justify-center p-8 sm:p-12">

        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="mb-8 text-center flex flex-col items-center">
            <Image
              src="/logowarefypage.png"
              alt="Warefy"
              width={150}
              height={46}
              className="object-contain mb-5"
              style={{ filter: 'brightness(0)' }}
              priority
            />
            <h1 className="text-[20px] font-bold uppercase tracking-tight mb-1" style={{ color: '#00262b' }}>
              Bienvenido de vuelta
            </h1>
            <p style={{ color: '#4f6466', fontSize: 14 }}>
              Inicia sesión para acceder a tu panel.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">

            {/* Error */}
            {getErrorMessage() && (
              <div
                className="p-3.5 text-sm flex items-start gap-3 rounded-lg"
                style={{ background: '#feefe8', border: '1px solid rgba(139,57,17,0.2)', color: '#8b3911' }}
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{getErrorMessage()}</span>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label style={{ fontSize: 12, fontWeight: 600, color: '#354d51', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@warefy.com"
                  style={{
                    width: '100%', height: 44, paddingLeft: 44, paddingRight: 16,
                    background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8,
                    fontSize: 14, color: '#00262b', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#00262b';
                    e.target.style.boxShadow = '0 0 0 3px rgba(0,38,43,0.08)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <Mail size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#a1c2c6' }} />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label style={{ fontSize: 12, fontWeight: 600, color: '#354d51', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Contraseña
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%', height: 44, paddingLeft: 44, paddingRight: 16,
                    background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8,
                    fontSize: 14, color: '#00262b', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#00262b';
                    e.target.style.boxShadow = '0 0 0 3px rgba(0,38,43,0.08)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <Lock size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#a1c2c6' }} />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="group flex items-center justify-center gap-2 w-full transition-colors"
              style={{
                height: 44, borderRadius: 8, marginTop: 8,
                background: isLoading ? '#354d51' : '#00262b',
                color: 'white', fontWeight: 500, fontSize: 14,
                cursor: isLoading ? 'not-allowed' : 'pointer', border: 'none',
                opacity: isLoading ? 0.8 : 1,
              }}
              onMouseEnter={(e) => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#0b363b'; }}
              onMouseLeave={(e) => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00262b'; }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al sistema</span>
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center" style={{ fontSize: 12, color: '#a1c2c6' }}>
            ¿Problemas para acceder? Contacta a tu administrador.
          </p>
        </div>
        </div>

        {/* Hero mobile — imagen con filtro verde (solo en pantallas pequeñas) */}
        <div className="lg:hidden relative min-h-[38vh] shrink-0 overflow-hidden" style={{ background: '#00262b' }}>
          <Image
            src="/login-bg.webp"
            alt=""
            fill
            className="object-cover opacity-60"
            priority
            quality={75}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,38,43,0.55) 0%, rgba(11,54,59,0.45) 100%)' }} />
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center gap-6 p-8">
            <div className="flex flex-col items-center">
              <div
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full mb-3 text-[11px] font-medium tracking-wide"
                style={{ background: 'rgba(171,255,174,0.1)', border: '1px solid rgba(171,255,174,0.2)', color: '#abffae' }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#abffae', display: 'inline-block' }} />
                Sistema de Gestión de Almacén — WMS
              </div>
              <h2 className="text-2xl font-semibold text-white leading-tight tracking-tight">
                Control total de tu<br />
                <span style={{ color: '#abffae' }}>almacén en tiempo real</span>
              </h2>
            </div>
          </div>
        </div>

        {/* Footer del panel */}
        <div className="absolute bottom-6 left-0 right-0 text-center" style={{ fontSize: 11, color: '#d1d5db' }}>
          © 2026 Warefy · Desarrollada por{' '}
          <a href="http://brandsofts.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#a1c2c6' }}>
            BrandSofts
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#00262b' }} />}>
      <LoginPageContent />
    </Suspense>
  );
}
