/**
 * Cache en memoria con estrategia stale-while-revalidate.
 *
 * El objetivo es de percepción, no de ahorro de red: al volver a una pantalla
 * ya visitada se pinta al instante lo último que se vio, en lugar del skeleton,
 * mientras la consulta real corre de fondo y actualiza la vista al llegar.
 *
 * Por eso `staleTimeMs` es 0 por defecto: SIEMPRE se revalida. En un sistema de
 * inventario mostrar existencias viejas sin refrescarlas seria peor que esperar,
 * asi que el cache elimina el skeleton pero no reduce la frescura del dato.
 *
 * Vive solo en memoria a proposito: no se persiste en storage para que un
 * refresh completo o cerrar sesion no deje datos de inventario en el disco del
 * navegador.
 */

interface CacheEntry {
  data: unknown;
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

/** Consultas en vuelo, para que dos componentes con la misma clave compartan una sola request. */
const inFlight = new Map<string, Promise<unknown>>();

export interface CachedEntry<T> {
  data: T;
  /** Milisegundos transcurridos desde que se guardó. */
  age: number;
}

export function readCache<T>(key: string): CachedEntry<T> | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  return { data: entry.data as T, age: Date.now() - entry.storedAt };
}

export function writeCache(key: string, data: unknown): void {
  store.set(key, { data, storedAt: Date.now() });
}

/**
 * Deduplica consultas concurrentes con la misma clave.
 *
 * Sin esto, dos componentes que montan a la vez (o un refresh que coincide con
 * la carga inicial) dispararian la misma consulta dos veces.
 */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = run()
    .then(result => {
      writeCache(key, result);
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Lectura con cache para código que no usa el hook.
 *
 * Devuelve lo cacheado si es más nuevo que `staleTimeMs`; si no, consulta
 * (deduplicando) y guarda. Pensado para fetchers ya existentes que se quieren
 * acelerar sin reestructurar la pantalla completa.
 *
 * Ojo: a diferencia del hook, esto NO revalida de fondo. Quien mute datos debe
 * llamar a `invalidateCache` antes de volver a pedirlos.
 */
export async function cachedFetch<T>(
  key: string,
  staleTimeMs: number,
  run: () => Promise<T>
): Promise<T> {
  const hit = readCache<T>(key);
  if (hit && hit.age <= staleTimeMs) return hit.data;
  return dedupe(key, run);
}

/**
 * Invalida las entradas cuya clave empieza con alguno de los prefijos.
 *
 * Se usa despues de mutar: por ejemplo al guardar un producto se invalida
 * `productos` y `dashboard`, porque ambos dependen del inventario.
 */
export function invalidateCache(...prefixes: string[]): void {
  if (prefixes.length === 0) return;

  for (const key of [...store.keys()]) {
    if (prefixes.some(p => key.startsWith(p))) store.delete(key);
  }
}

/**
 * Vacia todo. Obligatorio al cerrar o cambiar de sesion: el cache puede tener
 * filas que el siguiente usuario no tiene permiso de ver.
 */
export function clearCache(): void {
  store.clear();
  inFlight.clear();
}
