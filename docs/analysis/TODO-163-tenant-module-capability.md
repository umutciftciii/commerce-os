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
