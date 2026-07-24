/**
 * TODO-161 (ADR-118) — Sponsorlu attribution first-party cookie'si (sunucu-yalnız okuma).
 *
 * `commerce_os_sponsored`: kullanıcının TIKLADIĞI sponsorlu ürünlerin GATEWAY-imzalı token'larını
 * (opak) taşır (JSON dizi; bounded). Client tıklamada yazar (bkz. lib/sponsored/track.ts); checkout
 * server action'ında BURADAN okunup `sponsoredGrants` olarak gönderilir. İmza gateway'de doğrulanır +
 * ürün siparişte gerçekten var mı kontrol edilir → client-yazılabilir cookie GÜVENLİ (tamper → red).
 */
import { cookies } from "next/headers";

export const SPONSORED_COOKIE = "commerce_os_sponsored";
const MAX_TOKENS = 48;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Checkout server action'ında sponsorlu grant'leri okur (opak; kaba biçim guard'ı). */
export async function readSponsoredGrants(): Promise<string[]> {
  try {
    const store = await cookies();
    const raw = store.get(SPONSORED_COOKIE)?.value;
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const tokens: string[] = [];
    const seen = new Set<string>();
    for (const value of parsed) {
      if (typeof value !== "string") continue;
      if (value.length > 2048 || !TOKEN_PATTERN.test(value)) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      tokens.push(value);
      if (tokens.length >= MAX_TOKENS) break;
    }
    return tokens;
  } catch {
    return [];
  }
}
