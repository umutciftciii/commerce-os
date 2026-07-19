/**
 * TODO-156E — İSTEMCİ tarafı hafif autocomplete cache (SAF; TTL + bounded LRU-benzeri).
 *
 * Kullanıcı yazıp silerken aynı öneki tekrar sorar; bu cache ağ isteğini tekrar etmez (istek yağmuru +
 * gecikme azalır). Process/tab-yerel; kısa TTL. Saat enjekte edilebilir (test). Gateway'in kendi cache'i
 * (autocomplete-cache.ts) ile katmanlıdır — ikisi de küçük TTL, tutarsızlık penceresi ihmal edilebilir.
 */

export interface ClientCache<T> {
  get(key: string, now?: number): T | undefined;
  set(key: string, value: T, now?: number): void;
  size(): number;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export function createClientCache<T>(ttlMs = 30_000, maxEntries = 50): ClientCache<T> {
  const ttl = ttlMs > 0 ? ttlMs : 30_000;
  const max = maxEntries > 0 ? Math.floor(maxEntries) : 50;
  const store = new Map<string, Entry<T>>();
  const clock = (now?: number) => (typeof now === "number" ? now : Date.now());

  return {
    get(key, now) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= clock(now)) {
        store.delete(key);
        return undefined;
      }
      store.delete(key);
      store.set(key, entry); // LRU dokunuşu
      return entry.value;
    },
    set(key, value, now) {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, expiresAt: clock(now) + ttl });
      while (store.size > max) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    size() {
      return store.size;
    },
  };
}
