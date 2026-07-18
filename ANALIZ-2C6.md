# ANALIZ-2C6 — Phase 2C-6 · Warehouse-Aware Inventory Engine (TODO-152)

> Bu doküman KOD YAZILMADAN ÖNCE zorunlu analizdir. Mevcut veri modeli, stok
> semantiği, checkout/sipariş akışı ve concurrency riskleri incelenmiş; en güvenli
> **additive** mimari kararlaştırılmıştır. Commit/push/PR/merge/deploy YAPILMAZ.

---

## 0. Yöntem — İncelenen gerçek kaynaklar

| Katman | Dosya | Bulgu |
|---|---|---|
| Şema | `packages/db/prisma/schema.prisma` | `InventoryItem` (929), `InventoryMovement` (945), `InventoryReservation` (1323); enum `InventoryMovementType` (177), `InventoryReservationStatus` (252), `ProductVariantStatus` (162) |
| Order/stok | `apps/api-gateway/src/server.ts` | `placeOrder` (3592) → rezerve; `cancelOrder` (3687) → serbest; `adjustInventory` (3048); public stok `loadPublicStockMap` (4124); `buildPublicVariant` (1613) |
| Motor şablonu | `apps/api-gateway/src/commercial-engine/*` | SAF katmanlar + data(advisory-lock/applyWrites) + service(stale-guard) + routes; ADR-074 |
| Migration | `20260713120000_add_product_primary_category`, `20260718140000_add_commercial_engine` | Deterministik + idempotent (`WHERE ... IS NULL`) backfill; tamamen additive |
| UI | `apps/store-admin-web/app/(app)/products/pricing/*`, `[id]/page.tsx` | Tam genişlik "Fiyatlandırma" sekmesi; semantic token (`--pw-*`, `globals.css`); guided bulk |
| Seed | `packages/db/scripts/seed.ts` | Tek demo store, 3 varyant, `inventoryItem.upsert` (315) |

---

## 1. Mevcut `InventoryItem` authoritative stok kaynağı mı?

**Evet.** `InventoryItem` bugün tek otoriter stok kaynağıdır. `variantId @unique` — yani
**varyant başına tek satır** (implicit tek-depo). Alanlar: `quantityOnHand`,
`quantityReserved`, `lowStockThreshold?`. Checkout (`placeOrder`), iptal (`cancelOrder`),
storefront (`loadPublicStockMap`) ve admin (`adjustInventory`) hepsi bu tabloyu okur/yazar.

## 2. Mevcut sistem tek depo varsayımı mı yapıyor?

**Evet.** `InventoryItem.variantId @unique` yapısal olarak "varyant = tek stok satırı"
demektir. Hiçbir warehouse kavramı yoktur. Bu faz warehouse boyutunu **additive** ekler.

## 3. `quantity` alanı on-hand mı available mı temsil ediyor?

`quantityOnHand` = **fiziksel eldeki** (on-hand). `quantityReserved` = ayrılmış.
`available` **DB'de tutulmaz**, her okuma noktasında `onHand − reserved` olarak
**hesaplanır** (`serializeInventoryItem` 1387; `loadPublicStockMap` 4126; `placeOrder` 3632).

## 4. Reserved stok bugün gerçekten tutuluyor mu?

**Evet, gerçek.** `placeOrder` sipariş satırları için `quantityReserved += qty` yapar,
`InventoryReservation(status=ACTIVE)` + `InventoryMovement(SALE_RESERVATION)` yazar.
`cancelOrder` `quantityReserved -= qty`, rezervasyonu `RELEASED` işaretler, `SALE_RELEASE`
yazar. Rezervasyon **hesap-defteri düzeyinde canlı** çalışır.

## 5. Checkout hangi stok alanını kontrol ediyor?

`placeOrder` (3624-3632): `SELECT "quantityOnHand","quantityReserved" ... FOR UPDATE` →
`onHand − reserved < line.quantity` ise `INSUFFICIENT_STOCK`. Yani **available = onHand −
reserved** (safety stock YOK). `FOR UPDATE` satır kilidi lost-update'i önler.

