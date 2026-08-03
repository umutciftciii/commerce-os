# BUG-CART-002 — PDP availability, cart badge and line-selection consistency

**Durum:** ✅ CLOSED & DEPLOYED (PR #167 MERGED, main merge `cf6823a` / fix `37a30de`; api-gateway + storefront-web
main'den rebuild+recreate; migrate status "up to date" — yeni migration yok; post-deploy smoke PASS :4000/:3000).
**Tarih:** 2026-08-03
**Kapsam:** Storefront (PDP buy-box + cart) + api-gateway (public katalog/sepet projeksiyonu + auth cart route).
**İlişki:** TODO-167/ADR-266 (Persistent Cart) + TODO-168/ADR-267 (Cart Change Awareness) SONRASI regresyon.
Aynı bounded-scan sınıfı: `pdp-404-public-catalog-max`.

## Belirti (kanıtlanan)

1. **A — PDP stok dışı varyant sepete eklenebiliyor:** kullanıcı tükenmiş varyantı seçtiğinde "Sepete
   eklendi" çıkıyor; sepette satır `STOKTA KALMADI` oluyor; checkout bloke.
2. **B — Header cart badge güncellenmiyor:** PDP'de başarılı add sonrası rozet değişmiyor (hard refresh
   gerekiyor); sepet sayfasında ürün var.
3. **C — Cart line seçimi + özet bozuk:** stok dışı/deselect satırın checkbox'ı kalmıyor (auth); sipariş
   özeti "0 ürün" iken kargo ₺49,90 + genel toplam ₺49,90 gösteriyor.

## Kök nedenler (kanıtlı)

