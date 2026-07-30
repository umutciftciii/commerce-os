-- TODO-164B (ADR-232/233/234) — Theme Builder Productization & Role Separation.
-- ADDITIVE + IMMUTABLE migration. Hiçbir kolon düşürülmez/yeniden adlandırılmaz;
-- tüm yeni kolonlar nullable ya da güvenli DEFAULT'ludur → mevcut satırlar korunur,
-- hiçbir storefront görünümü değişmez.
--
-- Store.systemPurpose: sistem mağazası işareti (normal mağazalar NULL). Örn.
--   "THEME_LIBRARY" = Platform Admin tema template'lerini tutan sentetik mağaza.
--   Uygulama katmanı bu mağazaları normal listelerden/resolver'dan dışlar.
--
-- Theme.ownerScope: "STORE" (varsayılan; mağaza teması) | "PLATFORM" (kütüphane).
-- Theme.overridePolicy: Store Admin alan yetkileri (JSON; NULL → hepsi editable).
-- Theme.sourceThemeId / sourceThemeVersion: mağaza temasının türetildiği platform
--   template + sürümü (update-available hesabı). NULL → bağımsız mağaza teması.

ALTER TABLE "Store" ADD COLUMN "systemPurpose" TEXT;

ALTER TABLE "Theme" ADD COLUMN "ownerScope" TEXT NOT NULL DEFAULT 'STORE';
ALTER TABLE "Theme" ADD COLUMN "overridePolicy" JSONB;
ALTER TABLE "Theme" ADD COLUMN "sourceThemeId" TEXT;
ALTER TABLE "Theme" ADD COLUMN "sourceThemeVersion" INTEGER;

CREATE INDEX "Theme_ownerScope_idx" ON "Theme"("ownerScope");
