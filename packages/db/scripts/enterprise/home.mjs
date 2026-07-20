/**
 * TODO-158A (ADR-086) — Enterprise Demo Home Experience içeriği.
 *
 * Deterministik ana sayfa section'ları (hero + featured kategoriler + showcase'ler) üretir.
 * Gerçek enterprise-demo katalog/kampanya verisiyle uyumlu: featured 6 üst kategori,
 * showcase'ler dinamik kural (yeni/kampanya/kategori) + biri MANUEL (ilk ürünler).
 * Hero için 3 adet HERO-context MediaAsset (placeholder SVG) üretilir.
 */
import { STORE_ID, ID } from "./constants.mjs";

const HERO_MEDIA = [
  { slug: "home-hero-1", headline: "Yeni Sezon Teknoloji", subtext: "En yeni cihazlar, en iyi fiyatlarla.", ctaLabel: "Keşfet", ctaHref: "/products" },
  { slug: "home-hero-2", headline: "Kampanya Zamanı", subtext: "Seçili ürünlerde büyük fırsatlar.", ctaLabel: "Fırsatları Gör", ctaHref: "/products" },
  { slug: "home-hero-3", headline: "Ev & Yaşam", subtext: "Yaşam alanını yenile.", ctaLabel: "Alışverişe Başla", ctaHref: "/products?category=ev-ve-yasam" },
];

// 6 showcase (brief) — biri MANUEL, kalanı dinamik kural.
const SHOWCASES = [
  { key: "yeni-gelenler", title: "Yeni Gelenler", subtitle: "Vitrinde", layout: "CAROUSEL", source: { kind: "DYNAMIC", rule: "NEW_PRODUCTS", params: {} } },
  { key: "kampanyali", title: "Kampanyalı Ürünler", subtitle: "Fırsat", layout: "CAROUSEL", source: { kind: "DYNAMIC", rule: "CAMPAIGN", params: {} } },
  { key: "oyuncu-dunyasi", title: "Oyuncu Dünyası", subtitle: "Elektronik", layout: "GRID", source: { kind: "DYNAMIC", rule: "CATEGORY", params: { categorySlug: "elektronik" } } },
  { key: "premium-secimler", title: "Premium Seçimler", subtitle: "Editör seçimi", layout: "CAROUSEL", source: { kind: "MANUAL" } },
  { key: "ev-yasam", title: "Ev Yaşam", subtitle: "Yaşam", layout: "GRID", source: { kind: "DYNAMIC", rule: "CATEGORY", params: { categorySlug: "ev-ve-yasam" } } },
  { key: "moda", title: "Moda", subtitle: "Stil", layout: "CAROUSEL", source: { kind: "DYNAMIC", rule: "CATEGORY", params: { categorySlug: "moda" } } },
];

/**
 * Dataset'ten (ds) home içeriğini türetir. Döner:
 *  { homePage, heroMedia, sections, heroSlides, featuredCategories, showcaseProducts }
 * heroMedia AYRICA ds.media'ya eklenmelidir (placeholder + MediaAsset yazımı için) — persist.mjs yapar.
 */
export function buildHomeData(ds) {
  const now = new Date("2026-06-01T00:00:00.000Z");

  const homePage = { storeId: STORE_ID };

  // 3 HERO-context media (placeholder SVG; writePlaceholders bunları da yazar).
  const heroMedia = HERO_MEDIA.map((h) => ({
    id: ID.media(h.slug),
    storeId: STORE_ID,
    context: "HERO",
    storageKey: `enterprise-demo/placeholder/${h.slug}.svg`,
    mimeType: "image/svg+xml",
    byteSize: 900,
    width: 1600,
    height: 700,
  }));

  const sections = [];
  const heroSlides = [];
  const featuredCategories = [];
  const showcaseProducts = [];

  let order = 0;

  // 1) HERO_SLIDER
  const heroSectionId = "edm-home-sec-hero";
  sections.push({
    id: heroSectionId,
    storeId: STORE_ID,
    type: "HERO_SLIDER",
    title: null,
    subtitle: null,
    enabled: true,
    sortOrder: order++,
    desktopVisible: true,
    mobileVisible: true,
    config: { autoplayMs: 6000 },
    createdAt: now,
    updatedAt: now,
  });
  HERO_MEDIA.forEach((h, i) => {
    heroSlides.push({
      id: `edm-home-hero-${i + 1}`,
      storeId: STORE_ID,
      sectionId: heroSectionId,
      mediaId: ID.media(h.slug),
      mobileMediaId: null,
      videoUrl: null,
      headline: h.headline,
      subtext: h.subtext,
      ctaLabel: h.ctaLabel,
      ctaHref: h.ctaHref,
      targetProductId: null,
      targetCategoryId: null,
      targetCampaignId: null,
      enabled: true,
      sortOrder: i,
      publishStart: null,
      publishEnd: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  // 2) FEATURED_CATEGORIES — ilk 6 üst kategori (parentId null).
  const featuredSectionId = "edm-home-sec-featured";
  sections.push({
    id: featuredSectionId,
    storeId: STORE_ID,
    type: "FEATURED_CATEGORIES",
    title: "Kategoriler",
    subtitle: "Keşfet",
    enabled: true,
    sortOrder: order++,
    desktopVisible: true,
    mobileVisible: true,
    config: {},
    createdAt: now,
    updatedAt: now,
  });
  const topCategories = ds.categories.filter((c) => c.parentId === null).slice(0, 6);
  topCategories.forEach((cat, i) => {
    featuredCategories.push({
      id: `edm-home-feat-${i + 1}`,
      storeId: STORE_ID,
      sectionId: featuredSectionId,
      categoryId: cat.id,
      imageMediaId: null,
      titleOverride: null,
      descriptionOverride: null,
      enabled: true,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    });
  });

  // 3) 6 PRODUCT_SHOWCASE
  const manualProductIds = ds.products.slice(0, 8).map((p) => p.id);
  SHOWCASES.forEach((sc) => {
    const sectionId = `edm-home-sec-${sc.key}`;
    sections.push({
      id: sectionId,
      storeId: STORE_ID,
      type: "PRODUCT_SHOWCASE",
      title: sc.title,
      subtitle: sc.subtitle,
      enabled: true,
      sortOrder: order++,
      desktopVisible: true,
      mobileVisible: true,
      config: { layout: sc.layout, maxItems: 12, source: sc.source },
      createdAt: now,
      updatedAt: now,
    });
    if (sc.source.kind === "MANUAL") {
      manualProductIds.forEach((productId, i) => {
        showcaseProducts.push({
          id: `edm-home-sc-${sc.key}-${i + 1}`,
          storeId: STORE_ID,
          sectionId,
          productId,
          sortOrder: i,
          createdAt: now,
        });
      });
    }
  });

  return { homePage, heroMedia, sections, heroSlides, featuredCategories, showcaseProducts };
}
