import type {
  PublicProduct,
  PublicProductDetail,
  PublicProductListResponse,
  PublicProductVariant,
} from "@commerce-os/api-client";
import type {
  PriceDisplayMode,
  StorefrontPrice,
  StorefrontProductDetail,
  StorefrontProductSummary,
  StorefrontVariantView,
} from "../catalog-types";
import { deriveProductCommerceView } from "../sales-model";
import { formatLowest, formatMinor, formatPriceRange } from "../money";
import { demoStoreSlug } from "./env";

/**
 * Vitrin katalog cozumleyici (TD-032 / F3A.1). Gateway'in AUTH GEREKTIRMEYEN
 * public-read katalog uclarini ({@link https} `/public/stores/:slug/...`)
 * token'siz cagirir ve donen public-safe DTO'yu saf vitrin gorunum modellerine
 * (catalog-types) cevirir.
 *
 * F3A'daki gecici platform-admin (SUPER_ADMIN) sunucu-tarafi token resolver'i
 * KALDIRILDI: vitrin artik hicbir yuksek-yetkili kimlik tasimaz, login yapmaz
 * ve Bearer token kullanmaz. Numerik fiyat gizliligi gateway'de uygulanir
 * (HIDDEN/ON_REQUEST'te priceMinor null gelir); bu katman yine de yalnizca
 * gorunur fiyat etiketlerini turetir.
 */

export type CatalogFailure = "no-store" | "error";

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; reason: CatalogFailure };

/** Gateway taban URL'i (yalnizca sunucu env'i; client'a sizmaz, NEXT_PUBLIC degil). */
function gatewayBaseUrl(): string {
  return (process.env.API_GATEWAY_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

type FetchOutcome<T> = { ok: true; data: T } | { ok: false; status: number };

/** Public katalog GET cagrisi. Hicbir auth header gondermez; her istekte taze. */
async function getPublic<T>(path: string): Promise<FetchOutcome<T>> {
  const response = await fetch(`${gatewayBaseUrl()}${path}`, { cache: "no-store" });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  return { ok: true, data: (await response.json()) as T };
}

/** Yalnizca numerik fiyati gorunur (null olmayan) varyantlarin fiyat listesi. */
function visiblePrices(variants: PublicProductVariant[]) {
  return variants
    .filter((variant) => variant.priceMinor !== null)
    .map((variant) => ({ priceMinor: variant.priceMinor as number, currency: variant.currency }));
}

function buildPrice(priceMode: PriceDisplayMode, variants: PublicProductVariant[]): StorefrontPrice {
  const prices = visiblePrices(variants);

  let amountLabel: string | null = null;
  if (priceMode === "amount") amountLabel = formatPriceRange(prices);
  else if (priceMode === "startingFrom") amountLabel = formatLowest(prices);

  // Indirim: en dusuk fiyatli varyantta gecerli bir compareAt varsa goster.
  let compareAtLabel: string | null = null;
  if (priceMode === "amount") {
    const priced = variants.filter((variant) => variant.priceMinor !== null);
    if (priced.length > 0) {
      const cheapest = priced.reduce(
        (min, variant) => ((variant.priceMinor as number) < (min.priceMinor as number) ? variant : min),
        priced[0],
      );
      if (
        cheapest.compareAtMinor !== null &&
        cheapest.compareAtMinor > (cheapest.priceMinor as number)
      ) {
        compareAtLabel = formatMinor(cheapest.compareAtMinor, cheapest.currency);
      }
    }
  }

  return { mode: priceMode, amountLabel, compareAtLabel };
}

/** Public urun DTO'sunu liste/kart ozet gorunumune cevirir. */
function toSummary(product: PublicProduct): StorefrontProductSummary {
  const commerce = deriveProductCommerceView(product);
  const price = buildPrice(commerce.priceMode, product.variants);
  return {
    handle: product.slug,
    title: product.title,
    brand: product.brand,
    categoryLabel: product.categoryLabel,
    price,
    commerce,
    badgeKind: price.compareAtLabel ? "discount" : null,
  };
}

function toVariantView(variant: PublicProductVariant): StorefrontVariantView {
  const priceVisible = variant.priceMinor !== null;
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    priceLabel: priceVisible ? formatMinor(variant.priceMinor as number, variant.currency) : null,
    compareAtLabel:
      priceVisible &&
      variant.compareAtMinor !== null &&
      variant.compareAtMinor > (variant.priceMinor as number)
        ? formatMinor(variant.compareAtMinor, variant.currency)
        : null,
    available: variant.available,
    inStock: variant.inStock,
  };
}

/** Public detay DTO'sunu tam vitrin detay gorunumune cevirir. */
function toDetail(detail: PublicProductDetail): StorefrontProductDetail {
  const summary = toSummary(detail);
  const variants = detail.variants.map(toVariantView);
  return {
    ...summary,
    description: detail.description,
    sku: variants[0]?.sku ?? null,
    variants,
    callToActionLabel: detail.callToActionLabel,
    whatsappMessageTemplate: detail.whatsappMessageTemplate,
    inquiryFormTitle: detail.inquiryFormTitle,
    appointmentNote: detail.appointmentNote,
    related: detail.related.map(toSummary),
  };
}

/** Vitrin liste sayfasi: tum yayinlanabilir urunlerin ozet gorunumu. */
export async function getStorefrontListing(): Promise<CatalogResult<StorefrontProductSummary[]>> {
  try {
    const result = await getPublic<PublicProductListResponse>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/products`,
    );
    if (!result.ok) {
      return { ok: false, reason: result.status === 404 ? "no-store" : "error" };
    }
    return { ok: true, data: result.data.data.map(toSummary) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Ana sayfa one cikan urunler (ilk N urun). */
export async function getFeaturedProducts(
  limit: number,
): Promise<CatalogResult<StorefrontProductSummary[]>> {
  const listing = await getStorefrontListing();
  if (!listing.ok) return listing;
  return { ok: true, data: listing.data.slice(0, limit) };
}

/** Urun detayi: slug ile public detay ucundan cozulur. */
export async function getStorefrontProductByHandle(
  handle: string,
): Promise<CatalogResult<StorefrontProductDetail | null>> {
  try {
    const result = await getPublic<PublicProductDetail>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/products/${encodeURIComponent(handle)}`,
    );
    if (!result.ok) {
      // Store yok -> no-store; urun yok -> graceful bos durum (404 -> data: null).
      if (result.status === 404) {
        return { ok: true, data: null };
      }
      return { ok: false, reason: "error" };
    }
    return { ok: true, data: toDetail(result.data) };
  } catch {
    return { ok: false, reason: "error" };
  }
}
