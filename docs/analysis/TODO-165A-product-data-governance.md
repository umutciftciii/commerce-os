# TODO-165A — Product Data Governance & Editing UX Recovery · Analiz & Tasarım

> Durum: **IMPLEMENTED** (uçtan uca GERÇEK browser + GERÇEK DB smoke geçti; tam gate GREEN;
> commit/push/PR/deploy YOK). Detay/kanıt: `docs/ROADMAP.md` TODO-165A bloğu + `docs/OPERATIONS.md`
> TODO-165A runbook'u + SDD ledger `.superpowers/sdd/2026-08-01-todo-165a-product-data-governance/progress.md`
> (Task 29 tam gate + Task 30 gerçek browser smoke + Task 31 güvenlik doğrulaması). Bu doküman,
> TODO-165A'nın Brand governance + fashion sözlük governance + size-chart selector UX tasarım
> sözleşmesini kayıt altına alır.
>
> **Kapsam sınırı**: Marketplace repository'ye DOKUNULMAZ. TODO-166 (gelecek kapsam) başlanmaz.
> Final Enterprise UI & Design Polish başlanmaz. Mevcut EAV/capability/size-chart/tenant mimarisi
> **yeniden kurulmaz** — Brand ve ProductTaxonomyValue, mevcut motorların ÜSTÜNE eklenen iki
> governance katmanıdır, paralel bir sistem değil.

---

## 0. Yönetici özeti — en kritik tasarım kararı

TODO-165 (Fashion Vertical Foundation) serbest-metin `Product.brand` string'i ve sabit-kod
fashion sözlüklerini (season/collection/material/fit/…) bıraktı. TODO-165A bu ikisini
**store-yönetilebilir governance** katmanlarına taşır, hiçbir çekirdek motoru değiştirmeden:

1. **Brand**: yeni store-scoped `Brand` modeli + nullable `Product.brandId` (relation adı
   `governedBrand` — mevcut skaler `brand String?` alan adıyla çakışmamak için). Legacy `brand`
   string'i **dormant read-model** olarak KORUNUR (dual-write: brand set edilince `brand` =
   `brand.name`). Public DTO'lara **additive** `brandRef` (yalnız ACTIVE marka) eklenir; search
   read-model brand alanlarını denormalize eder → PLP brand facet + `/markalar/[slug]`.
2. **ProductTaxonomyValue**: yeni store-scoped **governance authority** — her satır kendi
   store-scoped `AttributeOption`'ını (1:1) SAHİPLENİR; PLATFORM `fashion.*`
   `AttributeDefinition`'ları altında. Ürün ataması **değişmeden** mevcut
   `attributeValueService` → `ProductAttributeValue.optionId` üzerinden akar — PDP/PLP/facet/
   order-snapshot **dokunulmadan** çalışmaya devam eder. Global kanonik opsiyonlar
   (`storeId NULL`) legacy/varsayılan okuma kaynağı olarak kalır; resolver
   **store-scoped-governed > global-canonical** önceliğiyle value'ya göre de-dupe eder.
   Governed opsiyonlar YALNIZ taxonomy servisinden mutasyona uğrar (`409
   ATTRIBUTE_OPTION_GOVERNED` generic endpoint'lerde).
3. **Size-chart binding**: mevcut `SizeChart*` modelleri/servisi REUSE — yalnız atama UX'i
   (raw ID input yerine searchable selector) + yeni bir seçici endpoint eklendi. Bu çalışma
   sırasında TODO-165'in size-chart kodunda **iki gerçek bug** bulundu ve düzeltildi (bkz. §7 ve
   `docs/analysis/TODO-165-fashion-vertical-foundation.md` "TODO-165A follow-up" notu).

**Yeni motor YOK.** Attribute/EAV, capability, size-chart, tenant-guard, search read-model,
selector (ADR-090) — hepsi reuse.

---

## 1. Brand domain modeli

- `Brand` (`packages/db/prisma/schema.prisma:4643`): store-scoped (`storeId`), `name`, `slug`
  (`@@unique([storeId, slug])`), `description?`, `logoMediaId?`/`coverMediaId?` (→ `MediaAsset`,
  `onDelete: SetNull`), `websiteUrl?`, `status BrandStatus` (`ACTIVE|ARCHIVED`), `seoTitle?`,
  `seoDescription?`. `Store.brands` back-relation. Store silinince Brand CASCADE kalkar.
