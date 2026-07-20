import { cache } from "react";
import type {
  PublicStoreInfo,
  PublicHeroSlidesResponse,
  PublicTheme,
} from "@commerce-os/api-client";
import type { StorefrontStoreInfo, StorefrontHeroSlide } from "../catalog-types";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Site-geneli marka bilgisi + ana sayfa hero
 * carousel'i veri cozumleyicileri. Gateway'in AUTH GEREKTIRMEYEN public
 * uclarindan (allowlist projeksiyon) okunur; hicbir ic/yonetim alani (mediaId/
 * storageKey/status) tasimaz. Hata/bos durumda vitrin ASLA kirilmaz: marka
 * bilgisi null → header kelime-isareti fallback; hero bos → statik hero fallback.
 */

/**
 * Public magaza marka bilgisi. `layout.tsx`'te hem `generateMetadata` (favicon/
 * title) hem `RootLayout` (SiteHeader) cagirir; `getPublic` no-store oldugundan
 * fetch dedup edilmez, bu yuzden React `cache()` ile SARILIR → tek render-pass'te
 * tek gateway cagrisi. Hata → null (header fallback'e duser).
 */
export const getStoreInfo = cache(async (): Promise<StorefrontStoreInfo | null> => {
  try {
    const result = await getPublic<PublicStoreInfo>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/store-info`,
    );
    if (!result.ok) return null;
    return {
      storeName: result.data.storeName,
      logoUrl: result.data.logoUrl,
      faviconUrl: result.data.faviconUrl,
    };
  } catch {
    return null;
  }
});

/**
 * TODO-158B (ADR-087) — Enterprise Theme Engine: mağazanın PUBLISHED temasının
 * SUNUCU-ÇÖZÜLMÜŞ CSS'i (custom property override bloğu). `layout.tsx` bunu
 * `<style>` olarak head'e enjekte eder → mevcut token-tabanlı bileşenler (header/
 * footer/hero/button/badge/product-card/category-card/section-title) TEK SATIR
 * değişmeden yeniden temalanır. `getStoreInfo` ile aynı render-pass'te tek çağrı
 * için `cache()` ile sarılır. Hata/tema-yok → null: vitrin globals.css varsayılan
 * token'larıyla AYNI görünür (asla kırılmaz, geriye-uyumlu).
 */
export const getStoreTheme = cache(async (): Promise<PublicTheme | null> => {
  try {
    const result = await getPublic<PublicTheme>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/theme`,
    );
    if (!result.ok) return null;
    return result.data;
  } catch {
    return null;
  }
});

/**
 * Public hero slide listesi (yalniz PUBLISHED, position ASC). Ana sayfa carousel'i
 * icin; hata/bos → bos dizi (home statik hero panel fallback'ine duser). Bu uc
 * yalniz ana sayfada cagrilir (layout degil) — hero site-geneli degil, sayfa-ozeldir.
 */
export async function getHeroSlides(): Promise<StorefrontHeroSlide[]> {
  try {
    const result = await getPublic<PublicHeroSlidesResponse>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/hero-slides`,
    );
    if (!result.ok) return [];
    return result.data.data.map((slide) => ({
      key: slide.key,
      mediaUrl: slide.mediaUrl,
      headline: slide.headline,
      subtext: slide.subtext,
      ctaLabel: slide.ctaLabel,
      ctaHref: slide.ctaHref,
    }));
  } catch {
    return [];
  }
}
