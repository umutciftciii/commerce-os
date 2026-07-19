/**
 * TODO-156D (ADR-081) — Slug üretim/normalizasyon MOTORU (SAF, çerçeve-bağımsız, TEK OTORİTE).
 *
 * Bu modül hem storefront (URL üretimi/önizleme) hem gelecekteki Admin slug servisi (ürün/kategori/CMS)
 * tarafından PAYLAŞILIR. Next/React/Prisma importu YOKTUR; yalnızca saf string dönüşümü + kolizyon çözümü.
 * Böylece "slug otoritesi tek yerde" ilkesi (brief §2/§3/§19) tek noktada uygulanır; route bazında rastgele
 * slug üretimi YASAK — çağıran taraf daima bu motoru kullanır.
 *
 * Determinizm: aynı girdi → aynı slug. Kolizyon çözümü de deterministiktir (mevcut slug kümesi + istenen
 * kök → daima aynı sonuç). Tenant-aware'lik çağıran katmandadır (uniqueness store-scoped kontrol edilir);
 * bu motor saf string alır, kolizyon predikatını dışarıdan alır.
 */

/** Slug uzunluk/format sabitleri. */
export const SLUG_MAX_LENGTH = 80;
export const SLUG_MIN_LENGTH = 1;
/** Boş/tamamen geçersiz girdi bu köke düşer (ör. yalnız emoji/simge başlık). */
export const SLUG_FALLBACK = "urun";

/**
 * Türkçe (ve yaygın Latin genişletme) harflerinin ASCII karşılıkları. NFKD normalize aksanların çoğunu
 * ayrıştırır; ancak ı/İ/ş/ğ gibi harfler NFKD ile ASCII'ye inmez → burada AÇIK eşlenir (Türkçe SEO doğru
 * transliterasyon). Büyük/küçük ikisi de map'lenir çünkü lowercase JS `İ`→`i̇` (combining dot) üretir.
 */
const TRANSLITERATION: Record<string, string> = {
  ç: "c", Ç: "c",
  ğ: "g", Ğ: "g",
  ı: "i", İ: "i",
  ö: "o", Ö: "o",
  ş: "s", Ş: "s",
  ü: "u", Ü: "u",
  ß: "ss",
  æ: "ae", Æ: "ae",
  ø: "o", Ø: "o",
  ð: "d", Ð: "d",
  þ: "th", Þ: "th",
  œ: "oe", Œ: "oe",
};

/**
 * Route/altyapı ile çakışması yasak rezerve slug'lar (storefront + gateway path segmentleri). Bir entity
 * slug'ı bunlardan biriyse motor deterministik olarak `-1` ekleyerek çakışmayı kırar (ör. `cart` → `cart-1`).
 * Çağıran taraf ek rezerve kelime geçebilir (locale/marka bazlı).
 */
export const DEFAULT_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "auth", "login", "logout", "register", "account", "cart", "checkout",
  "products", "product", "search", "categories", "category", "media", "static", "public",
  "sitemap", "sitemap.xml", "robots", "robots.txt", "favicon.ico", "assets", "_next",
  "design-system", "health", "new", "edit", "create", "delete",
]);

/**
 * Ham metni kanonik slug'a indirger (SAF, kolizyonsuz). Adımlar (deterministik sıra):
 *  1. Unicode NFKD normalize (aksan ayrıştır) + açık transliterasyon (Türkçe ı/ş/ğ...).
 *  2. lowercase.
 *  3. Combining işaretleri (U+0300–U+036F) düşür.
 *  4. Geçersiz karakter → tire (harf/rakam dışı her şey, boşluk dahil).
 *  5. Tekrarlı tireleri tek tireye indir + baş/son tireleri kırp.
 *  6. Maks uzunluğa kes (kelime sınırına saygı; kesme sonrası son tireyi kırp).
 *  7. Boş kalırsa fallback köküne düş.
 *
 * NOT: uniqueness/kolizyon BURADA çözülmez (bkz. resolveUniqueSlug); bu yalnızca "temiz kök"tür.
 */
export function slugify(input: string, options: { maxLength?: number; fallback?: string } = {}): string {
  const maxLength = options.maxLength ?? SLUG_MAX_LENGTH;
  const fallback = options.fallback ?? SLUG_FALLBACK;

  // 1) Açık transliterasyon (NFKD öncesi — İ/ı gibi harfler NFKD'de kaybolmasın).
  let out = "";
  for (const ch of input) {
    out += TRANSLITERATION[ch] ?? ch;
  }

  // 2) NFKD + lowercase + combining düşür (U+0300–U+036F).
  out = out.normalize("NFKD").toLowerCase().replace(/[̀-ͯ]/g, "");

  // 3) Geçersiz karakterleri tireye çevir (yalnız a-z0-9 korunur).
  out = out.replace(/[^a-z0-9]+/g, "-");

  // 4) Tekrarlı tire + baş/son kırp.
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  // 5) Maks uzunluk (kesme sonrası son tireyi kırp — yarım kelime tiresi kalmasın).
  if (out.length > maxLength) {
    out = out.slice(0, maxLength).replace(/-+$/g, "");
  }

  // 6) Fallback.
  return out.length >= SLUG_MIN_LENGTH ? out : fallback;
}

