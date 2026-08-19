import type { PostgrestError } from '@supabase/supabase-js';

/**
 * PostgREST corta cada respuesta en 1000 filas (`max-rows`). Una consulta sin
 * `.range()` no falla: devuelve las primeras 1000 y descarta el resto en
 * silencio, lo que produce tablas incompletas y exportaciones truncadas.
 */
export const SUPABASE_MAX_ROWS = 1000;

/** Tope de seguridad para no agotar la memoria del navegador con un dataset enorme. */
export const FETCH_ALL_MAX_ROWS = 100000;

interface RangeQueryResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

interface FetchAllOptions {
  batchSize?: number;
  maxRows?: number;
}

interface FetchAllResult<T> {
  rows: T[];
  error: PostgrestError | null;
  /** true si se alcanzó `maxRows` y quedaron filas sin traer. */
  truncated: boolean;
}

/**
 * Trae todas las filas de una consulta en lotes, saltando el límite de
 * `max-rows` de PostgREST.
 *
 * `buildQuery` debe construir una consulta NUEVA en cada llamada (el query
 * builder de supabase-js es mutable y no es seguro reutilizarlo) y debe incluir
 * un orden TOTAL —es decir, terminado en una columna única como `id`— porque de
 * lo contrario Postgres puede devolver filas repetidas u omitidas entre lotes.
 *
 * @example
 * const { rows, error } = await fetchAllRows((from, to) =>
 *   supabase.from('purchases').select('*')
 *     .order('created_at', { ascending: false })
 *     .order('id', { ascending: true })
 *     .range(from, to)
 * );
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<RangeQueryResult<T>>,
  options: FetchAllOptions = {}
): Promise<FetchAllResult<T>> {
  const batchSize = options.batchSize ?? SUPABASE_MAX_ROWS;
  const maxRows = options.maxRows ?? FETCH_ALL_MAX_ROWS;
  const rows: T[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await buildQuery(offset, offset + batchSize - 1);

    if (error) return { rows, error, truncated: false };
    if (!data || data.length === 0) break;

    rows.push(...data);

    // Un lote incompleto significa que ya no hay más filas.
    if (data.length < batchSize) break;
    if (rows.length >= maxRows) return { rows, error: null, truncated: true };

    offset += batchSize;
  }

  return { rows, error: null, truncated: false };
}
