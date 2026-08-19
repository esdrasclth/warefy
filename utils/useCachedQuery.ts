'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dedupe, readCache } from '@/utils/queryCache';

interface Options {
  /**
   * Cuánto puede tener el dato cacheado para saltarse la revalidación de fondo.
   * 0 (por defecto) = revalidar siempre; el cache solo evita el skeleton.
   * Subirlo solo tiene sentido para datos de referencia que casi no cambian
   * (categorías, unidades, áreas).
   */
  staleTimeMs?: number;
  /** Si es false no se consulta nada (p. ej. faltan parámetros todavía). */
  enabled?: boolean;
}

interface Result<T> {
  data: T | undefined;
  error: Error | undefined;
  /** true solo cuando no hay NADA que mostrar: primera carga sin cache. */
  isLoading: boolean;
  /** true mientras se revalida de fondo teniendo datos en pantalla. */
  isValidating: boolean;
  /** Vuelve a consultar ignorando el cache y lo actualiza. */
  refresh: () => Promise<void>;
}

interface State<T> {
  data: T | undefined;
  error: Error | undefined;
  /** La consulta ya terminó al menos una vez (con éxito o con error). */
  settled: boolean;
}

/**
 * Consulta con cache stale-while-revalidate.
 *
 * `key` identifica la consulta y debe incluir TODOS sus parámetros (página,
 * búsqueda, filtros): si dos consultas distintas comparten clave se pisan los
 * datos entre sí. Un `key` null desactiva la consulta.
 *
 * El `fetcher` se guarda en una ref y no dispara re-consultas al cambiar de
 * identidad: la única dependencia real es `key`. Así las páginas pueden
 * definirlo inline sin memoizarlo.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: Options = {}
): Result<T> {
  const { staleTimeMs = 0, enabled = true } = options;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState<State<T>>(() => {
    const hit = key ? readCache<T>(key) : undefined;
    return { data: hit?.data, error: undefined, settled: hit !== undefined };
  });

  // Evita setState sobre una clave que ya cambió: una respuesta lenta de la
  // consulta anterior no debe pisar los datos de la nueva.
  const activeKey = useRef(key);
  activeKey.current = key;

  const [isValidating, setIsValidating] = useState(false);

  const run = useCallback(async (force: boolean) => {
    if (!key || !enabled) return;

    const hit = readCache<T>(key);
    if (hit) {
      setState({ data: hit.data, error: undefined, settled: true });
      // Dato reciente: se muestra y no se vuelve a pedir.
      if (!force && hit.age <= staleTimeMs) return;
    }

    setIsValidating(true);
    try {
      const result = await dedupe(key, () => fetcherRef.current());
      if (activeKey.current !== key) return;
      setState({ data: result, error: undefined, settled: true });
    } catch (e) {
      if (activeKey.current !== key) return;
      // `settled` pasa a true aunque haya error: si no, una consulta fallida
      // sin cache dejaría la pantalla en skeleton para siempre.
      setState(prev => ({
        data: prev.data,
        error: e instanceof Error ? e : new Error(String(e)),
        settled: true,
      }));
    } finally {
      if (activeKey.current === key) setIsValidating(false);
    }
  }, [key, enabled, staleTimeMs]);

  useEffect(() => {
    // Al cambiar de clave se muestra de inmediato lo que haya cacheado para la
    // nueva, o el skeleton si es la primera vez que se pide.
    const hit = key ? readCache<T>(key) : undefined;
    setState({ data: hit?.data, error: undefined, settled: hit !== undefined });
    run(false);
  }, [key, run]);

  const refresh = useCallback(() => run(true), [run]);

  return {
    data: state.data,
    error: state.error,
    isLoading: !state.settled && enabled && key !== null,
    isValidating,
    refresh,
  };
}
