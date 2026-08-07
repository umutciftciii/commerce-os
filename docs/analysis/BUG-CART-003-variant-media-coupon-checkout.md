# BUG-CART-003 — Variant Media / Coupon Repricing / Checkout Cart Identity Regression

**Durum:** ✅ CLOSED & DEPLOYED (PR #TBD)
**Tarih:** 2026-08-08
**Kapsam:** api-gateway (public/auth sepet projeksiyonu) + storefront-web (cart/checkout server resolver).
**İlişki:** TODO-167/ADR-266 (Persistent Cart) sonrası regresyon; TD-174 kısmen kapatır. Videoda doğrulandı
(enterprise-demo ürün `EDM-SHO-0266`, kupon `WELCOME10`).

## Belirti (kanıtlanan)

1. **BUG 1 — Yanlış varyant thumbnail:** PDP'de renk varyantı (ör. Gümüş) seçilse bile sepet satırı ürünün
   birincil (position-0 = Yeşil) görselini gösteriyor.
2. **BUG 2 — Explicit kupon repricing çalışmıyor:** oturum açmış müşteride otomatik %5 kampanya varken
   "Bana özel %10 kupon"u uygulanınca UI "UYGULANDI" diyor ama totals değişmiyor (5% kalıyor).
3. **BUG 3 — Checkout sepeti boş görüyor:** cart sayfası satırı gösterirken `/checkout` "Sepetiniz boş" diyor.

## Kök nedenler (kanıtlı)

Üçünün ortak zemini: **persistent-cart (TODO-167) auth okuma yolunu üç noktada eksik bıraktı.**

- **BUG 1 (gateway):** Sepet kapağı `buildCartCoverUrlMap → buildProductCoverUrlMap →
  listProductImages(coverOnly=true)` ile **productId** üzerinden (en düşük position) çözülüyordu; varyantın
  renk/media eksenini (`mediaDefiningAttributeId` ↔ `ProductImage.optionId`) yok sayıyordu. PDP ise ayrı bir
  resolver (`galleryImagesForVariant`, Variant Media Engine / ADR-078) ile renk-farkında çözüyor → sepet daima
  position-0 (ilk renk) görselini basıyordu.
- **BUG 2 (gateway wiring + storefront):** Oturum açmış müşteride sepet **DB cart projeksiyonundan** gelir
  (`GET /customer/cart` → `projectCart`). Bu wiring `couponCode`'u `resolvePublicCartProjection`'a **hiç
  geçirmiyordu** (TD-174); dolayısıyla explicit kupon cookie'si okunsa da auth okuma yolunda yalnız otomatik
  kampanya uygulanıyordu. Anonim yol (`resolveCart` → `POST /cart`) kuponu gövdede taşıdığı için misafirde
  çalışıyor, bug'ı maskeliyordu.
- **BUG 3 (storefront):** `app/checkout/page.tsx` sepeti **yalnız cookie**'den (`readCartItems`) okuyup boşsa
  "Sepetiniz boş" gösteriyordu. Oturum açmış müşteride kanonik sepet **DB'de**; login-merge cookie'yi
  temizlediği için checkout her zaman boş görüyordu. Cart sayfası (`resolveAuthCartView`) ve checkout **submit**
  aksiyonu (`getAuthCartProjection`) DB-otoriter'e güncellenmişti; checkout **page render** eski cookie yolunda
  kalmıştı (persistent-cart commit'i bu dosyayı atlamıştı).

## Düzeltmeler

- **BUG 1** — `packages`/gateway: yeni saf `pickVariantCoverImage` + `buildCartVariantCoverUrlMap`
  (`apps/api-gateway/src/media/cover.ts`). Sepet kapağı artık **variantId** ile çözülür; öncelik (1) varyantın
  seçili renk option'ına etiketli görsel, (2) ürün birincil kapağı (erken fallback YOK). `assemblePublicCart`
  kapak enjeksiyonu productId → **variantId** anahtarına geçti; `CartResolvableVariant` `mediaDefiningAttributeId`
  taşır. Tek batched `listProductImages(coverOnly=false)` (N+1 yok). Variant Media Engine ile TUTARLI.
- **BUG 2** — auth cart route (`cart/routes.ts`) GET `?coupon=`/`?shippingOption=`/`?claimed=` query'sini parse
  edip `projectCart`'a iletir; server.ts wiring bunları `resolvePublicCartProjection`'a forward eder → auth cart
  ANONİM yolla AYNI motorla yeniden fiyatlanır. Storefront `getAuthCartProjection`/`resolveAuthCartView` kupon/
  kargo/claim'i query olarak taşır (kaynak doğrusu yine cookie). Stackability/precedence kuralı DEĞİŞMEDİ
  (mevcut `computeDiscounts`: coupon-candidate önce, non-stackable tek kazanır) — yeni kural icat edilmedi.
- **BUG 3** — yeni `resolveCheckoutView` (`lib/server/cart.ts`): cart sayfasıyla AYNI auth-first çözüm (DB cart
  otoriter; misafirde cookie fallback). `checkout/page.tsx` bunu kullanır; "Sepetiniz boş" guard'ı UI'da
  gizlenmedi — kök cart-identity düzeltildi.

## Testler (TDD, gerçek fail izlendi)

- `apps/api-gateway/test/cart-variant-cover.test.ts` (7) — pickVariantCover öncelik/fallback + variantId-keyed map + N+1 yok.
- `apps/api-gateway/test/customer-cart-routes.test.ts` (+2) — GET `?coupon/shippingOption/claimed` `projectCart`'a threading.
- `apps/storefront-web/test/cart-resolver.test.ts` (+4) — resolveAuthCartView kupon query + resolveCheckoutView auth-first (DB cart, boş değil).

## İzole canlı kanıt (worktree gateway :4100 + storefront :3100, commerce_os okundu; izole müşteri)

- **BUG 1:** Gümüş/41 satırı `…/b99396fc…webp` (Gümüş pos5), Yeşil/41 `…/733c8fc0…webp` (Yeşil pos0) — **renk-farklı**.
- **BUG 2:** kuponsuz otomatik %5 (`89.691`) → `WELCOME10` %10 (`179.382`, APPLIED); grandTotal düştü. UI'da 5%→10% reprice.
- **BUG 3:** checkout DB cart'ı çözer; ürün (Gümüş/37) + WELCOME10 özeti görünür; "Sepetiniz boş" YOK.
- Responsive 375/768/1024/1440 taşmasız; TODO-174B "Alışveriş bakiyemi kullan" toggle sepet kimliğini bozmadan mevcut.
- Fixture FK-güvenli temizlendi; enterprise-demo PRISTINE (471 ürün, `EDM-SHO-0266` 9 görsel, WELCOME10 intact).

## TD-174 durumu

Kısmen kapandı: **uygulanan kupon/kargo seçimi artık auth cart'ı yeniden fiyatlar** (aynı-cihaz). Seçimin DB
cart'ta **cross-device persist'i** hâlâ future (selection cookie'de yaşar; her okumada query ile taşınır).
