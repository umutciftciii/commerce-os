/**
 * TODO-156D (ADR-080) — Vitrin MUTLAK URL otoritesi (TEK NOKTA).
 *
 * Canonical, OpenGraph, JSON-LD ve sitemap MUTLAK URL ister (Google canonical'ı absolute bekler). Bu modül
 * site taban origin'ini TEK yerden çözer ve göreli path → mutlak URL üretir. Next `metadataBase` + tüm SEO
 * builder'ları buradan beslenir → base origin çoğaltılmaz (brief §8/§11/§14 "canonical authority tek yerde").
 *
 * Sunucu-yalnız env `STOREFRONT_SITE_URL` (TD-036/TD-038 deseni: boş/whitespace → yok sayılır, varsayılana
 * düşer). NEXT_PUBLIC_ değildir; yalnız RSC/route/metadata bağlamında okunur. Prod'da gerçek origin'e set edilir.
 */
import { optionalEnvString } from "@commerce-os/utils";

const FALLBACK_ORIGIN = "http://localhost:3000";

/** Ham `STOREFRONT_SITE_URL`'i normalize eder: geçerli http(s) origin → sondaki "/" kırpılmış; aksi fallback. */
function resolveOrigin(): string {
  const raw = optionalEnvString(process.env.STOREFRONT_SITE_URL);
  if (!raw) return FALLBACK_ORIGIN;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return FALLBACK_ORIGIN;
    // Yalnız origin (path/query/hash düşer); sondaki "/" yok.
    return url.origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

/** Site taban origin'i (ör. "https://magaza.example"). Sondaki "/" YOK. */
export function siteOrigin(): string {
  return resolveOrigin();
}

/** Next `metadataBase` için URL nesnesi. layout.tsx generateMetadata'da kullanılır. */
export function metadataBase(): URL {
  return new URL(`${siteOrigin()}/`);
}

/**
 * Göreli path'i mutlak URL'e çevirir (canonical/OG/JSON-LD/sitemap). Zaten mutlaksa aynen döner. Path
 * daima tek "/" ile birleşir (çift slash yok). Query string korunur.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = siteOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}
