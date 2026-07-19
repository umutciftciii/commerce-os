import type { MetadataRoute } from "next";
import { siteOrigin } from "../lib/seo/site-url";

/**
 * TODO-156D (brief §9) — robots.txt politikası.
 *
 * Strateji: robots.txt yalnız İÇERİK OLMAYAN alanları engeller (sepet/checkout/hesap/auth/api/design-system).
 * Arama/facet/sort/filtre kombinasyonlarının indexlenmemesi robots.txt'te DEĞİL, sayfa META-ROBOTS
 * (noindex,follow — lib/search/seo.ts) ile yönetilir: bir URL'i robots.txt ile bloklarsan Googlebot sayfayı
 * çekemez → üzerindeki `noindex`'i de göremez (ve link keşfi durur). Bu yüzden query-param sayfaları
 * ENGELLENMEZ, yalnız noindex'lenir; kanonik kategori sayfaları (`?category=`) crawl edilebilir kalır.
 *
 * Sitemap + host mutlak origin'den (site-url otoritesi).
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/cart", "/checkout", "/account", "/auth", "/api/", "/design-system"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
