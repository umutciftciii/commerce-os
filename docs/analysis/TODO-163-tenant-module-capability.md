# TODO-163 — Tenant Module & Capability Management (Analiz + Tasarım)

**Durum:** IN_PROGRESS (Faz 1 — thin vertical slice teslim edildi; gate'ler yeşil).
**Tarih:** 2026-07-30. **ADR:** ADR-208…ADR-210. **Son ADR (önce):** ADR-207.

## 1. Amaç

Modular ürün kimliğinin **"mağaza-bazlı capability"** sütununu inşa etmek: her tenant'ın
(mağaza) hangi modüle/yeteneğe sahip olduğunu **sunucu-otoriter** bir katmandan türetmek.
storefront/store-admin/gateway bu türetilmiş yeteneklere göre davranır; **core içinde ürün
veya müşteri adına göre koşul yazılmaz** — yalnız modül anahtarlarına bakılır.

## 2. Mevcut durum (5-ajanlı kod denetimi)

- **Greenfield.** Capability/module/entitlement/feature-flag/tier/vertical adında **hiçbir
  tenant-seviyesi model/alan/enum yoktu.** `Store` (id/name/slug/status/`metadata Json?`) +
  tekil `StoreSettings` (PK=FK, lazy) + bağlanmamış `Plan`/`Subscription` iskeleti (`code` +
  `metadata Json?`; gating'e bağlı DEĞİL).
- **Gateway** monolitik Fastify; store context iki otoriter noktada çözülür:
  `requireStorePlatformAdmin(req,reply,storeId)` (admin, ~30 çağrı) ve `resolvePublicStore(slug)`
  (public, yalnız ACTIVE). Data-access `AppDataAccess` soyutlaması üzerinden (test'te
  `MemoryDataAccess`).
- **store-admin BFF** `store-context.ts` → `/api/store/context`. **StoreNav** tamamen statik
  hardcoded (capability-driven gizleme için doğal nokta). Yönetim UI için `data-grid/`
  (ADR-089) + `selector/` (ADR-090) hazır.
- Bugün mağaza-bazlı gating YOK; `libraryEnabled` ilgisiz bir MediaUpload UI prop'u.

## 3. Karar (kullanıcı onaylı)

- **Depolama:** adanmış tablo (`StoreModule`, sparse override satırları).
- **Kapsam:** tam ince dikey dilim (registry + resolver + testler → gateway enforcement →
  BFF context → StoreNav gizleme → store-admin yönetim ekranı).

## 4. Mimari

Üç katman:

1. **Tipli registry (kod, WHAT-var tek otorite)** — `apps/api-gateway/src/capabilities/registry.ts`.
   14 modül; her biri `core` (kapatılamaz), `baselineEnabled`, opsiyonel `requires`. `moduleKey`
   serbest string değil; bu registry'ye karşı doğrulanır (ADR-180 tipli-token deseniyle simetrik).
2. **Saf resolver** — `resolver.ts`. Effective = **store override > plan default > registry
   baseline**, sonra **dependency pass** (gereken modül kapalıysa bağımlı kapanır). SAF (IO yok);
   bilinmeyen key fail-closed. `resolveEffectiveModules` + `isModuleEnabled` + `extractPlanModuleDefaults`.
3. **Persistence + orkestrasyon** — `data.ts`. Persistence gateway `AppDataAccess` üzerinden
   ENJEKTE edilir (raw Prisma değil) → in-memory test harness'i ile birebir çalışır. `StoreModule`
   satırları sparse (INHERIT → satır silinir). Plan default'u aktif aboneliğin (ACTIVE/TRIALING)
   `Plan.metadata.modules`'ından türetilir.

**Enforcement** — `routes.ts`:
- `GET /stores/:storeId/modules` (admin) → effective matris (+ source + overrideState + blockedBy).
- `PUT /stores/:storeId/modules/:moduleKey` (admin) → override set. core → 409, unknown → 404.
- `createRequireCapability(data)` → feature route'larında effective KAPALI → **403 CAPABILITY_DISABLED**.
  Temsili uygulama: `/stores/:storeId/payment-providers` GET+POST (`payments` modülü).

**BFF + UI (store-admin):**
- `/api/store/modules` (GET/PUT) → gateway proxy (token/store server-side). api-client
  `admin.modules.{list,setOverride}`.
- Yönetim ekranı `/modules` (grup bazlı matris + INHERIT/ENABLED/DISABLED select; effective
  rozet + source; core devre dışı).
- **StoreNav** effective KAPALI modüle eşleşen item'ları gizler (güvenlik değil, sunum;
  enforcement gateway'de). Boş gruplar atılır.

## 5. Geriye uyumluluk (regresyon yok)

Tüm non-core modüller **baseline ENABLED**. Override/plan yokken effective davranış MEVCUT
davranışın aynısıdır (nav'da her şey görünür; hiçbir uç kapalı değil). Migration **additive**
(yalnız yeni `StoreModule` tablosu + `StoreModuleState` enum; mevcut tablolara dokunmaz).
Bir modül ancak açık override veya plan default ile KAPATILIR.

## 6. Migration

`20260730130000_add_tenant_module_capability` — `StoreModuleState` enum + `StoreModule` tablosu
(`@@unique([storeId, moduleKey])`, `@@index([storeId])`, Store FK cascade). **Gerçek Postgres'te
uygulandı + doğrulandı** (tablo + enum + 2 index + FK; `prisma migrate status` up-to-date).

## 7. Testler (gate yeşil)

- `capabilities-core.test.ts` (16) — registry bütünlüğü, core-daima-açık, baseline geriye
  uyumlu, öncelik, dependency pass, fail-closed, plan metadata çıkarımı.
- `capabilities-routes.test.ts` (12) — data orkestrasyonu (öncelik/sparse/core-immutable/unknown)
  + HTTP (matris GET, override PUT, 409/404/400, guard 401, enforcement 403/200).
- Regresyon: api-gateway **1803 test PASS** (104 dosya); build (tsc) temiz; store-admin/contracts/
  api-client lint + build temiz.

## 8. Kalan (sonraki oturum / TD)

- Enforcement'ı temsili payment-providers dışına yaymak (kalan admin feature route'ları +
  public storefront hot-path'te opsiyonel gating — perf için cache).
- storefront tarafında kapalı modüllerin public yüzeyden gizlenmesi (home/reviews/campaigns).
- Plan → capability yönetim UI'si (plan.metadata.modules editörü).
- TODO-164 (Tenant Theme Architecture) bu capability temeli üstüne kurulacak.

---

## Faz 2 — Enforcement Expansion & Storefront Capability Runtime (ADR-211…ADR-213)

**Durum:** teslim edildi; gate'ler yeşil + canlı smoke PASS. TODO-163 hâlâ IN_PROGRESS
(kalan: TD-153…TD-156).

### Yapılanlar
1. **Taksonomi (ADR-211).** 12 CORE + 16 OPTIONAL uppercase-snake anahtar + tam dependency grafiği
   (`registry.ts`). Resolver dependency-pass transitif kapatır (fixpoint). Geriye uyumlu (baseline ON).
2. **Gateway server-side enforcement.** Register-modül deps'leri `requireStoreAdminForModule` /
   `resolvePublicStoreForModule` ile sarıldı → admin **403 MODULE_DISABLED**, public **404 leak-siz**.
   Inline public read'ler (home/hero/theme/campaigns/discovery) kapalıyken **graceful boş/base**.
   CORE (shipping/reservation/backup/webhook) gate YOK.
3. **Cache (ADR-213).** `capabilities/cache.ts` store-scoped 30s TTL; mutation→explicit invalidate;
   DB hatası→fail-closed (core açık, non-core kapalı, hata cache'lenmez); cross-store leak yok.
4. **Public projeksiyon.** `GET /public/stores/:slug/modules` (boolean-only) + storefront
   `getStoreCapabilities()`/`isStorefrontModuleEnabled()`; account sidebar/section + wishlist kalp gizleme.
5. **Parent-disable guard (ADR-212).** Aktif dependent varken DISABLE → 409 DEPENDENTS_ACTIVE +
   `disable-preview` + `cascade` onayı. Sessiz cascade yok.

### Doğrulama
- Testler: capability-core (18) + capability-routes/cache (16); api-gateway **1809** · storefront **446**
  · store-admin **356** PASS; tam workspace build + lint temiz; migration DEĞİŞMEDİ (Faz 1 tablosu).
- **Canlı smoke (yerel gateway → docker postgres, enterprise-demo):**
  - REVIEWS DISABLED → public projeksiyon `REVIEWS:false`, public reviews list **HTTP 404**, store-info
    (core) **200**.
  - HOME_EXPERIENCE+THEME_STUDIO+CAMPAIGNS DISABLED → `/home` **0 section** (graceful fallback), `/theme`
    **200** (base), `/campaigns` **0 slide**; projeksiyonda **SPONSORED_PRODUCTS & INFLUENCER_TRACKING
    false (dependency cascade)**.
  - REVIEWS DELETE (re-enable) → reviews list **200** (veri geri geldi; disable veriyi SİLMEZ).
  - Temizlik: tüm StoreModule satırları silindi → enterprise-demo FULL_PLATFORM; `migrate status` up-to-date.

### Kalan (TD-153…TD-156)
Worker per-store `SKIPPED_DISABLED` · plan→capability editörü UI · store-admin per-page direct-URL
guard · kalan storefront render gate'leri (tracker/sponsored/influencer redirect). Tamamlanınca CLOSED.

---

## Faz 3 — Enforcement Closure (ADR-214…ADR-215)

**Durum:** teslim edildi; tüm gate'ler yeşil + canlı smoke PASS. **TODO-163 CLOSED.**

### Yapılanlar
1. **Worker per-store skip (TD-153 · ADR-214).** Paylaşılan `capabilities/worker-gate.ts`
   (`createWorkerCapabilityGate(prisma)` → StoreModule + aktif Subscription.Plan.metadata sorgularından
   `createStoreModuleData`+`createCapabilityCache`; store-scoped, bounded TTL, fail-closed, tenant-safe,
   OKUMA-yalnız) `main.ts`'te TEK kez kurulup 6 opsiyonel worker'a enjekte edildi. Kapalı store →
   MUTATION YOK + `SKIPPED_DISABLED` (QueueJobLog `payload.outcome`; status COMPLETED; retry yok).
   Attribution retention per-tablo (SPONSORED_PRODUCTS/INFLUENCER_TRACKING). CORE worker'lar gate'siz.
2. **Store-admin direct-URL guard (TD-155 · ADR-214).** `lib/store-modules.ts` (route→modül tek otorite)
   + `lib/server/module-access.ts` (cache()'li matris) + async server component `components/module-guard.tsx`
   + 14 opsiyonel route klasörüne `layout.tsx` guard. Kapalı modül sayfası data fetch/render YAPMAZ
   (doğrudan URL de kapalı). Menü gizlemeye EK sunucu-tarafı savunma; gateway BFF otoriter kalır.
3. **Kalan storefront gate'leri (TD-156).** PDP (tracker/similar/reviews), home (discovery/ratings/
   recently-viewed/sponsored), PLP + discovery-list (ratings/wishlist), cart rail, nested WishlistProvider'lar,
   influencer `/t/[token]` fail-closed. Gateway sponsored TOKEN üretimi home/discovery/search'te
   SPONSORED_PRODUCTS'a bağlı (kapalı → token yok → rozet/beacon yok).
4. **Plan → capability editörü (TD-154 · ADR-215).** SAF `capabilities/plan-capabilities.ts`
   (required/optional/unavailable ↔ boolean; core-unavailable/unknown/invalid-dependency doğrulama; preview
   dependency-pass; merge) + gateway `/admin/plans/:id/capabilities` (platform-admin; audit; MERGE; cache clear)
   + api-client `admin.plans.capabilities.{get,preview,apply}` + platform-admin PlanEditor matris UI.

### Doğrulama
- **Testler:** api-gateway **1831** (capability-worker-gate 6 + capability-plan 15 + recommendation gate 2 yeni)
  · storefront **446** · store-admin **360** (ModuleGuard+StoreNav 4 yeni) · admin-web **24** PASS.
- **Gate:** build 27/27 · lint 0 error · `prisma migrate status` up-to-date (migration DEĞİŞMEDİ) ·
  `git diff --check` temiz.
- **Canlı smoke (enterprise-demo/edm-store → docker postgres):** worker gate CAMPAIGNS off → SPONSORED/
  INFLUENCER dependency-off + core açık; re-enable → veri geri. Plan capability: preview (changed + dependency
  + core-unavailable reddi) + subscriber count; apply REVIEWS unavailable → MERGE (`{"seeded":"enterprise-demo"}`
  metadata KORUNDU) + plan-default worker gate'te yansıdı; restore → FULL_PLATFORM + metadata geri.

### Kalan (opsiyonel, kapsam dışı)
Store-admin/storefront canlı TARAYICI click-through (store-admin parola TD-126 → Final UI Polish); commit/PR/
deploy (git kuralı gereği bu aşamada YAPILMADI). TODO-164 Tenant Theme Architecture bu temel üstüne kurulacak.
