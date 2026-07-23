# TODO-159C — Inventory Matrix Scalability · Ön Analiz

**Tarih:** 2026-07-23 · **Öncül:** ADR-089 (Admin Data Grid), ADR-090 (Admin Searchable Selector), ADR-076 (Inventory Engine), TODO-152A (stok izleme merkezi) · **Kapatılan borç:** TD-091

Bu belge, `GET /stores/:id/inventory/matrix` ucunun ve `/inventory` Store Admin ekranının
sunucu-otoriter listelemeye taşınmasından ÖNCEKİ durumun tespitidir. Kod değiştirmeden önce
yazılmıştır; hedef mimari kararları ADR-092'de gerekçelendirilir.

---

## 1. Kök problem

### 1.1 Sınırsız uç
`GET /stores/:storeId/inventory/matrix` ([routes.ts:81](../../apps/api-gateway/src/inventory-engine/routes.ts#L81))
yalnız `?warehouseId=` kabul eder; **sayfalama, arama, filtre, sıralama YOK.** Servis
(`storeMatrix`, [service.ts:324](../../apps/api-gateway/src/inventory-engine/service.ts#L324))
`dataAccess.listStoreVariants(storeId, warehouse)` çağırır. Veri erişimi
(`readStoreVariants`, [data.ts:225](../../apps/api-gateway/src/inventory-engine/data.ts#L225))
mağazadaki **TÜM non-archived varyantları TEK sorguda** çeker:

```ts
const variants = await prisma.productVariant.findMany({
  where: { storeId, status: { not: "ARCHIVED" } },   // ← LIMIT/OFFSET yok
  orderBy: [{ productId: "asc" }, ...variantOrderBy],
  select: { …, product: { select: { title, slug } }, optionValueSelections: {…} },
});
```

Okuma BATCH'lidir (3 sorgu: variants + balances + items; **N+1 yok**) ama **sınırsızdır**:
enterprise-demo'da 2.202 varyant + bakiyeleri + InventoryItem'ları belleğe alınır, `.map` edilir
ve tek yanıtta döner.

### 1.2 Tamamen istemci-taraflı ekran
`/inventory` ekranı ([page.tsx](../../apps/store-admin-web/app/(app)/inventory/page.tsx)):
- Tüm matrisi tek çağrıyla çeker (`getStoreInventoryMatrix`), `rows` state'ine koyar.
- **Arama + durum filtresi istemcide** (`visibleRows = rows.filter(...)`, page.tsx:130) — URL'de değil, local `useState`.
- **KPI kartları tüm `rows` üzerinden** (`kpi` useMemo, page.tsx:105) — sayfadan değil ama tüm dataset belleğe alındığı için "ücretsiz".
- Sıralama yok (kanonik sıra sunucudan gelir).
- Seçili satır / bulk action YOK; her satırda güvenli tek-satır hızlı işlem (+10/−10/sıfırla) ürün-bazlı preview→apply uçlarını çağırır (ADR-076 korunur).

### 1.3 Sözleşme sayfalama taşımıyor
`inventoryStoreMatrixResponseSchema` = `{ warehouse, rows: [...] }`
([contracts:1357](../../packages/contracts/src/index.ts#L1357)). `adminListPaginationSchema`
meta'sı YOK. Bu yüzden TD-091 "yalnız UI değişikliği değildir" der: sözleşme + veri erişimi +
izleme semantiği BİRLİKTE ele alınmalı.

### 1.4 Payload boyutu (ölçüm)
Satır başına ~11 alan (product title/slug, variant sku/title/status, attributes[], current{5},
currentCalc{4}). 2.202 satır → tahmini **~1.1–1.6 MB JSON** tek yanıtta. İlk boyama gecikir
(sayfa donmaz ama "ağır" hissedilir; TD-091). 50k+ varyantta yanıt onlarca MB'a çıkar → pratikte kullanılamaz.

---

## 2. Ekranda gerçekten kullanılan alanlar

| Alan | Kullanım |
|---|---|
| `productId`, `productTitle` | "Ürün" kolonu + `/products/{id}?tab=inventory` linki |
| `productSlug` | (kullanılmıyor — payload'da taşınıyor) |
| `variantId` | rowKey |
| `sku` | SKU kolonu + arama |
| `title`, `attributes[]` | Varyant etiketi (attributes varsa onlar, yoksa title) + arama |
| `status` | (global ekranda gösterilmiyor; satır kanonik) |
| `current.{onHand,reserved,safetyStock,incoming,reorderPoint}` | Sayısal kolonlar |
| `currentCalc.{sellableAvailable,status}` | Satılabilir kolonu + durum rozeti; `rawAvailable`/`reservedRatioPct` kullanılmıyor |
| `balanceExists` | (dolaylı — status NO_BALANCE üretir) |

**Sonuç:** `productSlug`, `rawAvailable`, `reservedRatioPct` ekranda kullanılmıyor ama sözleşme
gereği taşınıyor. Yeni sözleşmede sadeleştirilmeyecek (geriye-uyumluluk) ama `updatedAt` + `barcode`
EKLENECEK (sıralama + arama görünürlüğü için).

---

## 3. Stok otoritesi (kritik — çift otorite)

`buildCurrentState` ([data.ts:138](../../apps/api-gateway/src/inventory-engine/data.ts#L138)):

```
onHand    = default-depo ? InventoryItem.quantityOnHand  (yoksa balance.onHand   ?? 0) : balance.onHand ?? 0
reserved  = default-depo ? InventoryItem.quantityReserved (yoksa balance.reserved ?? 0) : balance.reserved ?? 0
incoming/safetyStock/reorderPoint = balance ?? 0   (her iki durumda)
```

**Çift otorite (ADR-076):** DEFAULT depoda `onHand`/`reserved` CANLI otoritesi `InventoryItem`'dır
(checkout/storefront orayı okur/yazar); non-default depoda otorite tamamen `InventoryBalance`'tır.
`incoming`/`safetyStock`/`reorderPoint` her zaman `InventoryBalance`'tan. Bu overlay yeni SQL
tabanlı taramada **birebir korunmalıdır** — aksi halde admin ekranı checkout ile farklı stok gösterir.

### Türetme formülü (TEK otorite: SAF motor)
- `available (raw) = onHand − reserved − safetyStock` ([availability.ts:22](../../apps/api-gateway/src/inventory-engine/availability.ts#L22))
- `sellable = max(rawAvailable, 0)` (negatif satılabilir stok üretmez)
- `status` ([calculator.ts:25](../../apps/api-gateway/src/inventory-engine/calculator.ts#L25)):
  `!balanceExists→NO_BALANCE`, `raw<0→NEGATIVE`, `sellable=0 & incoming>0→INCOMING`,
  `sellable=0→OUT_OF_STOCK`, `reorderPoint>0 & sellable≤reorderPoint→LOW_STOCK`, aksi `IN_STOCK`.

Bu formül **search read-model** (`available = onHand − reserved`, InventoryItem otorite,
[contracts:1805](../../packages/contracts/src/index.ts#L1805)) ve **checkout** ile aynı otoriteyi
kullanır. Not: search read-model `safetyStock` çıkarmaz (ürün-seviyesi "satın alınabilir mi"
sorusu); inventory matrix `safetyStock` çıkarır (operasyonel satılabilir). Bu **kasıtlı** farktır,
formül çelişkisi değil — matris operasyon merkezidir, safetyStock'u operatör görmelidir.

---

## 4. N+1 / sorgu maliyeti

- Mevcut okuma: 3 sorgu (variants + balances + items), N+1 YOK, ama sınırsız.
- Sıralama/filtre/count için türetilmiş kolonlar (available/status) gerekir → tek raw SQL tarama
  (Product join + InventoryBalance LEFT JOIN [unique index] + InventoryItem LEFT JOIN [default]).
- `buildAdminProductScanSql` ([server.ts:2442](../../apps/api-gateway/src/server.ts#L2442)) deseni:
  `$queryRaw` + `Prisma.sql` + `ILIKE ... ESCAPE '\\'` wildcard kaçışı + `NULLS LAST` + ikincil `id` anahtarı.

---

## 5. İndeks durumu

`ProductVariant`: `@@unique([storeId, sku])`, `@@unique([productId, combinationKey])`,
`@@index([productId])`, `@@index([storeId])`, `@@index([status])`. **Kompozit `[storeId, status]` YOK.**
Matrisin birincil filtresi `storeId = ? AND status <> 'ARCHIVED'`. 2.202 satırda `[storeId]` yeterli;
50k+ için `[storeId, status]` taranan kümeyi daraltır. → **Additive index önerisi:** `@@index([storeId, status])`
(EXPLAIN ile doğrulanacak).

`InventoryBalance`: `@@unique([warehouseId, variantId])` — LEFT JOIN `ib.variantId=v.id AND ib.warehouseId=?`
bunu kullanır. `InventoryItem`: `variantId @unique` — default depo overlay JOIN'i bunu kullanır. Ek indeks GEREKMEZ.

---

## 6. Bulk action durumu

Global ekranda **seçili satır / bulk action YOK** (bugün). Yalnız güvenli tek-satır hızlı işlem
(+/−/sıfırla) var ve o da ürün-bazlı preview→apply'ı çağırır (ADR-076: yazma ürün-scoped kalır;
fan-out yazma motoru yoktur). Bu fazda **sahte bulk eklenmeyecek**; ancak Data Grid seçim altyapısı
(opsiyonel `selectedIds`/`onSelectionChange`) sonradan gerçek bulk için hazır kurulacak ve
"görünen sayfa" vs "filtreye uyan tüm kayıtlar" ayrımı ADR-092'de dokümante edilecek.

---

## 7. Summary metrikleri

Bugün KPI'lar tüm dataset belleğe alındığı için `rows` üzerinden hesaplanıyor. Sunucu-otoriter
sayfalamadan sonra istemci artık tüm satırlara sahip DEĞİL → KPI'lar **ayrı aggregate sorguyla,
aktif filtrelerle tutarlı, sayfadan bağımsız** hesaplanmalı. Aksi halde "toplam elde stok" yalnız
25 satırın toplamı olur (yanıltıcı). Yeni `summary` alanı response'a eklenecek.

---

## 8. Hedef mimari (özet — detay ADR-092)

- **Query:** `page`/`pageSize`(≤100)/`search`/`sortBy`(allowlist)/`sortOrder` + `warehouseId` +
  `stockStatus`(enum) + `reserved`(yes/no) + `variantStatus` + `productStatus`. Ortak
  `adminListQueryBaseSchema.extend(...)`.
- **Response:** `{ warehouse, rows, pagination, summary }` — `rows` bir SAYFA, `pagination`
  `adminListPaginationSchema`, `summary` tüm filtreli küme.
- **Veri erişimi:** tek raw SQL CTE (base overlay + türetilmiş available/status), sayfa taraması
  (LIMIT/OFFSET) + summary aggregate (COUNT + SUM + FILTER) + attributes hidrasyonu (sayfa id'leri
  için tek `findMany`). Toplam 3 sorgu; N+1 yok.
- **Formül otoritesi:** satır `currentCalc` yine SAF `computeCalc` ile JS'te hesaplanır (tek otorite);
  SQL türetmesi YALNIZ filtre/sıralama/summary için — bir test SQL türetmesi ile `computeCalc`
  paritesini garanti eder.
- **UI:** `products/page.tsx` deseni — `useDataGridQuery` + `DataGridToolbar`/`DataGrid`/`DataGridPagination`.
  Hızlı işlem butonları satır aksiyonu olarak korunur; KPI'lar server `summary`'den.
- **İndeks:** additive `ProductVariant [storeId, status]` (EXPLAIN ile doğrulanır).

## 9. Kapsam sınırları (uydurma kavram yok)

- Filtre olarak **category/brand/vendor eklenmez** bu fazda — matris varyant-stok merkezlidir; bu
  ürün-facet'leri additive olarak sonradan eklenebilir (küçük TD). stockStatus enum'u in/out/low/
  incoming/negative/no_balance'ı TEK filtrede kapsar (ayrı `inStock`/`outOfStock`/`lowStock` boolean'ları
  redundant olurdu → tek kanonik enum tercih edildi).
- Yazma/bulk fan-out motoru eklenmez (ADR-076 korunur).
- `available` kolonu materialize edilmez (türetilir; ADR-076).