- `Product.brandId String?` (`schema.prisma:1149`) + relation `governedBrand Brand?
  @relation(fields:[brandId], onDelete: SetNull)` — relation adı bilinçli olarak `governedBrand`
  (skaler `brand String?` alan adıyla Prisma çakışmasını önlemek için). Marka silinince ürün
  markasız kalır, ürün SİLİNMEZ. `@@index([storeId, brandId])`.
- **Legacy dual-write**: `brand` (eski serbest-metin string) DORMANT tutulur — brandId set
  edilince/güncellenince `brand` alanına `brand.name` transitionally yazılır (geriye-uyum:
  eski okuyucular — ör. admin ürün LIST — kırılmaz). Yeni yazma yolu YALNIZ `brandId` üzerinden.
- `ProductSearchDocument` (`schema.prisma:3717`) `brandId/brandSlug/brandName` denormalize
  kolonları (ADDITIVE; eski `brand` string kolonu da ayrıca var — reindex ikisini bağımsız
  yazar) → PLP brand facet + `/markalar/[slug]` + `Similar Products Tier 3` (aynı marka).
- Servis: `apps/api-gateway/src/brand/{brand-data.ts,brand-service.ts,brand-routes.ts}`
  (mirror `fashion/size-chart-*`) — CRUD + list + selector + product-count +
  `listProducts` (gerçek sayfalanmış ürün listesi, Task 6'daki count-only ilk sürümün
  yerini aldı). Slug `@commerce-os/utils` slugify (auto-suffix yok — çakışma 409).
- Route gate: `CATALOG` (her zaman açık core modül) — Brand yönetimi FASHION_VERTICAL'a
  bağlı DEĞİL, tüm mağazalar kullanabilir.
- Public: `GET /public/stores/:slug/brands` (yalnız ACTIVE + ≥1 görünür ürün) +
  `.../brands/:brandSlug` (detay+productCount, 404 leak-free). `buildPublicProduct` +
  arama `toPublicProduct` her ikisi de `brandRef` (ACTIVE-only, arşivli marka → null,
  404 sayfasıyla tutarlı) doldurur; `loadPublicBrandMap` N+1-safe batch helper birden
  fazla uçta (catalog/search/home/discovery) reuse edilir.
- Store-admin: "Markalar" modülü (`app/(app)/brands/**`, DataGrid liste + editor
  MediaUpload BRANDING + ürünler modalı) + ürün formunda serbest-metin marka input'u
  KALDIRILDI → `ProductBrandField` searchable selector + quick-create.

## 2. Store-scoped fashion sözlükleri (taxonomy governance)

- `ProductTaxonomyType` enum (`schema.prisma:776`): `SEASON, COLLECTION, MATERIAL, FIT,
  PATTERN, COLLAR, SLEEVE, LENGTH, CARE_LABEL, SUSTAINABILITY_LABEL, COLOR_FAMILY`.
- `ProductTaxonomyValue` (`schema.prisma:4677`): `storeId`, `type`, `name`, `slug` (create
  sonrası IMMUTABLE), `status ProductTaxonomyStatus` (`ACTIVE|ARCHIVED`), `displayOrder`,
  `metadata Json`, `parentId?` (hiyerarşi — ör. `COLOR_FAMILY` altı ton kırılımları),
  **`attributeOptionId String @unique`** — 1:1 backing EAV option. `@@unique([storeId, type,
  slug])`.
- `AttributeOption` (`schema.prisma:3252`) genişletildi: `storeId String?` (zaten vardı) +
  yeni `metadata Json?` + reverse `taxonomyValue ProductTaxonomyValue?
  @relation("TaxonomyBackingOption")` — **governed marker**: bir option'ın "governed" olup
  olmadığı ayrı bir boolean/enum kolonla DEĞİL, bu ters-1:1'in var/yok olmasıyla belirlenir.
  Eski `@@unique([attributeDefinitionId, value])` KALDIRILDI; yerine migration'da iki
  **partial** unique index (global `WHERE storeId IS NULL`, store `WHERE storeId IS NOT
  NULL`) — çok-kiracılı benzersizlik.
