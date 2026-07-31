# TODO-165 — Fashion Vertical Foundation · Analiz & Tasarım

> Durum: **IMPLEMENTED** (Completion Recovery tamam; uçtan uca GERÇEK browser + GERÇEK DB smoke
> geçti; commit/deploy YOK). Detay/kanıt: `docs/ROADMAP.md` TODO-165 bloğu + `docs/OPERATIONS.md`
> fashion seed runbook. Bu doküman, TODO-165'in tüm alt
> bölümlerinin (capability → domain → size system → size chart → swatch → variant matrix →
> admin form → PDP → PLP → order snapshot → inventory → seed → güvenlik → migration →
> smoke → test → docs) tasarım sözleşmesini kayıt altına alır. Kaynak: 6 paralel keşif
> ajanının mevcut mimari haritası (aşağıda özetlendi).
>
> **Kapsam sınırı**: Marketplace repository'ye DOKUNULMAZ. Genel e-ticaret çekirdeği
> fashion'a özel hale getirilmez — fashion davranışları **yalnız `FASHION_VERTICAL`
> capability açıkken** görünür. Tema motoru / tenant capability mimarisi **yeniden
> kurulmaz**; mevcut registry/resolver/slot sözleşmesine uyulur.

---

## 0. Yönetici özeti — en kritik tasarım kararı

Keşif, TODO-165'in **büyük ölçüde orkestrasyon + UI** olduğunu ortaya koydu; yeni bir
paralel domain motoru gerekmez:

1. **Attribute motoru zaten tam generic EAV**: typed-column value tabloları
   (`ProductAttributeValue` / `VariantAttributeValue`), per-kategori template
   (`CategoryAttribute`), varyant ekseni (`ProductVariantAttribute` +
   `ProductVariantOptionSelection` → `ProductVariantOptionValue`), ve renk-medya ekseni
   (`Product.mediaDefiningAttributeId` + `ProductImage.optionId`). Fashion attribute'ları
   (gender/season/collection/material/fit/color/size…) **PLATFORM-scoped
   `AttributeDefinition` şablonları** olarak eklenir — yeni motor YOK.
2. **Varyant matris pipeline'ı zaten hazır servislerden oluşuyor**: `setSelections`
   (2C-1 eksen) → `previewCombinations` (2C-2 saf Cartesian, `combinationKey`) →
   `generate` (2C-3 kalıcı diff + deterministik SKU + advisory-lock) → `identityService`
   (2C-4 bulk SKU/barcode/title) → `inventoryService.preview/apply` (2C-6 per-hücre stok,
   `reserved` dokunulmaz, fingerprint-guard) → Variant Media Engine (2C-7). **Color ×
   Size zaten geçerli** çünkü axis eligibility = `COLOR` + `SELECT` (MULTI_SELECT eksen
   olamaz). Fashion matrisi bu motorların üstüne UI + orkestrasyon katmanıdır.
3. **Capability sistemi tek registry ile büyüyor**: `registry.ts`'e `FASHION_VERTICAL`
   eklenince resolver/cache/matrix/plan-editor/public-projection otomatik alır. Route
   gate'i `requireStoreAdminForModule` / `resolvePublicStoreForModule` /
   `capabilityCache.isEnabled` ile.

**Gerçekten YENİ olanlar** (dolayısıyla migration + yeni model gereken kısım): (a) typed
**Size System registry** (kod-seviyesi, serbest JSON değil), (b) **Size Chart** modeli +
revizyon versiyonlama + scope assignment, (c) **normalized color-family** metadata
(mevcut `AttributeOption.colorHex` üstüne), (d) **OrderLine** additive fashion snapshot
kolonları, (e) fashion attribute'ları kategoriye bağlayan **platform template** kaydı.

---

## 1. Mevcut mimari haritası (keşif özeti)

Monorepo: `apps/` (api-gateway = ana backend monolit, store-admin-web, admin-web,
storefront-web, worker), `packages/` (db, contracts, api-client, theme, themes, ui,
inventory, …), `services/` (search-service, checkout-service, … — çoğu port/adapter).

