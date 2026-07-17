# ANALIZ-2C3 — ProductVariant Persistence & Incremental Diff Engine (TODO-149)

Bu doküman, kod yazmadan önce yapılan zorunlu analizi ve alınan tasarım kararlarını içerir.
Combination Engine (`engine.ts`) SAF ve DEĞİŞTİRİLMEZ; persistence/diff ayrı katmandadır.

## Mevcut durum (incelenen)

- `ProductVariant` (schema.prisma:765): `id`, `productId`, `storeId`, `title`, `sku` (NOT NULL),
  `barcode?`, `priceMinor` (NOT NULL Int), `compareAtMinor?`, `costMinor?`, `netPriceMinor?`,
  `vatRateBps @default(2000)`, `vatAmountMinor?`, `currency` (NOT NULL), `status`
  (`ProductVariantStatus DRAFT|ACTIVE|ARCHIVED @default(ACTIVE)`), `optionValues Json?`,
  `shippingWeightKg?`, `shippingDesi?`. Unique: `@@unique([storeId, sku])`.
- İlişkiler: `inventory InventoryItem?` (1-1, **nullable**), `movements`, `orderLines`,
  `reservations`, `attributeValues VariantAttributeValue[]`. onDelete: Product→Cascade, Store→Cascade.
- Mevcut `createVariant` (server.ts:2847) her varyant için `InventoryItem` (qty 0) + `ProductPriceChange`
  (başlangıç audit) yazar; hepsi tek transaction.
- Storefront/checkout aktif varyant filtresi `status === "ACTIVE"` üzerinden (server.ts buildPublicVariant,
  reservation guard `variant.status !== "ACTIVE"`). ARCHIVED varyantlar zaten vitrine çıkmaz.
- Faz 2C-1: `ProductVariantAttribute` (ürün×eksen) + `ProductVariantOptionSelection` (eksen×option)
  reçetesi (JSON yok). `variantSelectionService` tek yazma otoritesi.
- Faz 2C-2: SAF `generateVariantCombinations(axes, {maxCombinations})` → canonical `combinationKey`
  (`v1|<attrId>:<optId>|...`) + deterministik `previewId`. Guard `MAX_PREVIEW_COMBINATIONS` (config, default 1000).
- `VariantAttributeValue` (schema:2269): (variantId, attributeDefinitionId) unique; `valueText?`/`optionId?`;
  Faz 2A `attributeValueService` **tek yazma otoritesi**.

## 10 zorunlu sorunun cevabı

**1. ProductVariant'a hangi additive alanlar?**
- `generationSource VariantGenerationSource @default(MANUAL)` — mevcut/legacy varyantlar sabit
  default ile MANUAL olur (non-destructive backfill; tahminî combinationKey ÜRETİLMEZ).
- `combinationKey String?` — yalnız üretilmiş varyantlarda dolu; manuel varyantlarda null.
- `archivedAt DateTime?` — soft-archive audit zaman damgası (ne zaman arşivlendi). Arşiv MEKANİZMASI
  yine `status = ARCHIVED`'dır (storefront zaten dışlar); `archivedAt` yalnız metadata.

**2. combinationKey hangi unique ile korunmalı?**
`@@unique([productId, combinationKey])`. PostgreSQL NULL'ları unique index'te DISTINCT sayar →
manuel varyantların `null` key'i asla çakışmaz (çok sayıda manuel varyant serbest), üretilmiş
varyantların non-null key'i aynı ürün altında tek olur. Farklı ürünlerde aynı key serbest (productId
key'de). Ek partial index GEREKMEZ; standart composite unique NULL-distinct semantiğiyle yeterlidir.
Bu unique aynı zamanda concurrency insert-conflict (P2002) korumasının temelidir.

**3. Silinen kombinasyonlar hard/soft/archive?**
SOFT ARCHIVE. Hedef kümede olmayan ÜRETİLMİŞ varyant `status=ARCHIVED` + `archivedAt=now` olur.
Hard-delete YOK (inventory/order/audit/fiyat geçmişi/marketplace referansları geleceğe dönük korunur).

**4. Inventory/order ilişkili varyant silme neden tehlikeli?**
Order line `variantId` FK'sı (OrderLine.variantId → ProductVariant), InventoryReservation, InventoryMovement,
InventoryItem varyanta bağlı. Hard-delete geçmiş sipariş satırlarını ve stok hareketlerini bozar/yetim
bırakır, muhasebe/raporlama tutarlılığını kırar. Bu yüzden yalnız arşivleme.

**5. Legacy/manuel varyantlar nasıl ayrıştırılır?**
`generationSource` enum. Sistem YALNIZ `ATTRIBUTE_COMBINATION` kaynaklı varyantları archive/restore eder.
`MANUAL` varyantlara (mevcut tüm varyantlar default MANUAL) DOKUNULMAZ; combinationKey atanmaz.

