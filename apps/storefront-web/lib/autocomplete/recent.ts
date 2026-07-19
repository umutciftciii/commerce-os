/**
 * TODO-156E — Son aramalar (empty-query deneyimi) SAF yardımcıları. Bu fazda YALNIZ istemci-yerel
 * (localStorage) altyapı; sunucu persistence / popular-search analytics KAPSAM DIŞI (bkz. Çalışma Sınırı).
 *
 * Storage arayüzü enjekte edilebilir (test + SSR güvenliği: sunucuda window yoktur → çağıran korur).
 * Değerler tekilleştirilir (normalize), en yeni başta, bounded. Bozuk/parse-edilemez içerik güvenle yok sayılır.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const RECENT_SEARCHES_KEY = "commerce_os_recent_searches";
const DEFAULT_LIMIT = 5;

function normalizeKey(term: string): string {
  return term.trim().replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

/** Kayıtlı son aramaları döner (en yeni başta, bounded). Bozuk içerik → boş. */
export function readRecent(storage: StorageLike, limit = DEFAULT_LIMIT): string[] {
  try {
    const raw = storage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = normalizeKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Yeni bir aramayı başa ekler (tekilleştirir, bounded) ve güncel listeyi döner. Boş term → değişmez. */
export function addRecent(storage: StorageLike, term: string, limit = DEFAULT_LIMIT): string[] {
  const trimmed = term.trim();
  if (!trimmed) return readRecent(storage, limit);
  const existing = readRecent(storage, limit * 2);
  const key = normalizeKey(trimmed);
  const next = [trimmed, ...existing.filter((t) => normalizeKey(t) !== key)].slice(0, limit);
  try {
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Storage dolu/erişilemez → sessizce geç (özellik best-effort).
  }
  return next;
}

/** Tüm son aramaları temizler. */
export function clearRecent(storage: StorageLike): void {
  try {
    storage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // no-op
  }
}
