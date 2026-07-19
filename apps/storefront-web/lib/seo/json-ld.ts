/**
 * TODO-156D (ADR-083/brief §14) — JSON-LD (schema.org) builder'ları (SAF, çerçeve-bağımsız).
 *
 * Google Rich Results uyumlu yapısal veri üretir. Kurallar:
 *  - Tüm URL'ler MUTLAK (absoluteUrl ile; çağıran taraf verir).
 *  - Boş/null alan ASLA yazılmaz (undefined temizlenir → "" veya null literal çıkmaz).
 *  - İç id (productId/mediaId/storageKey/campaign id) ASLA sızmaz — yalnız public alanlar.
 *  - Deterministik: aynı girdi → aynı JSON.
 *
 * Bu modül yalnız düz nesne döndürür; `<script type="application/ld+json">` render'ı JsonLd bileşenindedir.
 */
import type { BreadcrumbItem } from "./breadcrumb";

/** schema.org availability enum → tam URL. */
export const SCHEMA_IN_STOCK = "https://schema.org/InStock";
export const SCHEMA_OUT_OF_STOCK = "https://schema.org/OutOfStock";

/** Minor (kuruş, 2 basamak varsayımı — mağaza TRY) → schema.org decimal string ("1299.00"). */
export function minorToDecimalString(minor: number): string {
  return (minor / 100).toFixed(2);
}

type JsonLdObject = Record<string, unknown>;

/** undefined/null alanları temizler (boş alan üretme kuralı). Diziler/nesneler recursive değil — sığ yeterli. */
function compact(obj: JsonLdObject): JsonLdObject {
  const out: JsonLdObject = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Organization (site-geneli marka kimliği). logo yoksa alan düşer. */
export function buildOrganizationJsonLd(params: {
  name: string;
  url: string;
  logoUrl?: string | null;
}): JsonLdObject {
  return compact({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: params.name,
    url: params.url,
    logo: params.logoUrl ?? undefined,
  });
}

/** WebSite + SearchAction (Google Sitelinks Search Box). target ham `{search_term_string}` içerir. */
export function buildWebSiteJsonLd(params: {
  name: string;
  url: string;
  searchUrlTemplate: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: params.name,
    url: params.url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: params.searchUrlTemplate,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * BreadcrumbList — görünür breadcrumb ile AYNI trail'den (tek kaynak). `path === null` düğüm için `item`
 * atlanır (Google: son öğe item'sız olabilir) VEYA leafUrl verilirse ona bağlanır. `toAbsolute` göreli
 * path'i mutlaklar.
 */
export function buildBreadcrumbJsonLd(
  trail: readonly BreadcrumbItem[],
  toAbsolute: (path: string) => string,
  leafUrl?: string,
): JsonLdObject {
  const itemListElement = trail.map((crumb, index) => {
    const url = crumb.path ? toAbsolute(crumb.path) : index === trail.length - 1 ? leafUrl : undefined;
    return compact({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: url,
    });
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}

/** ItemList — PLP ürün sırası (indexlenebilir sayfalarda). Yalnız url + position (isim opsiyonel). */
export function buildItemListJsonLd(params: {
  items: { url: string; name?: string }[];
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: params.items.map((item, index) =>
      compact({
        "@type": "ListItem",
        position: index + 1,
        url: item.url,
        name: item.name,
      }),
    ),
  };
}

export interface ProductOfferInput {
  currency: string;
  /** Görünür varyant fiyat aralığı (minor). Tek fiyat → low===high. */
  lowPriceMinor: number;
  highPriceMinor: number;
  offerCount: number;
  inStock: boolean;
  /** Ürün kanonik mutlak URL'i (Offer.url). */
  url: string;
}

/**
 * Product + Offer/AggregateOffer + Brand. Fiyat GÖRÜNMEZ ise (offer=null) offers alanı DÜŞER (sahte fiyat
 * üretilmez). Tek görünür fiyat → Offer; çoklu → AggregateOffer (low/high/offerCount). images boşsa alan düşer.
 */
export function buildProductJsonLd(params: {
  name: string;
  description?: string | null;
  url: string;
  images?: string[];
  brand?: string | null;
  sku?: string | null;
  offer: ProductOfferInput | null;
}): JsonLdObject {
  let offers: JsonLdObject | undefined;
  if (params.offer) {
    const o = params.offer;
    const availability = o.inStock ? SCHEMA_IN_STOCK : SCHEMA_OUT_OF_STOCK;
    if (o.offerCount > 1 && o.lowPriceMinor !== o.highPriceMinor) {
      offers = {
        "@type": "AggregateOffer",
        priceCurrency: o.currency,
        lowPrice: minorToDecimalString(o.lowPriceMinor),
        highPrice: minorToDecimalString(o.highPriceMinor),
        offerCount: o.offerCount,
        availability,
        url: o.url,
      };
    } else {
      offers = {
        "@type": "Offer",
        priceCurrency: o.currency,
        price: minorToDecimalString(o.lowPriceMinor),
        availability,
        url: o.url,
      };
    }
  }

  return compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name: params.name,
    description: params.description ?? undefined,
    url: params.url,
    image: params.images && params.images.length > 0 ? params.images : undefined,
    sku: params.sku ?? undefined,
    brand: params.brand ? { "@type": "Brand", name: params.brand } : undefined,
    offers,
  });
}
