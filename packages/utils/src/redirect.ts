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

// ============================================================================
// Manuel redirect güvenlik motoru (Admin SEO modülü — TD-057 kapanışı, ADR-265).
//
// Otomatik redirect'ler `recordSlugChange` içinde üretilir ve zaten chain/loop
// güvenlidir. MANUEL redirect'i kullanıcı girer → ek savunma gerekir. Bu katman
// SAF: kaynak/hedef path'in bir manuel redirect için güvenli olup olmadığını
// çerçeve-bağımsız karara bağlar. CANLI-entity gölge kontrolü (kaynak gerçek bir
// ürün/marka slug'ına denk mi?) DB gerektirir → gateway katmanındadır; burada
// yalnız statik/rezerve rota + off-site hedef + döngü tohumu ele alınır.
// ============================================================================

/**
 * Tümüyle rezerve ilk-segment namespace'leri (storefront canlı rotaları + sistem yolları). Bu
 * segmentlerin ALTINDAKİ her yol da rezerve sayılır (ör. `/checkout/payment`, `/account/orders`).
 * NOT: `products` ve `markalar` BİLEREK dışarıda — bare listeleme sayfaları (`/products`, `/markalar`)
 * ayrıca `RESERVED_EXACT_ROUTES` ile bloklanır, ama DETAY yolları (`/products/{slug}`, `/markalar/{slug}`)
 * geçerli redirect kaynağı olabilir (eski slug); canlı ürün/marka gölgeleme kontrolü gateway'dedir.
 */
const RESERVED_ROUTE_NAMESPACES: ReadonlySet<string> = new Set([
  "admin", "api", "_next", "auth", "login", "logout", "register", "account", "cart", "checkout",
  "search", "categories", "category", "media", "static", "public", "assets", "pay", "t", "discovery",
  "design-system", "health", "campaign-unavailable", "sitemap", "sitemap.xml", "robots", "robots.txt",
  "favicon.ico",
]);

/** Tam olarak rezerve rotalar (canlı listeleme/kök sayfaları; alt yol izni yok ama kendisi kaynak olamaz). */
const RESERVED_EXACT_ROUTES: ReadonlySet<string> = new Set(["/", "/products", "/markalar"]);

/**
 * Hedef güvenli bir YEREL path mi? Off-site yönlendirmeyi (open-redirect) engeller:
 *  - leading "/" zorunlu (mutlak yerel path).
 *  - "//" (protocol-relative) reddedilir → tarayıcı başka host'a gider.
 *  - "://" içeren (mutlak URL) reddedilir.
 *  - kontrol karakteri (header injection / bozuk Location) reddedilir.
 * Query/hash İZİNLİ (kategori hedefi `/products?category=...` gibi). Boş/başka tür → false.
 */
export function isSafeLocalRedirectTarget(path: string): boolean {
  if (typeof path !== "string") return false;
  const p = path.trim();
  if (p.length === 0) return false;
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p.includes("://")) return false;
  // Kontrol karakterleri (U+0000–U+001F) — header injection / bozuk Location savunması.
  for (let k = 0; k < p.length; k += 1) if (p.charCodeAt(k) < 0x20) return false;
  return true;
}

/**
 * Verilen kaynak path bir manuel redirect için REZERVE/CANLI kanonik rotayı gölgeler mi?
 * true → manuel redirect kaynağı olamaz. Kapsam: kök + bare listeleme + rezerve namespace'ler.
 * (Canlı ürün/marka slug gölgeleme kontrolü DB gerektirir → gateway'de.)
 */
export function isReservedRedirectSource(source: string): boolean {
  const n = normalizeRedirectPath(source);
  if (n === null) return true; // geçersiz → güvenli tarafta reddet.
  if (RESERVED_EXACT_ROUTES.has(n)) return true;
  const firstSegment = n.split("/")[1] ?? "";
  return RESERVED_ROUTE_NAMESPACES.has(firstSegment.toLowerCase());
}

/**
 * `source → target` kuralını MEVCUT kurallara eklemek bir döngü tohumu yaratır mı? Hedeften
 * başlayıp mevcut kurallar üzerinden zinciri takip eder; kaynağa geri dönerse döngü (true).
 * (Otomatik redirect'ler `recordSlugChange` içinde zaten temizlenir; bu, manuel giriş için savunma.)
 */
export function redirectWouldCreateLoop(
  source: string,
  target: string,
  existing: readonly RedirectRule[],
  options: { maxHops?: number } = {},
): boolean {
  const s = normalizeRedirectPath(source);
  const t = normalizeRedirectPath(target);
  if (s === null || t === null) return false; // geçersizlik ayrı hata; burada döngü yok say.
  if (s === t) return true; // birebir self → döngü.
  const index = buildRedirectIndex(existing);
  const maxHops = options.maxHops ?? 50;
  const visited = new Set<string>([s]);
  let current = t;
  let hops = 0;
  while (hops < maxHops) {
    if (current === s) return true; // zincir kaynağa döndü → döngü.
    if (visited.has(current)) return false; // kaynağı içermeyen mevcut döngü → bizim kuralımız güvenli.
    visited.add(current);
    const next = index.get(current);
    if (!next) return false; // zincir bitti, kaynağa dönmedi.
    current = next.target;
    hops += 1;
  }
  return true; // patolojik derinlik → güvenli tarafta döngü say.
}

export type ManualRedirectValidationError =
  | "invalid-source"
  | "invalid-target"
  | "unsafe-target"
  | "source-equals-target"
  | "reserved-route"
  | "loop";

export interface ManualRedirectInput {
  source: string;
  target: string;
}

export interface ManualRedirectContext {
  /** Mevcut (bu store'a ait) redirect kuralları — döngü kontrolü için. */
  existingRules: readonly RedirectRule[];
}

export type ManualRedirectValidation = { ok: true } | { ok: false; error: ManualRedirectValidationError };

/**
 * Manuel redirect için bütünleşik SAF kabul kararı (sıra kritik — ilk ihlal döner):
 *  1) kaynak normalize edilebilir mi (invalid-source)
 *  2) hedef normalize edilebilir mi (invalid-target)
 *  3) hedef güvenli yerel path mi — off-site reddi (unsafe-target)
 *  4) kaynak == hedef (source-equals-target)
 *  5) kaynak rezerve/canonical rota gölgeliyor mu (reserved-route)
 *  6) döngü tohumu (loop)
 * Store scope + cross-store + canlı ürün/marka gölgeleme gateway katmanında zorlanır.
 */
export function validateManualRedirect(
  input: ManualRedirectInput,
  context: ManualRedirectContext,
): ManualRedirectValidation {
  const source = normalizeRedirectPath(input.source);
  if (source === null) return { ok: false, error: "invalid-source" };
  const target = normalizeRedirectPath(input.target);
  if (target === null) return { ok: false, error: "invalid-target" };
  if (!isSafeLocalRedirectTarget(input.target)) return { ok: false, error: "unsafe-target" };
  if (source === target) return { ok: false, error: "source-equals-target" };
  if (isReservedRedirectSource(source)) return { ok: false, error: "reserved-route" };
  if (redirectWouldCreateLoop(source, target, context.existingRules)) return { ok: false, error: "loop" };
  return { ok: true };
}