### 1.1 Ürün / varyant / attribute / kategori / medya (Ajan A)
- `Product` (`schema.prisma:1066`): tenant-scoped, `primaryCategoryId?` (ADR-067, tek
  kanonik kategori, Restrict), `mediaDefiningAttributeId?` (ADR-078 renk-medya ekseni),
  ilişkiler: `variants`, `assignments` (M:N ikincil kategori), `images`,
  `attributeValues`, `variantAttributes`, `searchDocument`, `searchFacetValues`.
- `ProductVariant` (`:1164`): `sku` (unique/store), `priceMinor`, `combinationKey?`
  (`@@unique([productId, combinationKey])`, NULL-distinct), `generationSource`,
  `skuSource`, `optionValues Json?` (**legacy, non-authoritative**). Normalized eksen =
  `ProductVariantOptionValue` (`:3418`: `variantId, attributeDefinitionId, optionId`).
- `AttributeDefinition` (`:3129`): `scope PLATFORM|STORE`, `storeId?` (null=PLATFORM),
  `code`, `dataType` (TEXT…SELECT/MULTI_SELECT/COLOR/IMAGE…). `AttributeOption` (`:3188`):
  `value`, `label`, `colorHex?` (COLOR), `sortOrder`. `CategoryAttribute` (`:3222`) =
  **davranış tek sahibi**: `required/filterable/searchable/comparable/variantDefining/
  visibleOnProductPage/visibleOnListing`, `displayOrder`, `validationRules Json`.
- Value tabloları typed-column (JSON değil): `ProductAttributeValue` (`:3269`,
  `@@unique([productId, attributeDefinitionId])`), `VariantAttributeValue` (`:3307`,
  yalnız `valueText`/`optionId`), MULTI_SELECT junction `ProductAttributeValueOption`.
- Tek yazar servisler: `attributeValueService`
  (`apps/api-gateway/src/attribute-values/service.ts`, delete-and-replace tx),
  `variantSelectionService` (`apps/api-gateway/src/variant-selections/service.ts`).
- Medya: `MediaAsset` (`:2761`) + `ProductImage` (`:2802`, `attributeDefinitionId?`+
  `optionId?` = renk-ekseni etiketi; ikisi null = paylaşılan galeri; `pos0` = kapak).

