// TODO-163 (ADR-208…ADR-213 · Faz 3 ADR-214) — Store-admin route → capability anahtarı eşlemesi.
//
// TEK OTORİTE: hem kenar menü gizleme (client `StoreNav`) hem de sunucu-tarafı sayfa guard'ı
// (`ModuleGuard` + route `layout.tsx`) bu haritayı paylaşır → drift YOK. Anahtarlar gateway
// registry'siyle (uppercase-snake) BİREBİR. Eşlemesi olmayan rota (dashboard/ayarlar/modül
// yönetimi/çekirdek katalog) her zaman görünür. Effective durum SUNUCUDA türetilir; bu harita
// yalnız hangi rotanın hangi modüle ait olduğunu söyler (güvenlik enforcement gateway'de).

/** Rota href/prefix → gateway modül anahtarı (opsiyonel modüller). */
export const HREF_MODULE: Record<string, string> = {
  "/inventory": "MULTI_WAREHOUSE",
  "/size-charts": "FASHION_VERTICAL",
  // TODO-165A (ADR-165A) Task 24 — Ürün Sözlükleri (governed Product Taxonomy: Sezon/
  // Koleksiyon/Materyal/Kalıp/Desen/Yaka/Kol/Boy/Bakım/Sürdürülebilirlik/Renk Ailesi).
  "/product-dictionaries": "FASHION_VERTICAL",
  // TODO-165A (ADR-165A) Task 15/16 — Marka (Brand). CATALOG çekirdek/always-on modüldür;
  // burada listelenmesi yalnız `ModuleGuard`/`StoreNav` ile AYNI OTORİTEyi paylaşmak
  // içindir (drift yok) — effective her zaman AÇIK, item asla gizlenmez.
  "/brands": "CATALOG",
  "/reviews": "REVIEWS",
  "/campaigns": "CAMPAIGNS",
  "/influencers": "INFLUENCER_TRACKING",
  "/influencer-campaigns": "INFLUENCER_TRACKING",
  "/sponsors": "SPONSORSHIP_FINANCE",
  "/sponsorship-agreements": "SPONSORSHIP_FINANCE",
  "/sponsored-products": "SPONSORED_PRODUCTS",
  "/sponsorship-settlements": "SPONSORSHIP_FINANCE",
  "/sponsorship-payments": "SPONSORSHIP_FINANCE",
  "/home": "HOME_EXPERIENCE",
  "/hero": "HOME_EXPERIENCE",
  "/theme": "THEME_STUDIO",
  "/operations": "OPERATIONS_ADVANCED",
  // TODO-178 (Faz D) — Platform Talepleri (mağaza → platform operasyonel talep/görev sistemi).
  // Product Support (müşteri → mağaza) ile karışmaz; ayrı domain, ayrı capability.
  "/platform-requests": "PLATFORM_REQUESTS",
};