- Resolver: `apps/api-gateway/src/taxonomy/option-resolver.ts` →
  `resolveFashionOptions(storeId, definitionCode, allOptions)` — store-scoped ACTIVE governed
  önce, sonra global canonical (legacy fallback), `value`'ya göre de-dupe (store-scoped kazanır).
  `assertOptionNotGoverned(option)` → generic option PATCH/mutate `409
  ATTRIBUTE_OPTION_GOVERNED` (her iki generic AttributeOption PATCH handler'ına — STORE+PLATFORM
  — wired).
- Servis: `apps/api-gateway/src/taxonomy/{taxonomy-data.ts,taxonomy-service.ts,taxonomy-routes.ts}`
  — `createTaxonomyService` = `{list, get, create, update, reorder, archive, restore, delete,
  usageCount, ensureStoreTaxonomyDefaults}`; TEK YAZAR: `create`/rename/archive/reorder her biri
  **tek `$transaction`** içinde hem `ProductTaxonomyValue` hem backing `AttributeOption`'ı
  mirror'lar. `usageCount` üç tablo üzerinden (`ProductAttributeValue.optionId` +
  `ProductAttributeValueOption.optionId` + `VariantAttributeValue.optionId`) batch groupBy.
- Bridge: `apps/api-gateway/src/taxonomy/taxonomy-map.ts` → `GOVERNED_TAXONOMY_CODES`
  (`fashion.*` kod listesi, TEK OTORİTE), `taxonomyTypeForDefinitionCode`,
  `definitionCodeForTaxonomyType` — hem runtime bootstrap hem T14b migration hem seed AYNI
  listeyi kullanır (parity-test korumalı).
- Route gate: `FASHION_VERTICAL` (opt-in, default kapalı) — Product Dictionaries + tüm fashion
  taxonomy API'leri.
- Store-admin: "Ürün Sözlükleri" (`app/(app)/product-dictionaries/**`) — tip-başına sekme,
  liste/arama/oluştur/düzenle/reorder(full-active-set)/arşiv/usageCount ("N üründe/varyantta",
  kullanımdaysa Sil disabled). Ürün formunda governed fashion attribute'ları artık
  taxonomy-backed searchable single/multi select + "+ Yeni ekle" quick-add (aynı
  `attributes.<defId>` RHF alanına yazar — submit değeri = seçili `attributeOptionId`; generic
  `AttributeSection` non-governed alanlar için değişmeden kalır).

### Bootstrap / provisioning (fail-closed)

- **Migration-time backfill** (`20260801130000_backfill_product_brand`,
  `20260801140000_backfill_fashion_taxonomy`): migration ANINDA `FASHION_VERTICAL=ENABLED`
  olan her mağaza için, her governed global-canonical opsiyon için YENİ bir store-scoped
  `AttributeOption` kopyası + bağlı `ProductTaxonomyValue` oluşturur. **Mevcut ürün atamaları
  global opsiyona re-point EDİLMEZ** (güvenli geçiş) — legacy okunabilir kalır.
- **PLATFORM tanım provisioning** (`20260802120000_provision_platform_fashion_attribute_definitions`):
  11 governed `fashion.*` `AttributeDefinition`'ını idempotent (NOT-EXISTS) sağlar — böylece
  `ensureStoreTaxonomyDefaults` / `platformDefinitionIdForCode` HERHANGİ bir mağaza için çalışır
  (yalnız enterprise-demo'ya bağımlı değil). Fashion seed artık find-only (find-or-create hack
  kaldırıldı).
- **Runtime bootstrap-on-enable**: `FASHION_VERTICAL` DISABLED→ENABLED geçişinde
  `ensureStoreTaxonomyDefaults(storeId)` çağrılır (aynı-transaction/compensating-write) — bootstrap
  başarısız olursa capability "sessizce enabled" görünmez (`TAXONOMY_BOOTSTRAP_FAILED` 500,
  revert). **Fail-closed-honest**: TÜM governed tipler provisioning eksikliğinden atlanırsa
  (`TAXONOMY_NOT_PROVISIONED`) fırlatılır — bu revert'i tetikler.
- **Lazy safety-net**: taxonomy list/quick-create handler'ları `ensureStoreTaxonomyDefaults`'ı
  idempotent olarak da çağırır — plan-seviyesi `PUT /admin/plans/:id/capabilities` gibi
  bootstrap'i bypass edebilecek diğer enable yolları için kendi-kendini-iyileştirir (bkz.
  `docs/TECHNICAL_DEBT.md`).
