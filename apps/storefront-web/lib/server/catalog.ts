import { cache } from "react";
import type {
  PublicCampaignBadge,
  PublicHomeResponse,
  PublicProduct,
  PublicProductDetail,
  PublicProductListResponse,
  PublicProductVariant,
} from "@commerce-os/api-client";
import {
  formatCampaignAmount,
  getCampaignBadgeText,
  getCampaignDiscountText,
  getCampaignPublicLabel,
  type CampaignLabelLocale,
} from "@commerce-os/utils";
import type {
  PriceDisplayMode,
  StorefrontCampaignView,
  StorefrontHome,
  StorefrontHomeSection,
  StorefrontPrice,
  StorefrontProductDetail,
  StorefrontProductSummary,
  StorefrontVariantView,
} from "../catalog-types";
import { deriveProductCommerceView } from "../sales-model";
import { formatLowest, formatMinor, lowestMinor } from "../money";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";

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

/** Yalnizca numerik fiyati gorunur (null olmayan) varyantlarin fiyat listesi. */
function visiblePrices(variants: PublicProductVariant[]) {
  return variants
    .filter((variant) => variant.priceMinor !== null)
    .map((variant) => ({ priceMinor: variant.priceMinor as number, currency: variant.currency }));
}

function buildPrice(priceMode: PriceDisplayMode, variants: PublicProductVariant[]): StorefrontPrice {
  const prices = visiblePrices(variants);

  // F4C (ADR-063) — Kart fiyati = EN UCUZ gorunur varyant (brut). Aralik
  // ("min – max") ARTIK gosterilmez; kampanya "Sepette" tahmini de gateway'de
  // ayni en-ucuz taban uzerinden hesaplanir (kartla tutarli).
  let amountLabel: string | null = null;
  if (priceMode === "amount") amountLabel = formatLowest(prices);
  else if (priceMode === "startingFrom") amountLabel = formatLowest(prices);

  // Indirim: en dusuk fiyatli varyantta gecerli bir compareAt varsa goster.
  let compareAtLabel: string | null = null;
  // F4B — EU Omnibus: indirim varken son 30 gunun en dusuk satis fiyati.
  let lowestRecentLabel: string | null = null;
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
        // Yalnizca indirim gosterilirken Omnibus notunu ekle (gateway zaten
        // gecerli-indirim + fiyat-gorunur kosulunda lowestPriceMinor doldurur).
        if (cheapest.lowestPriceMinor !== null) {
          lowestRecentLabel = formatMinor(cheapest.lowestPriceMinor, cheapest.currency);
        }
      }
    }
  }

  return { mode: priceMode, amountLabel, compareAtLabel, lowestRecentLabel };
}

/**
 * F4A.1 — Public kampanya rozetini hazir vitrin metinlerine cevirir. Etiketler
 * paylasilan helper'dan (tek kaynak) gelir; kampanya ic verisi tasinmaz.
 */
function toCampaignView(
  badge: PublicCampaignBadge | null | undefined,
  locale: CampaignLabelLocale,
): StorefrontCampaignView | null {
  if (!badge) return null;
  const input = {
    type: badge.kind === "COUPON" ? "COUPON_CODE" : "AUTOMATIC_CART",
    discountType: badge.discountType,
    discountValue: badge.discountValue,
  };
  return {
    displayKind: badge.displayKind,
    badgeText: getCampaignBadgeText(input, locale),
    label: getCampaignPublicLabel(input, locale),
    discountText: getCampaignDiscountText(input),
    // F4A.6 — Per-varyant "Sepette" tahmini icin ham teklif parametreleri (motorla
    // ayni formul; bkz. estimateAutomaticUnitFinalMinor). Zaten reklam edilen teklif.
    discountType: badge.discountType,
    discountValue: badge.discountValue,
    maxDiscountAmountMinor: badge.maxDiscountAmountMinor,
    minOrderAmountMinor: badge.minOrderAmountMinor,
    requiresCoupon: badge.requiresCouponCode,
    couponCode: badge.couponCode,
    couponAction: badge.couponAction,
    minOrderLabel:
      badge.minOrderAmountMinor !== null ? formatCampaignAmount(badge.minOrderAmountMinor) : null,
    endsAt: badge.endsAt,
    // F4A.6 — Sunucunun GUVENLI hesapladigi tahmini nihai birim fiyat; yoksa null
    // (sahte nihai fiyat gosterilmez). Bicim tr-TR para (mağaza TRY).
    estimatedFinalLabel:
      badge.estimatedFinalUnitPriceMinor !== null
        ? formatCampaignAmount(badge.estimatedFinalUnitPriceMinor)
        : null,
    // F4A.4 — Admin-kontrollu sunum alanlari (allowlist; yoksa null → fallback).
    displayTitle: badge.displayTitle,
    shortDescription: badge.shortDescription,
    badgeLabel: badge.badgeLabel,
    terms: badge.terms,
  };
}