## 6. Sipariş oluşturulurken stok düşüyor mu, rezerve mi ediliyor?

**Rezerve ediliyor** (`onHand` sabit kalır, `reserved` artar). `onHand`'ten düşme (commit)
bu fazın kapsamı dışında; fulfillment→commit akışı yoktur (TD).

## 7. Sipariş iptalinde stok geri geliyor mu?

**Evet.** `cancelOrder` aktif rezervasyonların `reserved`'ını azaltır (release). `onHand`
zaten düşmediği için "geri gelme" reserved serbest bırakma ile olur.

## 8. Overselling şu anda mümkün mü?

**Hayır (tek depo, mevcut akışta).** `FOR UPDATE` + `onHand − reserved` kontrolü aynı
transaction'da atomiktir → eşzamanlı iki checkout serileşir. Bu faz bu korumayı
**BOZMAYACAK** ve iyileştirdiğini de İDDİA ETMEYECEK.

## 9. Multi-warehouse migration mevcut veriyi nasıl korumalı?

Tamamen additive: yeni `Warehouse` + `InventoryBalance` + `InventoryAdjustment` tabloları.
Backfill deterministik + idempotent: her store için 1 **default warehouse**, her mevcut
`InventoryItem` için default-warehouse'da bir `InventoryBalance` (onHand/reserved birebir
kopyalanır; yeni alanlar 0). Mevcut `InventoryItem` **silinmez, sıfırlanmaz**.

## 10. Varsayılan depo nasıl oluşturulmalı?

Migration içinde **deterministik id** (`{storeId}` bağımlı, örn. `SELECT` ile store başına
bir satır) + `code='DEFAULT'`, `name='Ana Depo'`, `isDefault=true`, `status='ACTIVE'`,
`priority=0`. Store başına tam bir default garantisi partial unique index ile korunur.
Seed de default warehouse + balance upsert eder.

## 11. `InventoryItem` modeli korunmalı mı, dönüştürülmeli mi?

**Korunmalı (dönüştürülmez).** Yıkıcı rename/drop YOK. `InventoryItem` default-warehouse
için **onHand/reserved'ın canlı otoritesi** olmaya devam eder (checkout/storefront sıfır
regresyon). `InventoryBalance` warehouse-aware katmanı ekler; default-warehouse için
onHand/reserved bir **uyum aynası** (compatibility mirror), yeni alanların (safety/incoming/
reorder) otoritesidir. Bkz. §Mimari.

## 12. Available değer DB'de tutulmalı mı, hesaplanmalı mı?

**Hesaplanmalı** (materialize edilmez). Türetilmiş değeri saklamak tutarsızlık riski
üretir (reserved sipariş akışıyla değişir). SAF `computeAvailability()` resolver'ı
`available = onHand − reserved − safetyStock` döndürür. Reddedilen alternatif: `available`
kolonu.

## 13. Safety stock hangi katmanda uygulanmalı?

