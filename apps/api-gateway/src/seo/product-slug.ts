/**
 * TODO-165B — Urun slug yasam dongusu kararlari (SAF; test edilebilir; server-authoritative).
 *
 * Tek giris noktasi `generateSlug` (@commerce-os/utils) uzerinden calisir; collision'i
 * deterministik sonek ile cozer, TR transliterasyonu + reserved listesi orada uygulanir.
 * Karar matrisi (oncelik sirasiyla):
 *   1) regenerateFromTitle: "Urun adindan yeniden uret" aksiyonu → slug baslikatan tazelenir,
 *      kilit KALDIRILIR (ad degismemis olsa bile calisir).
 *   2) explicitSlug: kullanici slug'i manuel yazdi → normalize + collision cozumuyle kullanilir.
 *   3) ad degisti + kilit yok → slug otomatik yeniden uretilir.
 *   4) aksi halde slug KORUNUR (ad ayni, ya da kilit acik).
 *
 * `slugChanged` true ise cagiran `recordSlugChange` ile 301 redirect + SlugHistory yazmalidir.
 */
import { generateSlug } from "@commerce-os/utils";

export interface ProductSlugUpdateInput {
  /** Urunun mevcut basligi (DB). */
  currentTitle: string;
  /** Urunun mevcut slug'i (DB). */
  currentSlug: string;
  /** Urunun mevcut kilit durumu (DB). */
  currentSlugLocked: boolean;
  /** Istekte gelen yeni baslik (undefined = degismedi). */
  nextTitle?: string;
  /** Istekte gelen manuel slug override (undefined = gonderilmedi). */
  explicitSlug?: string;
  /** Istekte gelen yeni kilit durumu (undefined = degismedi). */
  nextSlugLocked?: boolean;
  /** "Urun adindan yeniden uret" aksiyonu — kilidi kaldirip slug'i tazeler. */
  regenerateFromTitle?: boolean;
  /** Store'daki mevcut slug'lar (kendi slug'i dahil olabilir; `self` ile yok sayilir). */
  existingSlugs: ReadonlySet<string>;
}

export interface ProductSlugUpdateResult {
  /** Nihai slug (degismemisse currentSlug). */
  slug: string;
  /** Nihai kilit durumu (persist edilir). */
  slugLocked: boolean;
  /** Eski slug'dan farkli mi → true ise redirect/SlugHistory yazilmali. */
  slugChanged: boolean;
}

export function resolveProductSlugOnUpdate(input: ProductSlugUpdateInput): ProductSlugUpdateResult {
  const {
    currentTitle,
    currentSlug,
    currentSlugLocked,
    nextTitle,
    explicitSlug,
    nextSlugLocked,
    regenerateFromTitle,
    existingSlugs,
  } = input;

  const effectiveTitle = nextTitle ?? currentTitle;
  let slugLocked = nextSlugLocked ?? currentSlugLocked;
  let slug = currentSlug;

  if (regenerateFromTitle) {
    // 1) Aksiyon: baslikatan tazele + kilidi kaldir (ad degismese bile).
    slug = generateSlug({ title: effectiveTitle, existing: existingSlugs, self: currentSlug });
    slugLocked = false;
  } else if (explicitSlug !== undefined) {
    // 2) Manuel slug override — normalize + collision cozumu.
    slug = generateSlug({ title: effectiveTitle, manual: explicitSlug, existing: existingSlugs, self: currentSlug });
  } else if (nextTitle !== undefined && nextTitle !== currentTitle && !slugLocked) {
    // 3) Ad degisti + kilit yok → otomatik yeniden uret.
    slug = generateSlug({ title: nextTitle, existing: existingSlugs, self: currentSlug });
  }
  // 4) aksi halde slug KORUNUR.

  return { slug, slugLocked, slugChanged: slug !== currentSlug };
}
