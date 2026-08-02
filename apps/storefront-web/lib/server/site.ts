import { cache } from "react";
import { cookies } from "next/headers";
import type {
  PublicStoreInfo,
  PublicStoreCapabilitiesResponse,
  PublicTheme,
} from "@commerce-os/api-client";
import type { StorefrontStoreInfo } from "../catalog-types";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";

/**
 * TODO-163 Faz 2 (ADR-213) — Vitrin capability projeksiyonu. Gateway'in public
 * `/public/stores/:slug/modules` ucundan (yalnız moduleKey→boolean) okunur; source/plan
 * SIZMAZ. `getStoreInfo` gibi `cache()`'li → render-pass'te tek çağrı. Server-side
 * enforcement OTORİTATİF gateway'dedir (kapalı modül 404/boş döner); bu projeksiyon UI
 * gizleme + gereksiz fetch'ten kaçınma içindir. HATA/eksik key → `true` (göster): projeksiyon
 * hatası özelliği YANLIŞLIKLA gizlemesin (gateway yine de gerçek veriyi kapatır; regresyonsuz).
 */
export const getStoreCapabilities = cache(async (): Promise<Record<string, boolean>> => {
  try {
    const result = await getPublic<PublicStoreCapabilitiesResponse>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/modules`,
    );
    if (!result.ok) return {};
    return result.data.data.modules;
  } catch {
    return {};
  }
});

/** Tek modül vitrinde gösterilmeli mi? Bilinmeyen/eksik/hata → true (göster; gateway otoriter). */
export async function isStorefrontModuleEnabled(moduleKey: string): Promise<boolean> {
  const modules = await getStoreCapabilities();
  return modules[moduleKey] !== false;
}

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
    // TODO-164A — Builder preview izolasyonu: kısa ömürlü preview cookie'si varsa
    // DRAFT projeksiyonunu çek (imzalı, store+theme scoped token; prod cache'ten AYRI).
    // Yoksa yayınlanmış temayı çek. Production storefront (cookie yok) etkilenmez.
    const previewToken = (await cookies()).get("cos_theme_preview")?.value;
    if (previewToken) {
      const preview = await getPublic<PublicTheme>(
        `/public/theme-preview?token=${encodeURIComponent(previewToken)}`,
      );
      if (preview.ok) return preview.data;
      // Token geçersiz/süresi dolmuş → normal yayına düş (sessizce).
    }
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
 * TODO-164A — SUNUCU tarafı slot variant çözümü (RSC'ler için; `useSlotVariant`
 * yalnız client island'larda çalışır). PUBLISHED temanın `slots` haritasından
 * server-authoritative variant'ı okur; yoksa `fallback`. `getStoreTheme` cache'li
 * → ekstra istek yok. Presentation-only (yalnız `data-*` sürer).
 */
export async function getServerSlotVariant(slot: string, fallback: string): Promise<string> {
  const theme = await getStoreTheme();
  const value = theme?.slots?.[slot];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

// Final Polish §5 — Legacy `getHeroSlides()` (eski `/public/.../hero-slides` ucunu okurdu)
// KALDIRILDI: storefront hero'yu artık yalnız HomeSection (`getHome` → `HERO_SLIDER`)
// besler; bu fonksiyonun hiç çağrılmadığı kanıtlandı (orphaned). Store-admin'deki
// yinelenen "Ana Sayfa" yönetim ekranı da kaldırıldı (`/hero` → `/home` redirect).
