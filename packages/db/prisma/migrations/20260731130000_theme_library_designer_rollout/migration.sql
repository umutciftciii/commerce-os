-- TODO-164B Dilim 2 (ADR-238…245) — Platform Theme Library, Designer & Controlled Rollout.
-- ADDITIVE + IMMUTABLE migration. Hiçbir kolon düşürülmez/yeniden adlandırılmaz; tüm
-- yeni kolonlar nullable ya da güvenli DEFAULT'ludur → mevcut satırlar korunur, hiçbir
-- storefront görünümü değişmez (mevcut published tema aynen render edilir).
--
-- Theme.policyRevision: override policy revizyon sayacı (audit + policy before/after).
--   0 = policy hiç değişmedi. Her policy güncellemesinde +1.
--
-- ThemeVersion.stagedLogoMediaId / stagedFaviconMediaId (TD-162): logo/favicon DRAFT
--   staging. Kalıcı otorite StoreSettings kalır; bunlar yalnız draft sürecinde sahnelenir
--   ve publish anında ATOMİK olarak StoreSettings'e uygulanır. NULL → sahnelenmedi.
-- ThemeVersion.assetSnapshot: publish anında yakalanan önceki StoreSettings asset görünümü
--   ({logoMediaId, faviconMediaId}) — rollback bu snapshot'a döner. NULL → asset publish edilmedi.

ALTER TABLE "Theme" ADD COLUMN "policyRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ThemeVersion" ADD COLUMN "stagedLogoMediaId" TEXT;
ALTER TABLE "ThemeVersion" ADD COLUMN "stagedFaviconMediaId" TEXT;
ALTER TABLE "ThemeVersion" ADD COLUMN "assetSnapshot" JSONB;