### 1.2 Variant matrix + inventory motorları (Ajan B) — TÜMÜ REUSE
- 2C-1 `variant-selections/` → `setSelections` (COLOR+SELECT eksen, MULTI_SELECT değil).
- 2C-2 `variant-combinations/engine.ts` → `generateVariantCombinations` saf Cartesian;
  `combinationKey = v1|<attrId>:<optId>|…` (attrId'ye göre sıralı, rename-bağımsız);
  `maxCombinations` guard.
- 2C-3 `variant-generation/service.ts` → `generate` tek `$transaction`,
  `pg_advisory_xact_lock(hashtext(productId))`, saf diff (create/keep/restore/archive),
  manuel varyantlar dokunulmaz; auto SKU `SLUG-COLOR-SIZE`
  (`@commerce-os/utils/sku.ts` `buildBaseSku`/`resolveUniqueSku`, `SKU_MAX_LENGTH=64`).
- 2C-4 `identity-engine/` + `sku-engine/` → pattern bulk SKU/Barcode/Title, apply
  advisory-lock + audit; `IDENTITY_SKU_CONFLICT`.
- 2C-6 `inventory-engine/` → `preview`/`apply`; editable = `ON_HAND/INCOMING/
  SAFETY_STOCK/REORDER_POINT`; **`reserved` sistem-kontrollü, asla yazılmaz**;
  `available = onHand − reserved − safetyStock` (türetilir); INACTIVE depo fail-closed;
  fingerprint stale-guard (`INVENTORY_PREVIEW_STALE`); default depo çift-otorite
  (`InventoryItem` ↔ `InventoryBalance`).
- 2C-7 Variant Media Engine: `server.ts` içi inline; `prepareProductImageBindings`,
  `imageBindings: {mediaId, optionId?}[]`, `INVALID_MEDIA_AXIS`/`INVALID_MEDIA_OPTION`/
  `MEDIA_AXIS_REQUIRED`.

### 1.3 Storefront PDP / PLP / facet (Ajan C)
- PDP: `apps/storefront-web/app/products/[handle]/page.tsx` (RSC) + `buy-box.tsx`
  (varyant seçim = **düz `variant.title` butonları**, eksen ayrıştırması YOK) +
  `variant-gallery.tsx` (`mediaOptionId`'ye göre reaktif) + `pdp-selection.tsx` (context).
- Public product DTO: `publicProductDetailSchema` / `publicProductVariantSchema`
  (`packages/contracts/src/index.ts`): varyant = `id,title,sku,priceMinor,…,mediaOptionId`
  — **yapısal eksen (color/size) YOK**. En büyük boşluk.
- PLP + facet: `apps/storefront-web/app/products/page.tsx`, `components/search/`
  (`filter-rail`, `facets/registry.tsx` data-driven, `facet-color-swatch.tsx` HAZIR).
  Endpoint `GET /public/stores/:slug/search`; query `filter[code]`,`filter[code][min|max]`,
  `category`,`minPrice`,`maxPrice`,`inStock`,`sort`,`page`,`pageSize`. Facet DTO
  `publicSearchFacetSchema` (`selectionMode MULTI|RANGE|BOOLEAN`, values `colorHex` HAZIR).
  Disjunctive faceting `services/search-service/src/search-query.ts`. **Renk facet tam
  hazır; beden facet generic checkbox — özel UI yok** (`resolveFacetKind` +
  `facets/registry.tsx` tek genişleme noktası).
- Add-to-cart: `buy-box.tsx` → `addToCartAction(variantId, quantity)`; cart line =
  yalnız `{variantId, quantity}` (imzalı cookie); **renk/beden cart'ta tutulmaz**,
  server türetir. `canAddToCart` bugün sadece varyant var mı bakar (cheapest pre-select)
  — fashion için **zorunlu-eksen seçim gate'i** eklenmeli.
- Tema slot: `packages/theme/src/slots.ts` → `productDetailLayout`/`productListingLayout`
  (server boundary) / `productCard` (client). Slot **presentation-only**, allowlist
  variant, migration gerekmez (yalnız `variants` + `builderVariants` büyür).
  `getServerSlotVariant(slot, fallback)` → `data-*` attribute.

### 1.4 Store-admin ürün formu (Ajan D)
- `apps/store-admin-web` — `src/` yok; kod `app/`, `components/`, `lib/` altında.
- Form: `app/(app)/products/product-form.tsx` (`ProductForm`, tek uzun RHF formu,
  section-kart yığını — **stepped değil**). Schema:
  `product-form-schema.ts` (`ProductFormValues`, `buildCoreSchema` superRefine,
  `buildCreatePayload/buildUpdatePayload`, `createProductFormResolver`). Dinamik attribute
  renderer: `products/attributes/attribute-section.tsx` + `attribute-field.tsx`
  (`WIDGET_BY_TYPE`) + `use-category-attributes.ts`.
- Varyant: `products/variant-attributes/` (`VariantAttributeSection` eksen,
  `CombinationPreview`, `generate-variants-action.tsx`), `identity/identity-matrix.tsx`,
  `sku/sku-auto-panel.tsx`, `pricing/pricing-workspace.tsx`, `inventory/inventory-workspace.tsx`.
- Capability gating: client `storeApi.listModules()` (`store-nav.tsx` deseni),
  server `lib/server/module-access.ts` `isStoreModuleEnabled()` + `components/module-guard.tsx`
  `<ModuleGuard moduleKey=…>`; route→module `lib/store-modules.ts`.
- UI kit: `components/ui/index.tsx` (dark-glass, **shared `@commerce-os/ui`'ye DOKUNMA**).
  **Stepper/Wizard primitive'i YOK** — yeni yazılacak (kit tarzında).

### 1.5 Capability enforcement + tema slot (Ajan F)
- `apps/api-gateway/src/capabilities/`: `registry.ts` (WHAT-var otoritesi;
  `StoreModuleKey` union + `STORE_MODULE_REGISTRY`), `resolver.ts` (saf effective;
  override>plan>baseline + dependency fixpoint; fail-closed), `cache.ts`
  (`isEnabled(storeId, key)`, TTL 30s), `data.ts` (CORE_IMMUTABLE/UNKNOWN_MODULE/
  DEPENDENTS_ACTIVE guard), `routes.ts` (`createRequireCapability` → 403 MODULE_DISABLED;
  public `GET /public/stores/:slug/modules`), `worker-gate.ts`.
- `server.ts` wiring: `requireStoreAdminForModule(key)` (admin gate),
  `resolvePublicStoreForModule(key)` (public → 404 leak-free), inline
  `capabilityCache.isEnabled(store.id, key)`. Örnek: SPONSORED_PRODUCTS/CAMPAIGNS.
- `StoreModule` (`schema.prisma:999`): `storeId,moduleKey,state INHERIT|ENABLED|DISABLED`,
  sparse rows; **FASHION_VERTICAL için schema migration GEREKMEZ** (registry otorite).
- Storefront: `lib/server/site.ts` `getStoreCapabilities()` +
  `isStorefrontModuleEnabled(key)`. store-admin: `admin.modules.list`.

### 1.6 Cart/order snapshot (Ajan E)
- **Cart/CartLine tablosu YOK** (client cookie). Tek immutable snapshot = `OrderLine`
  (`schema.prisma:1752`): `sku,title,variantTitle,quantity,unit/total,currency` + F4C
  price/VAT/list/cost. **Görsel/optionValues/color/size JSON YOK** — doldurulacak boşluk.
- Snapshot iki yerde kurulur: `createOrder` (`server.ts:4177`, push `:4237`) ve
  `addOrderLine` (`:4378`, `:4428`) — **AYNI kural**. Public checkout `:6050` →
  `createOrder(:6189)` yalnız `{variantId, quantity}` iletir; enrichment server-side.
- Authoritative color/size kaynağı: `ProductVariantOptionValue` ⋈ `AttributeOption`
  (`value/label/colorHex`) ⋈ `AttributeDefinition` (`code/dataType` COLOR vs SELECT);
  manuel varyant için `VariantAttributeValue`.
- Render: store-admin `orders/[id]/page.tsx` + `order-shared.ts`; storefront
  `account/orders/[orderNumber]/page.tsx`; serializer `apps/api-gateway/src/customers/index.ts`
  (`serializeCustomerOrderSummary/Detail`). Yeni alanlar buraya da eklenmeli.
- Anti-tamper: `buildPublicCartIndex` (`:5735`) ACTIVE filtre; checkout `CART_NOT_READY`;
  `createOrder` loop `INVALID_VARIANT`/`VARIANT_NOT_FOUND`. **Fashion attribute'ları
  burada dondurulur** (client etkileyemez).

---

## 2. FASHION_VERTICAL capability tasarımı

- `registry.ts`: `StoreModuleKey` union'a `"FASHION_VERTICAL"` + `STORE_MODULE_REGISTRY`'ye
  `{ key:"FASHION_VERTICAL", group:"catalog", labelTr:"Moda Dikeyi", labelEn:"Fashion
  Vertical", descriptionTr:"Moda/tekstil ürün, beden, renk, koleksiyon davranışları.",
  core:false, baselineEnabled:false, requires:["CATALOG","CATEGORIES"] }`.
  - **`baselineEnabled:false`** (opt-in): yeni capability, geriye-uyum kaygısı yok. Yeni ve
    mevcut mağazalar VARSAYILAN KAPALI → mevcut commerce davranışı aynen korunur;
    `demo-store` kapalı kalır. Enterprise-demo `StoreModule` override=ENABLED ile açılır.
  - `requires` → CATALOG/CATEGORIES core olduğundan daima sağlanır (dependency no-op),
    ama niyet belgelenir.
- **Backend gate**: yeni fashion admin route'ları `requireStoreAdminForModule
  ("FASHION_VERTICAL")`, public uçlar `resolvePublicStoreForModule("FASHION_VERTICAL")`
  (kapalıysa 404), ürün/store public projection'ında fashion alanları yalnız
  `capabilityCache.isEnabled(store.id,"FASHION_VERTICAL")` iken eklenir (leak-free).
- **Store-admin UI**: stepped fashion form + fashion sekmeleri yalnız
  `isStoreModuleEnabled("FASHION_VERTICAL")` iken; kapalıysa mevcut form korunur.
- **Storefront UI hint**: `isStorefrontModuleEnabled("FASHION_VERTICAL")`.
- **Store Admin bypass edemez**: capability kapalı → 403/404 (gateway otoriter);
  size-chart/matris/fashion attribute yazımı reddedilir.

## 3. Fashion attribute modeli (canonical templates)

Mevcut EAV reuse; PLATFORM-scoped `AttributeDefinition` + `AttributeOption` seti tanımlanır
ve fashion kategorilerine `CategoryAttribute` ile bağlanır. **Yeni tablo yok.**

**Ürün seviyesi** (`variantDefining=false`): `gender` (SELECT), `season` (SELECT),
`collection` (SELECT/TEXT), `material` (TEXT/MULTI_SELECT — kompozisyon), `fit` (SELECT),
`pattern` (SELECT), `collarType` (SELECT), `sleeveType` (SELECT), `length` (SELECT),
`careInstructions` (MULTI_SELECT/TEXTAREA), `countryOfOrigin` (SELECT/TEXT),
`sustainabilityLabels` (MULTI_SELECT).

**Varyant seviyesi** (`variantDefining=true` yalnız color/size eksen; diğerleri variant text):
`color` (COLOR — media-defining axis), `colorFamily` (SELECT — normalized family),
`size` (SELECT), `sizeSystem` (SELECT — hangi beden sistemi), `waist` (SELECT/INTEGER),
`inseam` (SELECT/INTEGER), `shoeSize` (SELECT), `cupSize` (SELECT), `variantSwatch`
(IMAGE — image swatch), `variantMedia` (mevcut ProductImage optionId mekanizması).

- Kanonik kod/isim/opsiyon seti **kod-seviyesi katalog** olarak
  `apps/api-gateway/src/fashion/canonical-attributes.ts` içinde tanımlanır (tek otorite),
  seed bu katalogdan PLATFORM `AttributeDefinition`/`AttributeOption` üretir; store'a
  bağlama fashion kategori seed'inde `CategoryAttribute` ile yapılır.
- Attribute yazımı **daima `attributeValueService`** üzerinden (yeni paralel yol yok).
- `color` eksen = `Product.mediaDefiningAttributeId` (Variant Media Engine reuse).

## 4. Size System registry (typed, YENİ — kod seviyesi)

Serbest JSON YASAK. `packages/contracts/src/fashion/size-systems.ts` (ya da yeni
`@commerce-os/*`) içinde **typed registry**:
```
type SizeSystemKey = INTERNATIONAL | EU | US | UK | TR | JEANS | SHOES_EU | SHOES_US |
                     SHOES_UK | BRA
interface SizeSystemDefinition {
  key; labelTr; labelEn; measurementUnit?; 
  values: { normalized: string; displayLabel: string; localeLabels?: Record<locale,string>;
            order: number }[];
  categoryCompatibility: string[];   // uygun kategori "kind" etiketleri
}
```
- INTERNATIONAL: XXS,XS,S,M,L,XL,XXL,3XL,4XL. EU: 34–52. US: 0–20. UK: 4–24. TR: 34–52.
  JEANS: waist×inseam (28/30…). SHOES_EU: 35–46. SHOES_US/UK: uygun aralık. BRA: band+cup.
- Fonksiyonlar: `isSizeSystemKey`, `getSizeSystem(key)`, `normalizeSizeValue(key,input)`,
  `orderedValues(key)`, `localeLabel(key,value,locale)`, `isCompatibleWithCategory(...)`.
- **Custom store size chart** bu registry'yi override etmez; SizeChart (Bölüm 5) mağaza
  özel ölçü tablosudur. `size`/`sizeSystem` attribute opsiyonları bu registry'den doğrulanır.

## 5. Size Chart modeli (YENİ — DB + revizyon)

Additive migration. Model taslağı:
```
model SizeChart {
  id, storeId, name, sizeSystemKey (String; registry-doğrulanır), measurementUnit,
  gender?, status DRAFT|PUBLISHED|ARCHIVED, publishedRevisionId?, createdAt, updatedAt
  @@index([storeId])
}
model SizeChartRevision {          // published/rollback için immutable snapshot
  id, storeId, sizeChartId, revision Int, columns Json (ölçü kolonları),
  rows Json (satırlar: size + ölçüler), locale?, createdAt
  @@unique([sizeChartId, revision])
}
model SizeChartAssignment {        // store/category/product scope
  id, storeId, sizeChartId, scope STORE|CATEGORY|PRODUCT, categoryId?, productId?,
  createdAt @@unique([storeId, scope, categoryId, productId])
}
```
- Store Admin: oluştur / kategori-ürün bağla / preview / publish (revision +1) / rollback
  (önceki revision'a). Yayınlı revision immutable.
- PDP: assignment çözümü **product > category > store** önceliği; PDP'de modal/drawer.
- `columns`/`rows` **serbest JSON DEĞİL sunum verisi** — server-side şema doğrulaması
  (kolon adı, hücre string/number), XSS için raw HTML kabul edilmez (plain text).
- Servis: `apps/api-gateway/src/fashion/size-chart-service.ts` (tek yazar, tenant guard,
  advisory-lock publish); route'lar `FASHION_VERTICAL` gate'li.

## 6. Color & swatch modeli

- Renk **`AttributeOption`** (dataType COLOR): `label` = display color name, `colorHex` =
  hex swatch, `value` = normalized. **Normalized color family** = ayrı `colorFamily`
  SELECT attribute (ör. "Kırmızılar", "Maviler") — renk opsiyonu bir family'e maplenir
  (kod-seviyesi map `canonical-attributes.ts` + opsiyon `metadata`/ayrı value).
- Image swatch / pattern / multicolor: `variantSwatch` IMAGE attribute veya
  `AttributeOption` + `ProductImage` optionId (media ownership kontrolü mevcut:
  `INVALID_MEDIA_OPTION`, cross-tenant guard). **Raw CSS / serbest URL kabul edilmez** —
  yalnız kayıtlı `colorHex` (regex `#rrggbb`) ve store'a ait `MediaAsset`.
- Aynı renk için variant gruplama = `mediaDefiningAttributeId` (renk ekseni) zaten grupluyor.
- PLP/PDP: mevcut `facet-color-swatch.tsx` + kart `SwatchRow` reuse; PDP'ye gerçek renk
  swatch UI (yeni) + beden seçici eklenir.

## 7. Variant matrix (orkestrasyon — motorlar reuse)

Fashion ürün formunda color × size matrisi, mevcut motorların üstünde bir akış:
1. Eksen kaydet: `variantSelectionService.setSelections` (color=COLOR, size=SELECT).
2. Önizle: `variantCombinationPreviewService.previewCombinations` — hücre kimliği
   `combinationKey`; duplicate/invalid engeli motorda (fold + archived drop).
3. Materyalize: `variantGenerationService.generate` — deterministik SKU `SLUG-COLOR-SIZE`,
   advisory-lock diff (active/inactive combination = archive/restore; manuel dokunulmaz).
4. Bulk SKU/price/stock: `identityService` (SKU/barcode), `pricing` workspace (price),
   `inventoryService.preview/apply` (stok — `reserved` korunur, oversell invariant).
5. Variant media: `Product.mediaDefiningAttributeId=color` + `imageBindings`.
- **Invalid size/category engeli**: size opsiyonları seçili kategori + size system
  uyumundan doğrulanır (Bölüm 4 `isCompatibleWithCategory`, `CategoryAttribute` link).
- **Server-side doğrulama**: tüm kombinasyon üretimi/persist gateway'de; client yalnız
  eksen+opsiyon seçer, hücreleri server türetir.

## 8. Store Admin stepped fashion form (10 adım)

`FASHION_VERTICAL` açıkken `ProductForm` bir **wizard shell** ile sarılır (aynı tek RHF
instance; state adımlar arası korunur). Kapalıysa mevcut tek-form korunur. Adımlar:
1 Temel bilgiler · 2 Kategori · 3 Fashion özellikleri · 4 Renk & bedenler · 5 Varyant
matrisi · 6 Medya · 7 Fiyat & stok · 8 Size chart · 9 Önizleme · 10 Yayınlama.
- Yeni `Stepper` primitive'i (dark-glass kit tarzı) `components/ui`'ye eklenir (shared
  `@commerce-os/ui`'ye dokunulmaz). Adım geçişinde ilgili section-kartlar gösterilir.
- Adım validasyonu: mevcut `buildCoreSchema` superRefine + attribute resolver reuse; adım
  bazlı "ileri" ancak o adımın alanları geçerliyse.

## 9. Fashion PDP

- Public varyant DTO **yapısal eksenle** genişletilir: `optionAxes: [{ attributeDefinitionId,
  code, name, dataType, options:[{optionId,label,colorHex?,order}] }]` + her varyantta
  `axisOptionIds: Record<attributeDefinitionId, optionId>`. Yalnız `FASHION_VERTICAL` iken
  doldurulur (leak-free); kapalıyken mevcut düz `title` davranışı.
- `buy-box.tsx`: renk swatch satırı + beden seçici (buton grid); **stokta olmayan beden
  disabled**; seçili color+size → tek varyanta çözülür; seçim tamamlanmadan ATC disabled
  (zorunlu-eksen gate); seçili renkte medya değişir (mevcut `mediaOptionId` reuse).
- PDP detay: beden tablosu (modal/drawer — Bölüm 5 assignment), kumaş/materyal, kalıp,
  bakım, teslimat/iade, **düşük stok göstergesi** (server-precomputed).
- Tema slot uyumu: `productDetailLayout` slot'una dokunmadan `data-detail-variant` içinde
  çalışır; gerekirse yeni `fashion` variant slot registry'ye additive eklenir.

## 10. Fashion PLP + facet

- Server-side facet zaten disjunctive; fashion facet'leri = filterable
  `CategoryAttribute` (color/size/season/collection/material/fit) → mevcut read-model
  otomatik üretir. **Beden facet UI**: `resolveFacetKind`'e `size` branch + `facets/
  registry.tsx`'e beden buton-grid renderer (ordered, size-system sıralı).
- Renk/beden filtreleri **URL query** ile paylaşılabilir (`filter[color]`, `filter[size]`
  mevcut codec `lib/search/url-state.ts`).
- Facet count **tenant/store-scoped** (mevcut `ProductFacetValue` storeId).
- Facet listesi: kategori, marka, fiyat, renk ailesi, beden, sezon, koleksiyon, materyal,
  fit, indirim, stok durumu (çoğu mevcut; renk-ailesi/beden UI eklenir).

## 11. Order snapshot genişlemesi

`OrderLine`'a additive nullable kolonlar: `selectedColor String?`, `selectedColorHex
String?`, `selectedSize String?`, `sizeSystem String?`, `swatchLabel String?`,
`materialSummary String?`, `variantDisplayName String?`.
- Doldurma **iki yerde** (`createOrder:4237`, `addOrderLine:4428`); `productVariant.
  findMany` select'i `optionValueSelections { attributeDefinitionId, option{value,label,
  colorHex}, definition{code,dataType} }` (+ `attributeValues`) ile genişletilir; color/size/
  swatch/material server-side çözülür → **immutable** (ürün sonradan değişse bile snapshot
  sabit). Client manipüle edemez (variantId'den türetilir).
- Serializer + UI: `customers/index.ts` select+serialize; store-admin `order-shared.ts`;
  storefront order detail; contracts order line şeması.

## 12. Inventory (reuse)

Matris stok görünümü = mevcut `inventoryService.matrix/storeMatrix`; renk/beden gruplama +
düşük-stok filtresi UI katmanı; beden-bazlı toplu güncelleme = `preview/apply` rule;
inactive combination = archived varyant (stok korunur); oversell/reservation invariant'ları
motor koruyor. Yeni motor yok.

## 13. Seed & demo

`packages/db/scripts/enterprise/` (deterministik, `enterprise-demo`/`edm-store` scope).
- Fashion kategori/attribute/ürün üreten yeni modül `enterprise/fashion.mjs` (catalog'a
  eklenir): ≥3 kategori (ör. Kadın Giyim, Erkek Giyim, Ayakkabı), ≥12 ürün, çok renk +
  çok beden sistemi (INTERNATIONAL + EU + SHOES_EU), varyant görselleri, stoklu/stoksuz
  kombinasyonlar, ≥1 size chart, sezon/koleksiyon, materyal/bakım.
- `edm-store` için `StoreModule{moduleKey:"FASHION_VERTICAL", state:ENABLED}` seed satırı.
- `demo-store` (genel seed) **FASHION_VERTICAL KAPALI** kalır (dokunulmaz).
- PLATFORM fashion `AttributeDefinition`/`AttributeOption` idempotent upsert.

## 14. Güvenlik & tenant izolasyonu

- Tüm fashion route'ları capability-gate + storeId scope (cross-store attribute/size-chart/
  media erişimi reddedilir — mevcut tenant guard desenleri).
- Size chart columns/rows plain-text server doğrulama; raw HTML/CSS/JS yok; renk yalnız
  `#rrggbb`; media yalnız store'a ait `MediaAsset`.
- Order snapshot server-side (client manipüle edemez); variant combination server doğrulanır.
- Capability kapalı → API 403/404; mevcut veri korunur; tekrar açınca geri gelir.

## 15. Migration planı (additive + immutable)

Tek migration `packages/db/prisma/migrations/2026….._fashion_vertical_foundation/`:
- `SizeChart`, `SizeChartRevision`, `SizeChartAssignment` tabloları (+ index/unique).
- `OrderLine` additive nullable kolonlar (7 alan).
- (Opsiyonel) `AttributeOption.metadata Json?` — color family/normalized swatch için
  (yoksa; varsa reuse).
- Size System registry = **kod**, DB değil (serbest JSON yasağına uyum).
- Mevcut ürün/varyant/sipariş verisi korunur; hiçbir kolon düşmez/rename olmaz.

## 16. ADR listesi (ADR-246…252 önerilen)

- ADR-246 Fashion capability boundary (opt-in `baselineEnabled:false`, gate stratejisi).
- ADR-247 Canonical fashion attributes (PLATFORM template, EAV reuse, yeni motor yok).
- ADR-248 Size-system registry (typed, kod-seviyesi, serbest JSON yasağı).
- ADR-249 Size-chart versioning (revision immutable, scope önceliği product>category>store).
- ADR-250 Color swatch model (colorHex/colorFamily/image-swatch, raw CSS/URL yasağı).
- ADR-251 Fashion variant matrix (mevcut 2C motorları orkestrasyonu).
- ADR-252 Fashion order snapshot (additive immutable, server-authoritative).

## 17. Test planı

Vitest (gateway/contracts/store-admin/storefront) + mevcut desenler:
- Capability guard (kapalı → 403/404; açık → geçer; disable/re-enable veri korunur).
- Size-system validation (normalize, ordered, locale, category compatibility, unknown key
  fail-closed).
- Size-chart CRUD + versioning (publish revision+1, rollback, immutable, scope çözümü).
- Swatch validation (colorHex regex, media ownership, cross-tenant red).
- Variant matrix generation (Cartesian, combinationKey, duplicate engeli, invalid size/
  category engeli) — mevcut motor testlerini fashion senaryosuyla genişlet.
- PLP facet (color/size disjunctive, count store-scoped, URL codec).
- PDP selection (zorunlu-eksen gate, OOS disabled, media reaktif).
- Cart variant validation + order snapshot (server-side freeze, ürün değişse sabit).
- Inventory grouping (renk/beden, reserved invariant).
- Tenant isolation (cross-store size-chart/attribute/media).
- Media ownership.

## 18. Gerçek browser smoke (Bölüm 16 planı)

Store Admin: FASHION açık mağaza → fashion ürün oluştur → kategori → renk+beden → matris →
fiyat/stok/media → size chart bağla → publish. Storefront: PLP facet + renk swatch + beden
filtresi + PDP varyant seçim + OOS disabled + medya değişimi + size chart modal + doğru
sepete ekleme. Checkout: sipariş + selected color/size snapshot doğrulama (ürün değişse
sabit). Capability: kapat → fashion alanları kaybolur / API reddedilir / veri korunur /
tekrar aç → geri gelir. Responsive: mobile/tablet/desktop PLP+PDP.

## 19. Riskler & açık kararlar

- **R1 Enterprise-demo etkisi**: FASHION açılınca tüm store fashion-capable olur; mevcut
  471 non-fashion ürün etkilenmez (fashion alanları opsiyonel). Kabul edildi.
- **R2 Public DTO genişlemesi**: `optionAxes` yalnız capability açıkken; storefront mapper
  geriye-uyumlu (alan yoksa mevcut davranış).
- **R3 Size system ⋈ attribute**: `size` SELECT opsiyonları registry'den türetilir; store
  custom chart registry'yi override etmez (ölçü tablosu ≠ beden ekseni).
- **R4 Kapsam**: bu faz commit/push/PR/deploy YAPMAZ (§20). Analiz→impl→migration→test→
  smoke→docs tamamlanır, durulur.
