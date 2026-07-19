import type { MetadataRoute } from "next";
import { absoluteUrl } from "../lib/seo/site-url";
import { homePath, productsPath, productPath } from "../lib/seo/routes";
import { getStorefrontListing } from "../lib/server/catalog";

/**
 * TODO-156D (brief §10) — Sitemap üretimi.
 *
 * İçerik: statik sayfalar (ana sayfa, tüm ürünler) + yayınlanabilir ÜRÜN detayları (public listing ucundan).
 * Yalnız INDEXLENEBİLİR kanonik URL'ler girer: ürün detay + düz PLP (arama/facet/sort URL'leri GİRMEZ —
 * onlar noindex). Kategori URL'leri (`?category=`) indexlenebilir olsa da public kategori-listeleme ucu
 * henüz yok → sitemap'e eklenmez (TECHNICAL_DEBT: kategori sitemap genişlemesi bir public categories ucu
 * gerektirir). Future CMS sayfaları da aynı desenle eklenebilir (genişlemeye açık).
 *
 * Boş sitemap ASLA oluşmaz: listing hata/boş olsa da statik girişler daima döner. lastmod listing'de
 * bulunmadığından (public DTO taşımıyor) atlanır — yanlış tarih vermektense alan yok.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl(homePath()), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl(productsPath()), changeFrequency: "daily", priority: 0.9 },
  ];

  const listing = await getStorefrontListing();
  if (listing.ok) {
    for (const product of listing.data) {
      entries.push({
        url: absoluteUrl(productPath(product.handle)),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