- **Kanonik güncelleme politikası**: registry'ye YENİ bir kanonik değer eklenince mevcut
  mağazalara ADDİTİF olarak ulaşır (bootstrap re-run); bir kanonik değerin rename/kaldırılması
  mağaza-yönetilen `ProductTaxonomyValue` satırlarını ASLA overwrite/silme/arşivlemez — governance
  başladıktan sonra `ProductTaxonomyValue` otoriterdir.

## 3. Size-chart atama UX & seçici endpoint

- Yeni endpoint `GET /stores/:storeId/size-charts/selector` (dual-mode: `?ids=` resolve + arama/
  sayfalama) → `{id,name,sizeSystemKey,gender,measurementUnit,status,publishedRevisionId,
  revision,previewSummary}`.
- `SizeChartService.resolveEffective` — TEK precedence implementasyonu (PRODUCT > CATEGORY >
  STORE); PDP'nin `resolvePublishedSizeChart`'ı buna delege eder (kod tekrarı yok). Perf: hot-path
  için `getResolutionMeta`/`getRevision` ile DAR revizyon yükü (iki sorgu, meta+revision — bkz.
  `docs/TECHNICAL_DEBT.md` küçük-risk not).
- Store-admin: merkezi `AssignModal` (`app/(app)/size-charts/[id]/page.tsx`) raw category/product
  ID `<Input>`'ları KALDIRILDI → `EntitySelectorModal` (STORE scope = kimlik gerekmez, PRODUCT
  scope = searchable ürün seçici — arama/sayfalama/durum, kullanıcı ASLA ID yazmaz). Ürün formu
  `size-chart-step.tsx` (bağla/değiştir/kaldır/önizle/oluştur, edit-mode) aynı selector deseniyle.
- Bu akış sırasında TODO-165'in `assign()`/`upsertAssignment` kodunda iki gerçek bug bulundu ve
  düzeltildi — bkz. §7.

## 4. Searchable selector'lar (ADR-090 reuse)

Brand/Category/Product/Size-chart seçicileri **ADR-090** (TODO-159B Admin Selectors & Media)
desenini reuse eder: `?ids=` resolve modu + arama/sayfalama, kullanıcıya **hiçbir yerde raw ID
input** gösterilmez (grep-clean doğrulandı). `apps/store-admin-web/components/selector/
brand-source.tsx` (`useBrandSelectorBinding`, mirror `catalog-sources.tsx`), taxonomy
select-field + quick-create, size-chart select-field — hepsi aynı ortak selector primitive'ini
kullanır.

## 5. Kapsam sınırı

- Marketplace repository'ye DOKUNULMADI.
- TODO-166 (gelecek kapsam) başlanmadı.
- Final Enterprise UI & Design Polish başlanmadı.
- Mevcut EAV/varyant/inventory/capability/tenant-guard/search-facet/selector (ADR-090)
  motorları DEĞİŞMEDİ — yalnız üstlerine iki governance katmanı (Brand, ProductTaxonomyValue)
  + bir UX katmanı (size-chart selector) eklendi.
