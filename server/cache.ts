interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs = 60_000): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheInvalidateAll(): void {
  store.clear();
}

/**
 * Estrategia de invalidación de caché:
 * - Invalidación completa (`cacheInvalidatePrefix` / `cacheInvalidateAll`): Utilizada en cargas masivas,
 *   importación de archivos de cobranza/cartolas, o sincronizaciones batch que alteran múltiples registros.
 * - Patch quirúrgico (`cachePatchArrayItem`): Utilizado en mutaciones puntuales fila a fila (UI)
 *   para actualizar un registro puntual en memoria sin obligar a recalcular todo en frío (~5s).
 */

/**
 * Actualiza quirúrgicamente un elemento dentro de un array cacheado sin borrar el resto del caché.
 * Si la clave no existe o ya expiró, no hace nada (el próximo GET frío lo calculará normalmente).
 * Si la entrada existe, actualiza el elemento que cumpla con el predicado y renueva el TTL (por defecto 300_000 ms / 5 min).
 *
 * @returns true si la entrada existía y fue actualizada, false si no existía o había expirado.
 */
export function cachePatchArrayItem<T>(
  key: string,
  predicate: (item: T) => boolean,
  updater: (item: T) => T,
  ttlMs = 300_000
): boolean {
  const entry = store.get(key) as CacheEntry<T[]> | undefined;
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  if (!Array.isArray(entry.value)) return false;

  let patched = false;
  const newValue = entry.value.map((item) => {
    if (predicate(item)) {
      patched = true;
      return updater(item);
    }
    return item;
  });

  if (patched) {
    store.set(key, { value: newValue, expiresAt: Date.now() + ttlMs });
  }

  return patched;
}