### A1 — PDP fail-OPEN bounded stok projeksiyonu (BİRİNCİL)
PDP detay ucu (`GET /public/stores/:slug/products/:slug`) varyant stoğunu `loadPublicStockMap` →
`listInventory(store, { limit: PUBLIC_CATALOG_MAX=200, orderBy: updatedAt desc })` ile alıyordu — mağazanın
YALNIZ en son güncellenen 200 envanter satırı. Bu pencerenin dışındaki varyantın stok satırı haritada
bulunmaz → `buildPublicVariant`'ta `available = stockByVariantId.has(id) ? … : null` → `inStock =
available===null ? true : available>0` **fail-open** true olur. Sepet/checkout ise varyant-bazlı DOĞRUDAN
lookup (`findInventoryByVariantIds`) kullandığından GERÇEK `available:0`'ı görür → PDP↔sepet tutarsızlığı.
Kod yorumu bunu bizzat yasaklıyordu (`server.ts` `findInventoryByVariantIds` doc: "bounded scan stok kapısı
için değil; eksik stok fail-open null'a düşmemeli"). Enterprise-demo (471 ürün × varyant = binlerce envanter
satırı) bu penceyi kolayca aşar.

**Canlı kanıt (OLD :4000 deployed vs NEW worktree gateway):**
`EDM-MON-0083-32-75HZ` (Kingston UltraGear Monitör 32"/75Hz) — OLD: `available=None, inStock=True`
(fail-open, PDP'de eklenebilir); NEW: `available=0, inStock=False` (doğru OOS, disabled+strikethrough).

### A2 — Add endpoint stok kontrolü yok (fail-OPEN, İKİNCİL)
`POST /customer/cart/lines` yalnız varyant store-ownership doğruluyordu; `addOrIncrementLine` yalnız
version/limit/clamp. Hiçbir add yolunda availability/ACTIVE/purchasable/salesMode/priceVisible/`qty≤available`
kontrolü yoktu. Anon add cookie'ye doğrudan yazıyordu. `cart-core.ts` "stok doğrulaması route katmanında
ÖNCE yapılır" diyordu ama route yapmıyordu.

### A3 — Başarı toast'ı optimistic
`buy-box.tsx addToCart` → `await addToCartAction(...)` sonrası KOŞULSUZ `setAdded(true)`; `addToCartAction`
`Promise<void>` dönüyordu, `authAddLine` sonucunu atıyordu.

### B — Header badge yalnız RSC, client refresh yok
Header badge %100 root-layout RSC'den (`cart.itemCount` / cookie). `addToCart` `router.refresh()` çağırmıyordu
— yalnız `revalidatePath("/","layout")`'e güveniyordu; codebase'deki diğer TÜM mutation'lar Server Action'ı
`router.refresh()` ile eşliyor, add-to-cart eşlemiyordu. Ayrıca count semantiği ayrışıktı: anon = tüm cookie
qty toplamı; auth = yalnız `selected`+orderable qty toplamı.

### C1 — Auth checkbox kendini yeniden seçiyor
Checkbox controlled (`checked={line.selected}`, server-authored). Guest'te deselection cookie'si gateway'e
`deselectedVariantIds` geçiyordu; auth'ta GEÇMİYORDU (`getAuthCartProjection` çıplak GET, `projectCart` opts
iletmiyor) → `deselected=∅` → her satır `selected:true` → checkbox re-check. (TODO-167 bunu "Faz A kapsam
dışı" bırakmıştı.)

### C2 — "0 ürün + ₺49,90"
`assemblePublicCart`'ta `subtotal`/`itemCount` yalnız selected+orderable üzerinden; ama kargo `shippingOk`
oldukça subtotal/itemCount'tan BAĞIMSIZ ekleniyordu → tek seçili OOS satır: subtotal 0, itemCount 0, kargo
₺49,90 → toplam ₺49,90.

## Düzeltmeler

| # | Alan | Değişiklik |
|---|------|-----------|
| A1 | `api-gateway/src/server.ts` | `loadPublicStockMapForVariants(storeId, variantIds)` (doğrudan `findInventoryByVariantIds` + expiry addback); PDP detay ucu birincil+ilgili varyantlar için VARYANT-SCOPED (fail-CLOSED) stok haritası. |
| A2 | `api-gateway/src/cart/routes.ts` | `POST /lines` FAIL-CLOSED stok kapısı: mutation ÖNCESİ ORTAK projeksiyonla prospektif satır doğrulanır; `available<=0`/unavailable → `409 VARIANT_OUT_OF_STOCK`, `mevcut+istenen>available` → `409 VARIANT_STOCK_LIMIT` (govdede güncel projeksiyon). |
| A2 | `storefront/lib/server/cart-actions.ts` | `addToCartAction` → `AddToCartResult`; anon yol yazmadan ÖNCE `resolveCart(prospective)` ile doğrular (fail-closed pozitif OOS sinyalinde); auth yol 409 kodunu taşır. |
| A3 | `storefront/components/buy-box.tsx` | `setAdded(true)` YALNIZ `res.ok`; aksi halde `addError` + net "Bu varyant tükendi"/"stok sınırı" mesajı. |
| §4 | `buy-box.tsx` | OOS flat varyant + fashion beden/renk: `disabled`+`aria-disabled`+`line-through`+erişilebilir ad "{varyant} — Tükendi"; CTA metni `outOfStock` iken "Tükendi"; `selectColor` OOS bedeni SESSİZCE stoklu bedene KAYDIRMAZ (varlık kriteri, stok değil). |
| B | `buy-box.tsx` + `app/layout.tsx` | `addToCart`/`buyNow` sonrası `router.refresh()` (diğer mutation'larla aynı desen); header badge SEMANTİĞİ = sepetteki TÜM satırların toplam adedi (auth: `lines.reduce(quantity)`; anon: cookie toplamı — zaten böyle). |
| C1 | `cart/routes.ts` + `server.ts` + `storefront cart.ts/page.tsx/cart-actions.ts` | `deselectedVariantIds` auth VIEW projeksiyonuna (`?deselected=`) ve auth checkout'a (gateway DB cart'tan diser) threadlendi. |
| C2 | `server.ts assemblePublicCart` | `hasShippableSelection = subtotal>0`; `includeInTotal = shippingOk && hasShippableSelection` → 0 ürün'de kargo total'a girmez. |
| C2 | `cart-view.tsx` | `itemCount===0` iken kargo "—", toplam ₺0, free-shipping ipucu gizli. |

## Race/concurrency güvenliği
Add-guard mutation ÖNCESİ availability okur; asıl oversell kapısı `placeOrder`'da `FOR UPDATE` per-line
korunur (sepet stok REZERVE ETMEZ). Aynı-cart çift-tık yarışı: optimistic `Cart.version` conditional update
→ biri kazanır, diğeri `CART_STALE` → retry'de `existing+requested>available` guard reddeder. Cross-cart
paylaşılan stok yarışı checkout FOR UPDATE ile fail-closed. Add-guard = UX + aynı-cart yarış kapısı.

## Cart Change Awareness (TODO-168) uyumu
İki senaryo AYRIK: (1) add sırasında stok yok → **mutation reddi** (bu bug); (2) add sonrası stok tükendi →
Cart Change Awareness `VARIANT_OUT_OF_STOCK` BLOCKING (satır kalır, checkout bloklanır, kullanıcı kaldırır).
Değişiklik motoru DEĞİŞMEDİ.

## Bilinen kalan borç
- **PLP liste ucu + home showcase hâlâ bounded `loadPublicStockMap`** kullanıyor (kart stok rozeti kozmetik
  fail-open olabilir); add PDP'de gate'lenir + endpoint fail-closed olduğundan checkout güvende. → **TD-177**.
- Auth deselection cookie-tabanlı (aynı-cihaz refresh'te korunur); cross-device persist follow-up **TD-174**.
- Header badge semantiği = "cantadaki toplam adet" (bilinçli; özet "N ürün" = selected+orderable ayrı kalır).

## Doğrulama
Build 27/27 · api-gateway 2188 test (yeni: OOS add 409, stock-limit 409, in-stock 200, auth deselection
threading) · storefront 534 test · lint 0 error · typecheck EXIT 0 · gerçek browser smoke (worktree gateway
:4100 + storefront :3100, enterprise-demo): PDP OOS disabled+strikethrough+"Tükendi" aria; add sonrası badge
refresh'siz "1" + success toast; deselect → "0 ürün / Kargo — / ₺0,00 / checkout disabled"; re-select geri
döner; 375+desktop layout temiz.