/** Public urun DTO'sunu liste/kart ozet gorunumune cevirir. */
function toSummary(product: PublicProduct, locale: CampaignLabelLocale): StorefrontProductSummary {
  const commerce = deriveProductCommerceView(product);
  const price = buildPrice(commerce.priceMode, product.variants);
  const campaign = toCampaignView(product.campaign, locale);
  const secondaryCoupon = toCampaignView(product.secondaryCoupon, locale);
  return {
    handle: product.slug,
    title: product.title,
    brand: product.brand,
    categoryLabel: product.categoryLabel,
    // ADR-065 (Faz 3/Dilim 1) — Kapak = liste/ilgili ucundaki ilk gorsel; yoksa null
    // (kart yer tutucuya duser). Detayda images[0] yine kapaktir (tutarli).
    coverUrl: product.images[0]?.url ?? null,
    price,
    commerce,
    // Adim 3 (PLP) — En ucuz gorunur varyantin ham minor tutari (istemci fiyat
    // siralamasi icin); fiyat gizli/talep ise null.
    sortPriceMinor: lowestMinor(visiblePrices(product.variants)),
    // Kampanya rozeti oncelikli; yoksa compareAt indirim rozeti korunur.
    badgeKind: campaign ? null : price.compareAtLabel ? "discount" : null,
    campaign,
    secondaryCoupon,
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
    // Ham tutarlar: buy box'ta adet x birim toplamini bicimlemek icin (gizli/talep
    // modunda priceMinor zaten null gelir → numerik gosterim yapilmaz).
    priceMinor: priceVisible ? (variant.priceMinor as number) : null,
    compareAtMinor:
      priceVisible &&
      variant.compareAtMinor !== null &&
      variant.compareAtMinor > (variant.priceMinor as number)
        ? variant.compareAtMinor
        : null,
    currency: variant.currency,
    available: variant.available,
    inStock: variant.inStock,
    // Faz 2C-7 (ADR-078) — media-tanimlayici eksen (Renk) option id'si (yoksa null).
    mediaOptionId: variant.mediaOptionId ?? null,
  };
}

/** Public detay DTO'sunu tam vitrin detay gorunumune cevirir. */
function toDetail(detail: PublicProductDetail, locale: CampaignLabelLocale): StorefrontProductDetail {
  const summary = toSummary(detail, locale);
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
    // ADR-065 (Faz 3/Dilim 1) — Tam galeri (position ASC). coverUrl (summary'den) =
    // images[0]. Faz 2C-7 (ADR-078): variantOptionId (Renk etiketi) tasinir (null = paylasilan).
    images: detail.images.map((image) => ({
      url: image.url,
      altText: image.altText,
      variantOptionId: image.variantOptionId ?? null,
    })),
    // Faz 2C-7 (ADR-078) — gorselleri gruplayan media-tanimlayici eksen (null = klasik galeri).
    mediaDefiningAttributeId: detail.mediaDefiningAttributeId ?? null,
    // TODO-156D (ADR-080) — Admin SEO override'lari (public-safe meta metni; yoksa null).
    seoTitle: detail.seoTitle ?? null,
    seoDescription: detail.seoDescription ?? null,
    related: detail.related.map((item) => toSummary(item, locale)),
  };
}

