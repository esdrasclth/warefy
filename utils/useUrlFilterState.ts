'use client';
import { useCallback, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Mantiene un filtro sincronizado con la query string de la URL.
// Se conserva estado local para que los inputs sean responsivos (sin saltos de
// cursor) y la URL se actualiza vía router.replace (sin ensuciar el historial).
// La sincronización lee window.location en vivo para no pisar otros parámetros
// cuando varios cambian en el mismo ciclo.
export function useUrlFilterState(
  key: string,
  defaultValue: string,
  options: { debounceMs?: number } = {}
) {
  const { debounceMs = 0 } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [value, setValueState] = useState<string>(
    () => searchParams.get(key) ?? defaultValue
  );

  const syncUrl = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      if (!next || next === defaultValue) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, key, defaultValue]
  );

  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      if (debounceMs > 0) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => syncUrl(next), debounceMs);
      } else {
        syncUrl(next);
      }
    },
    [debounceMs, syncUrl]
  );

  return [value, setValue] as const;
}
