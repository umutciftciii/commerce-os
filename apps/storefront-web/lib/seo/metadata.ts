/**
 * TODO-156D (ADR-080/brief §11) — Merkezî METADATA API. Tüm route'lar (home/PLP/PDP/kategori) bu tek
 * builder'dan `Metadata` üretir → title/description/canonical/robots/OpenGraph/Twitter/alternates dağınık
 * kurulmaz. Canonical GÖRELİ verilir; layout'taki `metadataBase` mutlaklar (Next resolve). OG/Twitter
 * görselleri absoluteUrl ile mutlaklanır (paylaşım kartları farklı origin'de çözülür).
 *
 * Robots: index/follow ikili karar çağırandan gelir (arama/facet noindex kararı lib/search/seo.ts'te; bu
 * builder onu Metadata.robots'a çevirir). noindex sayfalarda OG yine üretilir (paylaşım bozulmasın) ama
 * canonical self kalır.
 */
import type { Metadata } from "next";
import { absoluteUrl } from "./site-url";

/**
 * OG tipi. Next Metadata tiplemesi `type`'ı website|article ile sınırlar; ürün kimliği JSON-LD Product'ta
 * taşınır (Google otoritesi), bu yüzden ürün sayfaları da og:type=website kullanır (paylaşım kartı doğru,
 * tip çakışması yok). `article` gelecekteki CMS/blog için imzada tutulur.
 */
export type OgType = "website" | "article";

export interface BuildMetadataInput {
  title?: string;
  description: string;
  /** Kanonik GÖRELİ path (metadataBase ile mutlaklanır). Tek canonical otoritesi çağırandan gelir. */
  canonicalPath: string;
  robots?: { index: boolean; follow: boolean };
  siteName: string;
  locale: string;
  openGraph?: {
    type?: OgType;
    /** Göreli veya mutlak görsel URL'leri; mutlaklanır. */
    images?: string[];
  };
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const images = (input.openGraph?.images ?? []).map((src) => absoluteUrl(src));
  const canonicalAbsolute = absoluteUrl(input.canonicalPath);
  const ogLocale = input.locale === "en" ? "en_US" : "tr_TR";

  const metadata: Metadata = {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.canonicalPath },
    openGraph: {
      type: input.openGraph?.type ?? "website",
      title: input.title,
      description: input.description,
      url: canonicalAbsolute,
      siteName: input.siteName,
      locale: ogLocale,
      ...(images.length > 0 ? { images } : {}),
    },
    twitter: {
      card: images.length > 0 ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      ...(images.length > 0 ? { images } : {}),
    },
  };

  if (input.robots) {
    metadata.robots = {
      index: input.robots.index,
      follow: input.robots.follow,
      // Google'a ek sinyal: noindex sayfalarda büyük önizleme/arşiv kısıtı gerekmez; index kararını taşı.
      googleBot: { index: input.robots.index, follow: input.robots.follow },
    };
  }

  return metadata;
}
