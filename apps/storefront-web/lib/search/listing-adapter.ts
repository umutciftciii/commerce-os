/**
 * TODO-156B (ANALIZ-156A §5, R1) — Public search product DTO → ortak KART gorunum modeli.
 *
 * Search yaniti ProductCard icin TEK veri kaynagidir (ikinci hidrasyon turu YOK). Bu adapter YALNIZCA
 * bicimleme yapar (minor → tr-TR para etiketi); ticari HESAP TEKRARI yoktur — indirim/Omnibus/compareAt
 * sunucuda (read-model) hesaplanir, burada yeniden hesaplanmaz. Eksik gorsel/swatch/ticari alanlarda
 * kontrollu fallback: kampanya rozeti/indirim yoksa kart KIRILMAZ.
 *
 * Not: Search read-model kampanya rozeti (F4A) TASIMAZ — bilincli olarak TODO-155.2'ye ertelendi
 * (ANALIZ §18 R1). compareAt indirimi + Omnibus + discountPercent read-model'de MEVCUTTUR ve burada gosterilir.
 */
import type { PublicSearchProduct } from "@commerce-os/api-client";
import { formatMinor } from "../money";

/** Kart swatch gorunumu (yalniz gorsel onizleme; varyant secimi/fiyat degisimi YOK — ANALIZ §7). */
export interface ListingSwatch {
  optionId: string;
  label: string;
  colorHex: string | null;
  imageUrl: string | null;
  isDefault: boolean;
}

/** Karti besleyen search-turevli ozet (StorefrontProductSummary'den AYRI; ticari gorunum modeli tasimaz). */
export interface SearchListingCard {
  /** Stabil React key + kimlik. */
  id: string;
  slug: string;
  href: string;
  title: string;
  brand: string | null;
  categoryLabel: string | null;
  currency: string;
  /** En ucuzdan baslayan gorunur fiyat (tr-TR); fiyat yoksa null (gizli/talep). */
  priceLabel: string | null;
  /** Ustu-cizili liste fiyati (yalniz indirimde); yoksa null. */
  compareAtLabel: string | null;
  /** Indirim yuzdesi (sunucu formulu); yoksa null. Kart "%X" rozeti bundan turer. */
  discountPercent: number | null;
  /** EU Omnibus son 30 gun en dusuk fiyat etiketi (yalniz indirimde); yoksa null. */
  omnibusLabel: string | null;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  inStock: boolean;
  /** Birincil (kapak) gorsel; yoksa null → kart yer tutucuya duser. */
  primaryImage: { url: string; alt: string } | null;
  /** Ikincil/hover gorsel; yoksa null → hover degisimi yapilmaz. */
  secondaryImage: { url: string; alt: string } | null;
  /** Bounded swatch listesi (media-tanimlayici eksen). */
  swatches: ListingSwatch[];
  /** Toplam swatch sayisi (> swatches.length ise "+N"). */
  swatchTotalCount: number;
  /** Gosterilmeyen ek swatch sayisi ("+N" göstergesi; 0 ise gosterme). */
  extraSwatchCount: number;
  /** Varsayilan swatch (isDefault; yoksa ilk); hicbiri yoksa null. */
  defaultSwatch: ListingSwatch | null;
}

function toImage(
  img: { url: string; altText: string | null } | null,
  fallbackAlt: string,
): { url: string; alt: string } | null {
  if (!img) return null;
  return { url: img.url, alt: img.altText ?? fallbackAlt };
}

/** Tek bir search product DTO'sunu kart gorunum modeline cevirir (saf). */
export function toListingCard(product: PublicSearchProduct): SearchListingCard {
  const currency = product.currency ?? "TRY";
  const swatches: ListingSwatch[] = product.swatches.map((swatch) => ({
    optionId: swatch.optionId,
    label: swatch.label,
    colorHex: swatch.colorHex,
    imageUrl: swatch.imageUrl,
    isDefault: swatch.isDefault,
  }));
  const defaultSwatch = swatches.find((swatch) => swatch.isDefault) ?? swatches[0] ?? null;
  // "+N": toplam sayidan gosterilenleri cikar; asla negatif olmaz.
  const extraSwatchCount = Math.max(0, product.swatchTotalCount - swatches.length);

  return {
    id: product.id,
    slug: product.slug,
    href: `/products/${product.slug}`,
    title: product.title,
    brand: product.brand,
    categoryLabel: product.categoryLabel,
    currency,
    priceLabel: product.minPriceMinor !== null ? formatMinor(product.minPriceMinor, currency) : null,
    compareAtLabel:
      product.compareAtMinor !== null ? formatMinor(product.compareAtMinor, currency) : null,
    discountPercent: product.discountPercent,
    omnibusLabel:
      product.omnibusPreviousPriceMinor !== null
        ? formatMinor(product.omnibusPreviousPriceMinor, currency)
        : null,
    availability: product.availability,
    inStock: product.inStock,
    primaryImage: toImage(product.image, product.title),
    secondaryImage: toImage(product.secondaryImage, product.title),
    swatches,
    swatchTotalCount: product.swatchTotalCount,
    extraSwatchCount,
    defaultSwatch,
  };
}

export function toListingCards(products: PublicSearchProduct[]): SearchListingCard[] {
  return products.map(toListingCard);
}
