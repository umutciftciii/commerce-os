/**
 * TODO-156D (ADR-082) — Redirect çözümleme MOTORU (SAF, çerçeve-bağımsız, TEK OTORİTE).
 *
 * Kaynak path → hedef path çözümü. Storefront istek-zamanı (Next middleware/route) + gelecekteki Admin
 * redirect servisi bu motoru PAYLAŞIR. Prisma/Next importu YOKTUR; kurallar dışarıdan (DB/cache) verilir.
 *
 * Enterprise garantiler (brief §5/§6):
 *  - Chain YOK: A→B→B→C zinciri çözülüp TEK sonuç (final hedef) döner; runtime'da çok-hop 301 zinciri oluşmaz.
 *  - Loop YOK: A→B→A döngüsü tespit edilir → redirect YOK (güvenli; orijinal path servis edilir / 404'e düşer).
 *  - Self-redirect (source===target) index'te elenir (anlamsız + loop tohumu).
 *  - Disabled kural yok sayılır.
 *  - Geçersiz/boş hedef kuralı elenir (missing target güvenli davranır).
 *  - Deterministik: aynı kural kümesi + aynı path → aynı sonuç. Precedence: aynı source için SON kural kazanır
 *    (çağıran taraf updatedAt ASC sıralar → en yeni override eder).
 *
 * Canonical uyumu: bu motor SADECE gerçek kaynak→hedef eşleşmesinde redirect döner. İndekslenebilir bir
 * kanonik path ASLA bir redirect source'u olmamalı (Admin servisi guard eder) → canonical ile redirect çelişmez.
 */

/** Kalıcı=301/308, geçici=302/307. Otomatik slug değişimi DAİMA 301 (çağıran taraf kararı). */
export type RedirectType = 301 | 302 | 307 | 308;

export const REDIRECT_TYPES: readonly RedirectType[] = [301, 302, 307, 308] as const;

export interface RedirectRule {
  source: string;
  target: string;
  type: RedirectType;
  enabled: boolean;
}

/**
 * DB `RedirectType` enum'u (Prisma) → HTTP status kodu. Gateway kaydı enum tutar; hem gateway public
 * projeksiyonu hem storefront çözümleyici bu TEK haritadan sayısal statüye çevirir (drift yok).
 */
export const REDIRECT_ENUM_TO_STATUS: Record<string, RedirectType> = {
  PERMANENT_301: 301,
  FOUND_302: 302,
  TEMPORARY_307: 307,
  PERMANENT_308: 308,
};

/** Enum string → HTTP status; bilinmeyen değer güvenli 301'e düşer (kalıcı, en yaygın). */
export function redirectEnumToStatus(value: string): RedirectType {
  return REDIRECT_ENUM_TO_STATUS[value] ?? 301;
}

export interface RedirectResolution {
  /** Nihai hedef (zincir sonu), normalize edilmiş path. */
  target: string;
  /** İlk eşleşen kuralın tipi (yanıt statüsü); zincir boyunca "kalıcılık" ilk kuraldan gelir. */
  type: RedirectType;
  /** Kaç kural üzerinden geçildi (gözlemlenebilirlik; runtime'da client TEK redirect görür). */
  hops: number;
}

/**
 * Path normalizasyonu (kural indexi + gelen istek AYNI fonksiyondan geçer → tutarlı eşleşme):
 *  - query/hash düşer (redirect kaynak eşleşmesi path bazlı; query koruması ayrı katman).
 *  - baş boşluk kırpılır, leading "/" garanti edilir.
 *  - sondaki "/" kaldırılır (kök "/" hariç) → "/a" ve "/a/" aynı kaynak.
 *  - case KORUNUR (slug'lar zaten lowercase; büyük/küçük duyarlı path'ler bozulmaz).
 * Geçersiz (boş) girdi → null.
 */
export function normalizeRedirectPath(path: string): string | null {
  if (typeof path !== "string") return null;
  let p = path.trim();
  if (p.length === 0) return null;
  // Query + hash düşür.
  const q = p.search(/[?#]/);
  if (q !== -1) p = p.slice(0, q);
  if (p.length === 0) return null;
  // Leading slash garanti.
  if (!p.startsWith("/")) p = `/${p}`;
  // Sondaki slash kaldır (kök hariç).
  if (p.length > 1) p = p.replace(/\/+$/g, "");
  return p.length > 0 ? p : "/";
}

/**
 * Kurallardan deterministik bir index (Map<normSource, {target,type}>) kurar. Elenenler: disabled,
 * geçersiz source/target, self-redirect (source===target). Aynı source için SON geçerli kural kazanır.
 */
export function buildRedirectIndex(rules: readonly RedirectRule[]): Map<string, { target: string; type: RedirectType }> {
  const index = new Map<string, { target: string; type: RedirectType }>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!REDIRECT_TYPES.includes(rule.type)) continue;
    const source = normalizeRedirectPath(rule.source);
    const target = normalizeRedirectPath(rule.target);
    if (source === null || target === null) continue; // missing/invalid → güvenli eleme.
    if (source === target) continue; // self-redirect → anlamsız.
    index.set(source, { target, type: rule.type }); // son kural kazanır (precedence).
  }
  return index;
}

/**
 * Bir path'i çözer. Eşleşme yoksa `null` (redirect yok). Zincir varsa sonuna kadar takip eder; loop
 * tespit edilirse `null` (güvenli — redirect yapma). Yanıt tipi İLK eşleşen kuraldan; hedef zincir sonundan.
 *
 * @param maxHops Zincir üst sınırı (patolojik uzun zincire karşı ek guard; loop seti zaten döngüyü keser).
 */
export function resolveRedirect(
  path: string,
  index: Map<string, { target: string; type: RedirectType }>,
  options: { maxHops?: number } = {},
): RedirectResolution | null {
  const maxHops = options.maxHops ?? 10;
  const start = normalizeRedirectPath(path);
  if (start === null) return null;

  const first = index.get(start);
  if (!first) return null; // kaynak değil → redirect yok.

  const visited = new Set<string>([start]);
  let currentTarget = first.target;
  let hops = 1;

  // Zinciri topla: hedef başka bir kaynağa işaret ediyorsa takip et (chain collapse).
  while (hops < maxHops) {
    if (visited.has(currentTarget)) {
      // Loop (hedef daha önce ziyaret edilmiş bir kaynağa/başlangıca dönüyor) → güvenli iptal.
      return null;
    }
    const next = index.get(currentTarget);
    if (!next) break; // hedef artık kaynak değil → zincir sonu.
    visited.add(currentTarget);
    currentTarget = next.target;
    hops += 1;
  }

  if (hops >= maxHops && index.has(currentTarget)) {
    // maxHops'a rağmen hâlâ bir kaynağa işaret ediyor (patolojik) → güvenli iptal.
    return null;
  }

  // Hedef başlangıçla aynıysa (tek-hop self veya zincir başa döndü) → redirect yok.
  if (currentTarget === start) return null;

  return { target: currentTarget, type: first.type, hops };
}

/** Kolaylık: ham kural listesi + path → çözüm (index'i her seferinde kurar; sıcak yolda buildRedirectIndex'i cache'le). */
export function resolveRedirectFromRules(
  path: string,
  rules: readonly RedirectRule[],
  options?: { maxHops?: number },
): RedirectResolution | null {
  return resolveRedirect(path, buildRedirectIndex(rules), options);
}
