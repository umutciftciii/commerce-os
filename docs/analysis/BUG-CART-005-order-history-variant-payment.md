# BUG-CART-005 — Order History Variant Media + Payment Allocation

Storefront sipariş geçmişinde iki regression: (1) doğru varyant sipariş edilmesine rağmen
**yanlış thumbnail**, (2) mixed-payment siparişte `Ödeme bilgisi` yalnız tek yöntem gösteriyor.

## Root Cause

### Part 1 — Variant thumbnail
- `/account` sipariş listesi + `/account/orders/:orderNumber` detay projeksiyonu satır kapağını
  `buildProductCoverUrlMap` ile **yalnız `productId` → ProductImage[position=0]** (ürün birincil
  kapağı) çözüyordu; varyantın **media-defining axis** (renk) değerini yok sayıyordu.
- BUG-CART-003 bunu **sepette** `buildCartVariantCoverUrlMap` / `pickVariantCoverImage` ile
  düzeltmişti; sipariş geçmişi projeksiyonu migrate edilmemişti.
- İkincil kök: `OrderLine`'da **purchase-time media snapshot yoktu** → doğru çözüm bile ürün
  medyası sonradan değişince tarihsel görseli kaydırırdı.

### Part 2 — Payment allocation
- `getOrderDetail`, `paymentAttempts.find(a => a.paidAt !== null)` ile **tek** başarılı denemeyi
  gösteriyordu. Mixed ödemede (STORE_CREDIT + kart = iki settled attempt) yalnız biri görünüyordu.
  Attempt-başı `amount`/`method`/kart maskesi mevcuttu; projeksiyon atıyordu.

## Fix

### Part 1
- **Migration** `20260808100000_bugcart005_orderline_media_snapshot` (additive): `OrderLine.mediaStorageKey String?`
  — satın alma anı kapak snapshot'i (IMMUTABLE; eski satırda NULL, backfill YOK).
- `createOrder` + manuel `addOrderLine`: varyantın efektif kapağını (`pickVariantCoverImage` reuse;
  renk option'ına etiketli görsel → yoksa ürün birincil) storageKey olarak snapshot'lar.
- Yeni `buildOrderLineCoverUrlMap` (`media/cover.ts`) — **OrderLine.id** anahtarlı, öncelik
  **snapshot → mevcut efektif varyant medyası (legacy fallback) → ürün kapağı**. Snapshot'lı satır DB
  sorgusu gerektirmez; snapshot'sızlar için TEK batched sorgu (N+1 yok). Sepetle aynı Variant Media
  Engine (ADR-078).
- Aynı resolver: sipariş listesi + detay + iptal yanıtı + **returns/refund kalem sunumu** (customer
  eligibility & detail, admin detail) — hepsi OrderLine.id ile keylendi.

### Part 2
- `buildPaymentAllocations` (`payments/payment-state.ts`) — yalnız **settled** (`isSettledAttemptStatus`
  = PAID/AUTHORIZED, `sumCapturedMinor` ile AYNI kanonik helper) attempt'ler; her biri bir satır.
  Gösterilen allocation toplamı `sumCapturedMinor` (order captured/paid) ile **inşaen eşit** (invariant).
  Yeni ödeme-state kuralı icat edilmedi; AUTHORIZED repo semantiğinde captured'a dahildir → allocation
  da dahil eder.
- Contract: `customerOrderPaymentAllocationSchema` + detail'e `paymentAllocations: [].default([])`
  (additive; eski veri parse eder). `payment` (tekil özet) geriye-uyum için korundu.
- Storefront `PaymentBlock`: "Mağaza bakiyesi ₺…" + "Kredi kartı •••• 1234 ₺…" satırları; ham enum →
  i18n (TR/EN). Raw PAN sızmaz (yalnız `cardLast4`). imageUrl allowlist değişmedi.

## Verification

Gate: typecheck 0 · build 27/27 · api-gateway 2459 test · storefront 569 · contracts 154 · lint 0 hata.
Yeni test: `order-line-cover` (6) + `payment-allocations` (6) + `customer-account` (variant+allocation, 4)
+ storefront `payment-allocation-render` (5).

Browser smoke (docker; enterprise-demo `EDM-SHO-0266` Camper Sneaker, Gümüş variant `b99396…`,
ürün-primary Yeşil `733c8fc0…`):
- Sipariş listesi + detay: 4 sipariş Gümüş thumbnail (yeşil-primary'ye düşmedi)
- Mixed: Mağaza bakiyesi ₺2.000,00 + Kredi kartı •••• 1234 ₺6.969,10 → toplam ₺8.969,10 = paid total
- Yalnız-credit: Mağaza bakiyesi ₺8.969,10 · Yalnız-card: Kredi kartı •••• 4242 ₺8.969,10 (+3 taksit)
- Legacy (snapshot yok): efektif varyant fallback → Gümüş
- Refresh + back/forward + direct URL · auth/isolation (401 / login redirect, ürün-404 yok)
- Cart selected variant thumbnail Gümüş · coupon repricing (WELCOME10 %10) · returns kalem thumbnail Gümüş
- Regression sweep: PLP/PDP/home/markalar/checkout/success/auth 200; not-found/resolver/media ailesinde
  yeni P0/P1 yok.
