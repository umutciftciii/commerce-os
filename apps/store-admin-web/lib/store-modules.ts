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
};
