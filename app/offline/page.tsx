import Image from 'next/image';
import { WifiOff } from 'lucide-react';

export const metadata = {
  title: 'Sin conexión | Warefy',
};

export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 bg-midnight-ink px-6 text-center text-white">
      <Image
        src="/logowarefy.png"
        alt="Warefy"
        width={160}
        height={48}
        className="object-contain opacity-90"
      />
      <WifiOff size={40} className="text-spring-leaf" />
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-wide">Sin conexión</h1>
        <p className="max-w-xs text-sm text-ash-cloud">
          No hay conexión a internet. Revisa tu red e inténtalo de nuevo.
        </p>
      </div>
      <a
        href="/dashboard"
        className="rounded-sm bg-spring-leaf px-5 py-2.5 text-sm font-semibold text-midnight-ink"
      >
        Reintentar
      </a>
    </div>
  );
}