**Availability resolver katmanında** (SAF), otoriteye/DB'ye değil. `sellableAvailable =
max(0, onHand − reserved − safetyStock)`. Bu faz **admin görünürlüğü**dür: checkout hâlâ
`onHand − reserved` kullanır (sıfır regresyon; ADR'de açık). Safety stock varsayılan 0 →
mevcut davranış birebir korunur.

## 14. Incoming stock satışa açık sayılmalı mı?

**Hayır.** `incoming` beklenen mal; availability'ye **dahil edilmez**. Yalnız bilgi/planlama
göstergesi (KPI + reorder bağlamı).

## 15. Concurrent stock mutation nasıl korunmalı?

`pg_advisory_xact_lock(hashtext(storeId + productId + warehouseId))` — Prisma'da `void`
döndüğü için **`$executeRaw`** (2C-3 dersi; `$queryRaw` 500 verir). Aynı product+warehouse
apply'ları serileşir. Ek: default-warehouse compatibility sync'i `InventoryItem` yazarken
mevcut `FOR UPDATE` satır-kilidi deseniyle uyumlu.

## 16. Direct edit ile adjustment ledger birlikte nasıl çalışmalı?

Her ikisi de aynı apply transaction'ında: değişen alan başına bir `InventoryAdjustment`
satırı (append-only, `batchId` gruplu, `oldValue/newValue/delta/field/source`). Direct
edit `source=MANUAL_EDIT`, bulk `source=BULK_OPERATION`. Ledger = audit; balance = özet.

## 17. Archived varyantların stokları nasıl ele alınmalı?

Commercial/identity deseni: kapsam **non-archived** (DRAFT+ACTIVE). Archived varyant bulk
apply'a **girmez** (data katmanı `status != ARCHIVED` filtreler); direct-edit archived
hedeflerse `INVENTORY_VARIANT_NOT_FOUND` (kapsam dışı). Balance kayıtları silinmez.

## 18. Storefront davranışı bu fazda ne kadar değişmeli?

**Değişmemeli.** `loadPublicStockMap` / `buildPublicVariant` `InventoryItem` okumaya devam
eder → sıfır regresyon. Admin default-warehouse `onHand` düzenlemesi aynı transaction'da
`InventoryItem.quantityOnHand`'e senkronlandığı için storefront **anında** yansıtır.

## 19. Reservation modelini bu fazda gerçekten genişletmek güvenli mi?

**Hayır — foundation'a öncelik.** **Alternatif A** seçildi: `reserved` sistem-kontrollü
alan olarak modellenir; mevcut sipariş akışı (`InventoryItem` + `FOR UPDATE`) **DEĞİŞMEZ**.
Warehouse-aware reservation/allocation TD olarak açılır. "Overselling çözüldü" İDDİA EDİLMEZ.

## 20. Migration sırasında mevcut stokların kaybolmaması nasıl garanti edilir?

(a) Yalnız `CREATE TABLE` + backfill `INSERT ... SELECT` (mevcut satırlara DOKUNMAZ);
(b) backfill `onHand=quantityOnHand`, `reserved=quantityReserved` birebir kopyalar;
(c) `WHERE NOT EXISTS` guard → idempotent, re-run mevcut değeri ezmez;
(d) `InventoryItem` otorite kalır — balance türetilmiş; veri kaybı yapısal olarak imkânsız;
(e) `db push` / drop / reset / volume prune **YASAK**.

---

## Mimari Karar — "InventoryItem otorite + InventoryBalance warehouse-aware katman"

### Rol dağılımı

| Alan | Default warehouse | Non-default warehouse |
|---|---|---|
| `onHand` | **`InventoryItem` otorite**; `InventoryBalance` uyum aynası (apply'da senkron) | **`InventoryBalance` otorite** |
| `reserved` | **`InventoryItem` otorite** (sipariş akışı); admin salt-okur; matris canlı okur | 0 (sipariş entegrasyonu bu fazda yok) |
| `safetyStock` | **`InventoryBalance` otorite** | **`InventoryBalance` otorite** |
| `incoming` | **`InventoryBalance` otorite** | **`InventoryBalance` otorite** |
| `reorderPoint` | **`InventoryBalance` otorite** | **`InventoryBalance` otorite** |

### Neden bu tasarım
- **Sıfır regresyon:** checkout/storefront/sipariş `InventoryItem` üzerinde hiç değişmeden çalışır.
- **Tek otorite (duplicate yok):** default-warehouse `onHand` mantıksal olarak TEK değerdir;
  apply transaction'ı iki tabloyu **atomik senkron** tutar (aynura değil, senkron ayna).
  Matris okuması default warehouse için onHand/reserved'ı **canlı `InventoryItem`'dan** okur
  → legacy `adjustInventory` ile yazılsa bile stale okuma imkânsız (self-healing).
- **Order-flow cerrahisi yok:** reservation lifecycle'a dokunulmaz → düşük risk.
- **Warehouse-aware gelecek:** non-default depolar tam `InventoryBalance` otoritesiyle çalışır.

### Available semantiği (SAF resolver)
```
rawAvailable      = onHand − reserved − safetyStock        // negatif olabilir (gösterim)
sellableAvailable = max(0, rawAvailable)                   // satışa açık (clamp ≥ 0)
incoming          // availability'ye DAHİL DEĞİL
```
Checkout bu fazda hâlâ `onHand − reserved` kullanır (safety stock admin-görünürlük;
ADR-076'da açık). Örnek: onHand 10, reserved 3, safety 2, incoming 20 → raw 5, sellable 5.

### Katmanlar (`apps/api-gateway/src/inventory-engine/`)
SAF: `types.ts`, `availability.ts`, `calculator.ts`, `validation.ts`, `fingerprint.ts`,
`diff-engine.ts`, `preview.ts`. IO: `data.ts` (advisory-lock, InventoryItem köprüsü,
changed-only write, audit), `service.ts` (orkestrasyon + stale-guard), `routes.ts`.

### Operasyon modları
- **Direct Edit:** onHand / incoming / safetyStock / reorderPoint (reserved DÜZENLENEMEZ).
- **Bulk (guided):** onHand set/artır/azalt, incoming set/artır, safety set, reorder set,
  onHand sıfırla (yüksek etki, açık onay + preview). `SET_ABSOLUTE` / `ADJUST_DELTA` ayrımı.

### Negatif politikası
`onHand/reserved/incoming/safetyStock/reorderPoint` sonucu **negatif olamaz** (blocking).
Negatif delta işlemi serbest ama sonuç `< 0` → `INVENTORY_NEGATIVE_STOCK`. `available`
negatif olabilir (yalnız gösterim/uyarı).

### API
```
GET  /stores/:storeId/warehouses
GET  /stores/:storeId/products/:productId/inventory[?warehouseId=]
POST /stores/:storeId/products/:productId/inventory/preview
POST /stores/:storeId/products/:productId/inventory/apply
```
Warehouse CRUD UI bu fazı büyütür → **minimum default warehouse foundation + read endpoint**
uygulanır (create/update/set-default/deactivate TD; gerekçe: ana odak product inventory
workspace, tek default depo yeterli MVP).

### Stable error kodları
`PRODUCT_NOT_FOUND`, `WAREHOUSE_NOT_FOUND`, `INVENTORY_BALANCE_NOT_FOUND`,
`INVENTORY_VARIANT_NOT_FOUND`, `INVENTORY_INVALID_AMOUNT`, `INVENTORY_INVALID_RULE`,
`INVENTORY_NEGATIVE_STOCK`, `INVENTORY_INVALID_RESERVED`, `INVENTORY_OVERFLOW`,
`INVENTORY_SELECTION_EMPTY`, `INVENTORY_PREVIEW_STALE`, `INVENTORY_APPLY_BLOCKED`,
`INVENTORY_WAREHOUSE_INACTIVE`, `INVENTORY_TENANT_MISMATCH`, `INVENTORY_CONFLICT`,
`INVENTORY_LOCK_CONFLICT`.

### Big-O (n=varyant, f=alan, c=değişen, w=warehouse)
availability O(n) · validation O(n·f) · diff O(n·f) · persistence O(c) · audit O(değişen alan).
Ekran tek warehouse → O(n) (O(n·w) DEĞİL). Nested varyant-varyant karşılaştırması YOK.

### Kapsam dışı (TD)
full reservation lifecycle · fulfillment commit · warehouse-aware checkout/allocation ·
stock transfer · purchase order · supplier receiving · bin/shelf · lot/batch/serial ·
expiry · cycle count · reconciliation · ERP/marketplace sync · background worker/scheduler ·
low-stock notification · 1000+ row virtualization · warehouse CRUD UI · real-PG concurrency
integration test (altyapı uygunsa eklenecek).
