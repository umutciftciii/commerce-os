/**
 * TODO-156E (ADR-084) — Faz 2C-8E · Autocomplete için HAFİF in-memory TTL cache (Redis GEREKMEZ).
 *
 * Autocomplete istekleri kısa süre içinde AYNI önekle tekrar gelir (kullanıcı yazarken/silerken). Bu cache
 * process-yerel, bounded (maxEntries) ve TTL'li bir Map'tir; get anında süresi geçmişi eler. LRU-benzeri:
 * her okuma anahtarı en sona taşır → sık kullanılan sıcak kalır, taşma anında EN ESKİ atılır. Çok-instance'lı
 * dağıtımda paylaşılmaz (kabul; sonuç deterministik + kısa TTL → tutarsızlık penceresi ihmal edilebilir).
 * Değerler zaten allowlist'ten (publicAutocompleteResponseSchema) geçmiş immutable snapshot'lardır.
 */

import type { PublicAutocompleteResponse } from "@commerce-os/contracts";

export interface AutocompleteCache {
  get(key: string, now: number): PublicAutocompleteResponse | undefined;
  set(key: string, value: PublicAutocompleteResponse, now: number): void;
  size(): number;
}

export interface AutocompleteCacheOptions {
  /** Girdi ömrü (ms). Varsayılan 30s — katalog anlık değil, kısa TTL yeter. */
  ttlMs?: number;
  /** Bounded girdi sayısı (bellek guard'ı). Varsayılan 500. */
  maxEntries?: number;
}

interface Entry {
  value: PublicAutocompleteResponse;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 500;

export function createAutocompleteCache(options: AutocompleteCacheOptions = {}): AutocompleteCache {
  const ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
  const maxEntries =
    options.maxEntries && options.maxEntries > 0 ? Math.floor(options.maxEntries) : DEFAULT_MAX_ENTRIES;
  const store = new Map<string, Entry>();

  return {
    get(key, now) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now) {
        store.delete(key);
        return undefined;
      }
      // LRU dokunuşu: en sona taşı (Map insertion-order → ilk anahtar en eski).
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value, now) {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, expiresAt: now + ttlMs });
      // Taşma → EN ESKİ (ilk) anahtarı at.
      while (store.size > maxEntries) {
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