/** Vitrin liste sayfasi: tum yayinlanabilir urunlerin ozet gorunumu. */
export async function getStorefrontListing(
  locale: CampaignLabelLocale = "tr",
): Promise<CatalogResult<StorefrontProductSummary[]>> {
  try {
    const result = await getPublic<PublicProductListResponse>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/products`,
    );
    if (!result.ok) {
      return { ok: false, reason: result.status === 404 ? "no-store" : "error" };
    }
    return { ok: true, data: result.data.data.map((item) => toSummary(item, locale)) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Ana sayfa one cikan urunler (ilk N urun). Geriye-uyumluluk için korunur. */
export async function getFeaturedProducts(
  limit: number,
  locale: CampaignLabelLocale = "tr",
): Promise<CatalogResult<StorefrontProductSummary[]>> {
  const listing = await getStorefrontListing(locale);
  if (!listing.ok) return listing;
  return { ok: true, data: listing.data.slice(0, limit) };
}

/**
 * TODO-158A (ADR-086) — Yönetilebilir ana sayfa. Gateway'in public composed `/home`
 * ucundan (yalnız enabled + yayın-penceresi geçerli section'lar, DB sırasında) beslenir.
 * Showcase ürünleri mevcut `toSummary` mapper'ıyla dönüştürülür (kart tutarlılığı = PLP).
 * Hata/boş → boş section listesi (ana sayfa asla kırılmaz; page.tsx statik fallback gösterir).
 */
export async function getHome(locale: CampaignLabelLocale = "tr"): Promise<StorefrontHome> {
  try {
    const result = await getPublic<PublicHomeResponse>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/home`,
    );
    if (!result.ok) return { sections: [] };
    const sections: StorefrontHomeSection[] = result.data.sections.map((section) => {
      const base = {
        id: section.id,
        title: section.title,
        subtitle: section.subtitle,
        desktopVisible: section.desktopVisible,
        mobileVisible: section.mobileVisible,
      };
      if (section.type === "HERO_SLIDER") {
        return {
          ...base,
          type: "HERO_SLIDER",
          autoplayMs: section.autoplayMs,
          slides: section.slides.map((slide) => ({
            key: slide.key,
            mediaUrl: slide.mediaUrl,
            mobileMediaUrl: slide.mobileMediaUrl,
            headline: slide.headline,
            subtext: slide.subtext,
            ctaLabel: slide.ctaLabel,
            ctaHref: slide.ctaHref,
          })),
        };
      }
      if (section.type === "FEATURED_CATEGORIES") {
        return {
          ...base,
          type: "FEATURED_CATEGORIES",
          categories: section.categories.map((category) => ({
            key: category.key,
            title: category.title,
            description: category.description,
            href: category.href,
            imageUrl: category.imageUrl,
          })),
        };
      }
      return {
        ...base,
        type: "PRODUCT_SHOWCASE",
        layout: section.layout,
        products: section.products.map((product) => toSummary(product, locale)),
      };
    });
    return { sections };
  } catch {
    return { sections: [] };
  }
}

/**
 * Urun detayi: slug ile public detay ucundan cozulur. TODO-156D — React `cache()` ile sarili: PDP'de
 * hem `generateMetadata` hem sayfa gövdesi ayni (handle, locale) ile cagirir; getPublic no-store oldugundan
 * fetch dedup edilmez → cache tek render-pass'te TEK gateway cagrisi garantiler (N+1/cift-fetch yok, brief §18).
 */
export const getStorefrontProductByHandle = cache(async function getStorefrontProductByHandle(
  handle: string,
  locale: CampaignLabelLocale = "tr",
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
    return { ok: true, data: toDetail(result.data, locale) };
  } catch {
    return { ok: false, reason: "error" };
  }
});
