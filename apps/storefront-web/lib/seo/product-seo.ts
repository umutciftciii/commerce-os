/**
 * TODO-156D (brief §13) — Ürün SEO türetme (SAF, test edilebilir). PDP metadata + Product JSON-LD için
 * title/description/offer/görsel türetir. Env/absoluteUrl BAĞIMSIZ (birim-test edilebilir); mutlaklama
 * çağıran sayfada yapılır. seoTitle/seoDescription (admin override) önceliklidir, yoksa title/description.
 */
import type { StorefrontProductDetail } from "../catalog-types";
import type { ProductOfferInput } from "./json-ld";

/** Meta açıklama üst sınırı (Google ~155–160 karakter gösterir). */
export const META_DESCRIPTION_MAX = 160;

/** Meta başlık: admin seoTitle > ürün başlığı. */
export function productMetaTitle(detail: Pick<StorefrontProductDetail, "seoTitle" | "title">): string {
  const seo = detail.seoTitle?.trim();
  return seo && seo.length > 0 ? seo : detail.title;
}

/** Metni tek satıra indirger + maks uzunlukta kelime sınırında keser ("…" ekler). */
export function truncateForMeta(text: string, max = META_DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Meta açıklama: admin seoDescription > ürün açıklaması > fallback; tek satır + kırpılmış. */
export function productMetaDescription(
  detail: Pick<StorefrontProductDetail, "seoDescription" | "description">,
  fallback: string,
): string {
  const seo = detail.seoDescription?.trim();
  if (seo && seo.length > 0) return truncateForMeta(seo);
  const desc = detail.description?.trim();
  if (desc && desc.length > 0) return truncateForMeta(desc);
  return truncateForMeta(fallback);
}

/**
 * Product JSON-LD offer'ı türetir (url hariç — çağıran ekler). Görünür fiyatlı varyant yoksa null
 * (sahte fiyat YOK). Tek fiyat → low===high (builder Offer üretir); çoklu farklı fiyat → AggregateOffer.
 * inStock: en az bir varyant stokta ise. currency ilk görünür varyanttan.
 */
export function deriveProductOffer(
  detail: Pick<StorefrontProductDetail, "variants">,
): Omit<ProductOfferInput, "url"> | null {
  const priced = detail.variants.filter((v) => v.priceMinor !== null);
  if (priced.length === 0) return null;
  const prices = priced.map((v) => v.priceMinor as number);
  return {
    currency: priced[0].currency,
    lowPriceMinor: Math.min(...prices),
    highPriceMinor: Math.max(...prices),
    offerCount: priced.length,
    inStock: priced.some((v) => v.inStock),
  };
}
