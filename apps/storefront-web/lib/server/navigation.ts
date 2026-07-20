import { cache } from "react";
import type { CampaignLabelLocale } from "@commerce-os/utils";
import type { StorefrontHomeFeaturedCategory } from "../catalog-types";
import { getHome } from "./catalog";

/**
 * TODO-158C (ADR-088) — Header kategori mega-menü kaynağı.
 *
 * Kategori AĞACI public bir uçtan YAYINLANMAZ (admin `/stores/:id/categories` auth arkasında;
 * search facet'leri yalnız dinamik attribute'lardır — kategori değil). Bu faz storefront deneyimini
 * geliştirir, search/katalog iş mantığına DOKUNMAZ. Bu yüzden mega-menü, admin-yönetimli ve zaten
 * public olan FEATURED_CATEGORIES home section'ından beslenir (gerçek veri, curated). Yapılandırılmamış
 * mağazada boş döner → header sade "Tüm Ürünler" nav'ına düşer (asla kırılmaz).
 *
 * `getHome` React `cache()`'li olduğundan ana sayfada gövde ile PAYLAŞILIR (çift /home fetch yok).
 * Adanmış hafif public kategori-navigasyon ucu = TD-088 (perf takibi).
 */
export const getNavCategories = cache(async function getNavCategories(
  locale: CampaignLabelLocale = "tr",
): Promise<StorefrontHomeFeaturedCategory[]> {
  const home = await getHome(locale);
  const merged: StorefrontHomeFeaturedCategory[] = [];
  const seen = new Set<string>();
  for (const section of home.sections) {
    if (section.type !== "FEATURED_CATEGORIES") continue;
    for (const category of section.categories) {
      if (seen.has(category.href)) continue;
      seen.add(category.href);
      merged.push(category);
    }
  }
  return merged;
});