**6. Mevcut title/SKU/price/inventory nasıl korunur?**
Diff'te `toKeep` ve `toRestore` yollarında bu alanlara YAZILMAZ. Yalnız `toCreate` yeni varyanta güvenli
başlangıç verir. Restore YALNIZ `status`+`archivedAt` günceller (SKU/barcode/price/cost/inventory dokunulmaz).

**7. Concurrent generation nasıl güvenli?**
(a) DB unique `(productId, combinationKey)` — duplicate insert P2002 ile reddedilir.
(b) Transaction başında PostgreSQL **advisory xact lock** (`pg_advisory_xact_lock(hashtext(productId))`)
→ aynı ürün için generation'lar serileşir; ikinci çağrı ilkini bekler, sonra idempotent çalışır.
(c) Beklenmedik P2002 → kontrollü `VARIANT_GENERATION_CONFLICT` (409). Yalnız app-level check'e güvenilmez.

**8. İlk üretimde SKU zorunluluğu?**
SKU NOT NULL + `@@unique([storeId, sku])`. Bu faz SKU Matrix DEĞİL. Bu yüzden DETERMİNİSTİK sistem SKU:
`sku = "V-" + productId + "-" + shortHash(combinationKey)`. productId cuid (mağaza içi + global tekil) →
ürünler arası çakışma yok; shortHash(combinationKey) ürün içi kombinasyonları ayırır. Deterministik
(random/timestamp YOK), yeniden üretimde değişmez, kullanıcı SKU Matrix'te (2C-4) değiştirebilir. Restore
mevcut SKU'yu KORUR (kullanıcı düzenlemesi ezilmez).

**9. Yeniden üretimde kullanıcı düzenlemesi nasıl korunur?**
Diff `toKeep`/`toRestore` = write yok / yalnız status flip. `toCreate` yalnız DAHA ÖNCE VAR OLMAYAN
combinationKey için çalışır. Idempotent: aynı reçete ikinci kez → created=0/restored=0/archived=0,
mevcut ID/SKU/updatedAt korunur (keep hiçbir update yapmaz).

**10. VariantAttributeValue mi, yeni normalize model mi?**
YENİ model: `ProductVariantOptionValue` (variantId, attributeDefinitionId, optionId; unique(variantId,
attributeDefinitionId)). Gerekçe: `VariantAttributeValue`'nun TEK yazma otoritesi 2A `attributeValueService`;
persistence-service oraya yazarsa single-writer invariantı kırılır ve kullanıcının girdiği variant
attribute değerleri ezilebilir. Üretilmiş varyantın çözülmüş eksen→option seçimi, combinationKey ile
tutarlı ve persistence-service'e ait olmalı → ayrı tablo. `optionValues Json?` bu fazda AUTHORITATIVE
DEĞİL, yazılmaz.

## Diff Engine (saf) sözleşmesi
`diffVariantCombinations(existing, target)` → `{ toCreate, toKeep, toRestore, toArchive, manualVariants }`.
Map<combinationKey, existingGenerated> (O(E)) + target tarama (O(P)) → **O(P+E)**, nested O(P×E) YOK.
Girdi mutasyonu yok; çıktı combinationKey'e göre deterministik sıralı.

## Yeni varyant başlangıç değerleri
status=DRAFT (vitrine sızmaz), generationSource=ATTRIBUTE_COMBINATION, combinationKey set,
title=option label'ları " / " ile birleşik, sku=deterministik placeholder, priceMinor=0,
netPriceMinor=0, vatRateBps=2000, vatAmountMinor=0, currency=mevcut varyant currency veya "TRY",
optionValues=null. **InventoryItem OLUŞTURULMAZ** (görevin "inventory oluşturma/değiştirme yasak" kuralı;
ilişki nullable; SKU Matrix/adjust upsert'i ileride lazy oluşturur). ProductPriceChange audit de yazılmaz
(price 0 placeholder; gerçek fiyat SKU Matrix'te → audit orada).

## Boş reçete
Reçetede eksen yoksa → `VARIANT_SELECTION_EMPTY` (hiçbir yazım yok, sessiz archive YOK).
Eksen var ama tüm option'lar archived → 0 kombinasyon → `INVALID_VARIANT_SELECTION`.

## Eksen ekleme/kaldırma semantiği
combinationKey eksen kümesini kodlar (`v1|attrId:optId|...`). Eksen sayısı değişince key değişir →
eski kombinasyonlar target'ta YOK → archive; yeni kombinasyonlar create. Rename/position identity'yi
DEĞİŞTİRMEZ (key ID-tabanlı).