/** Slug zaten kanonik mi (slugify(x) === x). Manuel override doğrulaması için. */
export function isCanonicalSlug(slug: string, options?: { maxLength?: number }): boolean {
  return slug === slugify(slug, options) && slug.length > 0;
}

export type SlugValidationError =
  | "empty"
  | "too-long"
  | "invalid-characters"
  | "leading-trailing-dash"
  | "consecutive-dash"
  | "reserved";

export interface SlugValidationResult {
  ok: boolean;
  /** Kanonik hale getirilmiş öneri (ok=false olsa da kullanıcıya "bunu mu demek istediniz" için). */
  normalized: string;
  errors: SlugValidationError[];
}

/**
 * Manuel girilen bir slug'ı DOĞRULAR (Admin slug input'u için). Otomatik düzeltmez — çağıran taraf hataları
 * gösterip `normalized`'ı önerebilir. Rezerve kontrolü store-scoped uniqueness'tan AYRI (rezerve = route
 * çakışması; uniqueness = veri çakışması, çağıran katmanda).
 */
export function validateSlug(
  raw: string,
  options: { maxLength?: number; reserved?: ReadonlySet<string> } = {},
): SlugValidationResult {
  const maxLength = options.maxLength ?? SLUG_MAX_LENGTH;
  const reserved = options.reserved ?? DEFAULT_RESERVED_SLUGS;
  const errors: SlugValidationError[] = [];
  const trimmed = raw.trim();

  if (trimmed.length === 0) errors.push("empty");
  if (trimmed.length > maxLength) errors.push("too-long");
  if (/[^a-z0-9-]/.test(trimmed)) errors.push("invalid-characters");
  if (/^-|-$/.test(trimmed)) errors.push("leading-trailing-dash");
  if (/--/.test(trimmed)) errors.push("consecutive-dash");
  if (reserved.has(trimmed.toLowerCase())) errors.push("reserved");

  return { ok: errors.length === 0, normalized: slugify(raw, { maxLength }), errors };
}

/**
 * Deterministik kolizyon çözümü. `desired` kökünü alır; `isTaken(candidate)` true dönen her aday için
 * `-2`, `-3`, ... sayısal soneki dener ve İLK boş adayı döner. Rezerve slug da "alınmış" sayılır (route
 * çakışması). SAF: `isTaken` predikatı store-scoped uniqueness'ı çağıran katmandan gelir (tenant-aware).
 *
 * Determinizm: aynı `desired` + aynı `isTaken` davranışı → daima aynı sonuç. Maks uzunluk korunur (sonek
 * eklerken kök gerekiyorsa kısaltılır → toplam ≤ maxLength).
 */
export function resolveUniqueSlug(
  desired: string,
  isTaken: (candidate: string) => boolean,
  options: { maxLength?: number; reserved?: ReadonlySet<string>; startAt?: number } = {},
): string {
  const maxLength = options.maxLength ?? SLUG_MAX_LENGTH;
  const reserved = options.reserved ?? DEFAULT_RESERVED_SLUGS;
  const base = slugify(desired, { maxLength });

  const taken = (candidate: string): boolean => reserved.has(candidate) || isTaken(candidate);

  if (!taken(base)) return base;

  // Sonek denemeleri: base-2, base-3, ... Kök+sonek maxLength'i aşarsa kökü kısalt.
  for (let n = options.startAt ?? 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const room = maxLength - suffix.length;
    const root = base.length > room ? base.slice(0, room).replace(/-+$/g, "") : base;
    const candidate = `${root}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
  // Teorik olarak ulaşılamaz (10k çakışma); deterministik son çare (kök + sabit sonek).
  return `${base}-x`;
}

/**
 * Bir başlıktan otomatik slug üretir + kolizyon çözer (Admin "auto" modu). Manuel override varsa onu
 * doğrulayıp (geçerliyse) kolizyon çözer; geçersizse başlıktan türetir. TEK giriş noktası.
 */
export function generateSlug(
  params: {
    title: string;
    manual?: string | null;
    existing: ReadonlySet<string>;
    /** Kendi mevcut slug'ı (güncelleme senaryosu — kendisiyle çakışmayı yok say). */
    self?: string | null;
  },
  options: { maxLength?: number; reserved?: ReadonlySet<string> } = {},
): string {
  const { title, manual, existing, self } = params;
  const isTaken = (candidate: string): boolean => candidate !== self && existing.has(candidate);

  const manualTrimmed = manual?.trim();
  if (manualTrimmed && manualTrimmed.length > 0) {
    const check = validateSlug(manualTrimmed, options);
    const seed = check.ok ? manualTrimmed : check.normalized;
    return resolveUniqueSlug(seed, isTaken, options);
  }
  return resolveUniqueSlug(title, isTaken, options);
}