- Legacy global-option ürün atamaları re-point EDİLMEDİ (opsiyonel kontrollü migration
  `docs/TECHNICAL_DEBT.md`'de ertelendi).

## 6. Kararlar

**ADR-253…ADR-258** — bkz. `docs/DECISIONS.md`.

1. ADR-253 — Brand entity ownership.
2. ADR-254 — Product↔Brand relation & legacy dual-read.
3. ADR-255 — Store-scoped product taxonomies backed by EAV options.
4. ADR-256 — Controlled fashion vocabularies & bootstrap provisioning.
5. ADR-257 — Size-chart assignment UX & selector endpoint.
6. ADR-258 — Product/Category/Brand/Size-chart searchable selectors.

## 7. TODO-165 kodunda bulunan gerçek buglar (TODO-165A kapsamında düzeltildi)

Size-chart selector UX'ini merkezi `AssignModal` + ürün-formu `size-chart-step.tsx`'e
bağlarken `apps/api-gateway/src/fashion/size-chart-service.ts` içinde iki gerçek TODO-165
regresyonu bulundu ve düzeltildi (bkz. `docs/analysis/TODO-165-fashion-vertical-foundation.md`
"TODO-165A follow-up" notu ve SDD ledger Task 13):

1. **`assign()` PUBLISHED-durum guard'ı yoktu** — DRAFT/ARCHIVED bir size-chart PRODUCT/CATEGORY/
   STORE scope'a bağlanabiliyordu. Fix: `SIZE_CHART_ASSIGN_NOT_PUBLISHED` (400) guard eklendi —
   yalnız `PUBLISHED` chart bağlanabilir.
2. **`upsertAssignment` yanlış anahtarla lookup yapıyordu** (`sizeChartId` dahil) — bu, aynı ürüne
   ikinci bir size-chart bağlamayı (chart DEĞİŞTİRME) DUPLICATE assignment satırı olarak
   bırakıyordu (gerçek `@@unique([storeId, scope, categoryId, productId])`'yi bypass ediyordu).
   Fix: lookup artık gerçek unique alanlarla (`sizeChartId` HARİÇ) yapılıyor → ikinci ürün
   bağlaması ilkinin YERİNİ alıyor (upsert-replace, beklenen davranış).

## 8. Gerçek browser smoke'ta doğrulanan senaryolar (SDD ledger Task 30)

İzole stack: kendi `api-gateway :4001` (isolated DB `commerce_os_todo165a`, TODO-165A kodu) +
`storefront :3010` + `store-admin :3012` (kullanıcının kendi `:4000/:3000/:3002` stack'i
DOKUNULMADI). Login `platform-admin@example.local`. Doğrulananlar:

1. Storefront `/markalar` dizini — desktop + mobile — gerçek markalar (Nike/Adidas/LC
   Waikiki/Koton/Mavi/Trendix dahil fashion markaları).
2. Brand facet canlı — `search?brand=apple` → `brand` disjunctive facet.
3. Brands admin liste — gerçek `productCount` (Apple 14) + marka oluşturma (71→72 "Marka
   oluşturuldu").
4. "Ürün Sözlükleri" — governed tip başına sekme (insan-okunur etiketler, `fashion.*` sızıntısı
   YOK) + `usageCount` ("8 üründe/varyantta") + kullanımdaysa Sil disabled + reorder.
5. Ürün formu "Fashion Özellikleri" — searchable SEZON select + seed'den round-trip pre-select
   (Sonbahar/Kış) + "+ Yeni ekle" quick-add, opsiyonlar taxonomy'den geliyor.
6. Merkezi size-chart `AssignModal` — STORE scope kimlik gerektirmiyor, PRODUCT scope searchable
   ürün seçici (483 ürün, arama/sayfalama/durum) — raw ID YOK.
7. Responsive mobile 375px — taşma yok.

Ürün-formu size-chart adımı (Task 25) bağlama UX'i, Task 26 ile AYNI selector deseniyle
kanıtlanmıştır (backend+bileşen ayrıca review edilip test edildi).

## 9. Gate kanıtı

`db:generate` + `pnpm build` 27/27 · `pnpm -r exec tsc -p tsconfig.json --noEmit` exit 0 ·
`pnpm test` 3320/3320 · `prisma migrate status` 74 migration uygulanmış · `git diff --check`
temiz · search read-model reindex 430/430 (marka alanları dolu). Detay: SDD ledger Task 29/30/31.

---

## Ek Not — TODO-165B Recovery (ship öncesi bulunan 6 blocker)

TODO-165A ship edilmeden önce storefront/katalog doğruluğunda 6 blocker bulundu ve aynı recovery fazında
(TODO-165B) çözüldü — TODO-165A değişiklikleriyle birlikte commit'e hazır. Bu blocker'ların ikisi TODO-165A
alanına doğrudan dokunur: (5) **beden tablosu PDP'de görünmüyordu** — kök neden, buton yalnız `axis.kind==='size'`
ekseni yanında render ediliyordu ve enterprise-demo `numara` ekseni `size` sayılmıyordu; çözüm butonu
`fashion.sizeChart` varlığına bağladı (ADR-264). (2) **renk/beden kartlarında fiyat yoktu** — public fashion
projeksiyonu option'a server-authoritative fiyat özeti ekledi (ADR-261). Detaylı analiz + kök nedenler:
`docs/analysis/TODO-165B-pdp-catalog-recovery.md`. ADR-259…264.
