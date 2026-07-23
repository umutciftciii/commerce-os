# TODO-159E — Product Reviews & Ratings — Ön Analiz

> Durum: analiz + tasarım kararları. Uygulama bu belgedeki kararlara göre yapılır.
> İlgili ADR: **ADR-094** (yorum uygunluğu + moderasyon + aggregate otoritesi). Roadmap:
> `docs/ROADMAP.md` (Customer Lifecycle bölümü). Öncül: ADR-089 (Admin Data Grid), ADR-090
> (Admin Selector), ADR-093 (Customer Lists — batched status + guest/oturum + tenant deseni).

Bu faz PDP'ye yalnız yıldız eklemek DEĞİLDİR. Gerçek, tenant-safe, moderasyonlu ve **doğrulanmış
alışveriş** temelli bir yorum/puanlama sistemi kurar: domain modeli + sipariş uygunluğu (sunucu-otoriter)
+ moderasyon + rating aggregate projection + Store Admin moderasyon ekranı + storefront (PDP/PLP/Home/
Search/Account).

---

## 1. Mevcut durum tespiti (kod incelemesi)

### 1.1 Mevcut yıldız/rating alanları MOCK mı? → EVET, tamamen MOCK

Storefront'ta puan **tek bir deterministik mock kaynağından** türetilir; Prisma'da `ProductReview`
modeli, public aggregate ucu YOK (greenfield):

- **Tek mock kaynağı:** `apps/storefront-web/lib/mock-rating.ts` — `mockRating(handle)` handle'dan
  deterministik `{ value: 4.0–5.0, count: 12–251 }` türetir. Docblock zaten "gerçek veri gelince yalnızca
  çağıran taraf gerçek ortalamaya geçer" diyor.
- **Paylaşılan yıldız bileşeni:** `apps/storefront-web/components/ui/stars.tsx` — `Stars({ rating, ariaLabel })`,
  nötr `var(--ink)` dolgu (accent DEĞİL). Header: "puan verisi MOCK'tur".
- **4 render yüzeyi:** (a) PDP başlığı `app/products/[handle]/page.tsx:114-181`; (b) Home/showcase kartı +
  QuickView `components/site/product-card.tsx:34,101-106,165-168`; (c) PLP/Search kartı
  `components/search/search-product-card.tsx:41-43,120-129`. (Legacy `components/product-card.tsx` ve
  `components/ui/product-card.tsx` rating TAŞIMAZ; canlıda ölü — dokunulmaz.)
- **i18n zaten scaffold'lu:** `account.menu.reviews` ("Değerlendirmelerim"), `account.placeholders.reviews`,
  `detail.reviews` (title/emptyTitle/emptyBody), `detail.ratingPlaceholder`, `home.card.ratingAria`,
  `home.card.reviews` — hepsi tr+en mevcut.
- **Account "reviews" bölümü zaten boş `Placeholder`:** `app/account/page.tsx:126-127` — sidebar linki +
  section enum ZATEN hazır (`components/account/account-sidebar.tsx`).

→ Görev: mock'ları KALDIR, gerçek batched aggregate summary'ye geç; PDP'ye gerçek yorum alanı; Account'a
gerçek "Değerlendirmelerim".

### 1.2 Domain / sipariş modeli (uygunluk temeli)

- **`Order`** (`schema.prisma:1344`): `customerId String?` (nullable, SetNull), `customerEmail`, üç yaşam
  döngüsü alanı: `status OrderStatus` {DRAFT, PLACED, CONFIRMED, CANCELLED, FULFILLED}, `paymentStatus
  PaymentStatus` {UNPAID, AUTHORIZED, PAID, REFUNDED}, `fulfillmentStatus FulfillmentStatus` {UNFULFILLED,
  PARTIAL, FULFILLED, CANCELLED}. `cancelledAt`/`cancelReason` serbest. İade/return için AYRI enum/model
  YOK — iade yalnız `PaymentStatus.REFUNDED`.
- **`OrderLine`** (`schema.prisma:1415`): `productId String` + `variantId String` (ikisi non-null, FK
  `onDelete: Restrict` → sipariş edilmiş ürün fiziksel silinemez), `quantity`, snapshot başlık/fiyat.
- **`Shipment`** (`schema.prisma:1708`): `status ShipmentStatus` {…, **DELIVERED**, …}; teslimat sinyali
  buradan gelir (`Shipment.orderId → Order`). Order-seviyesi `fulfillmentStatus=FULFILLED` daha kaba sinyal.
- **`Customer`** (`schema.prisma:1139`): `firstName?`/`lastName?` (maskeli gösterim adı için), `status`.
- Tüm id'ler `cuid`. Tenant sütunu her tabloda `storeId` + `@@index([storeId])` + FK Cascade.

### 1.3 Yorum ürün seviyesinde mi, varyant seviyesinde mi? → ÜRÜN seviyesinde yayınlanır

Yorum **ürün seviyesinde** yayınlanır ve toplanır (PDP tek liste, tek aggregate). `variantId` yalnız
**bağlam** olarak saklanır (hangi varyant satın alındı — sipariş kaleminden türetilir), gösterimde
opsiyonel etiket olabilir ama ayrı aggregate üretmez. Bu, PLP↔PDP tutarlılığını (kart = ürün-seviyesi
ortalama) garanti eder ve ADR-093'teki "favori = ürün-seviyesi" kararıyla simetriktir.

### 1.4 Sipariş kalemi başına kaç yorum? → orderLineId TEKİL + (müşteri,ürün) TEKİL

İki kısıt birlikte uygulanır:
1. **`orderLineId` UNIQUE** — bir sipariş kalemi en fazla bir yoruma kaynak olur (§14 gereği).
2. **`(storeId, productId, customerId)` UNIQUE** — bir müşteri bir ürüne EN FAZLA bir yorum yazar (roadmap
   kabul kriteri: "aynı müşteri aynı ürüne tek yorum"). Aynı ürünü iki farklı siparişte alsa bile ikinci
   yorum reddedilir; uygunluk listesinde zaten yorumladığı ürün gösterilmez.

Bu ikisi çelişmez: (2) daha güçlü kuralı, (1) kaynak-kalem tekilliğini garanti eder. İkisi de DB unique +
servis check-then-insert (P2002 yut) ile korunur.

### 1.5 Yorum uygunluğu hangi sipariş durumunda doğar? → SUNUCU-otoriter predikat

Bir müşteri bir ürüne yorum yazabilir **ancak ve ancak** şu koşulları sağlayan bir `OrderLine` varsa
(hepsi gateway'de hesaplanır — UI'dan gelen `verifiedPurchase` değerine ASLA güvenilmez):

- `OrderLine.storeId == storeId` **ve** `OrderLine.productId == productId`
- `OrderLine.order.customerId == customer.id` (müşteri kendi siparişi)
- `order.status != CANCELLED`
- `order.paymentStatus == PAID` (ödeme tamamlanmış — AUTHORIZED yetmez)
- **teslimat/fulfillment aşamasına ulaşmış:** ilgili siparişin `Shipment.status == DELIVERED` bir
  gönderisi VAR **veya** `order.fulfillmentStatus == FULFILLED` (kargo kaydı olmayan/dijital akışlar için
  güvenli geri düşüş)
- bu ürün için bu müşterinin daha önce yorumu YOK (§1.4)

### 1.6 İptal/iade sonrası "doğrulanmış alışveriş" etiketi nasıl davranır? → KORUNUR (MVP kararı)

**MVP kararı:** Yorum oluşturulduktan SONRA sipariş iade edilir/iptal edilirse:
- **Yorum KORUNUR** (silinmez, gizlenmez) — alışveriş yorum anında gerçekten gerçekleşmişti.
- **`verifiedPurchase` rozeti KORUNUR** — geçmiş bir gerçeği geriye dönük "doğrulanmamış" yapmayız.
- **Yeni yorum ENGELLENİR** — uygunluk `paymentStatus == PAID && status != CANCELLED` istediğinden,
  iade edilmiş (REFUNDED) / iptal edilmiş (CANCELLED) sipariş yeni yorum DOĞURMAZ.
- Kötüye kullanım (ör. iade sonrası kötü niyetli yorum) **moderasyonla** ele alınır: admin `HIDDEN`
  yapabilir. Arka planda yorumları yeniden tarayan bir job YOKTUR (aggregate churn + karmaşıklık yaratır).

**Reddedilen alternatif:** tam iade sonrası yorumu otomatik `HIDDEN`'a çekmek veya rozeti düşürmek — bir
arka plan yeniden-tarama işi + aggregate yeniden hesabı gerektirir; MVP için gereksiz karmaşıklık. İleri
faz teknik borcu olarak kaydedilir (TD-106).

### 1.7 Rating aggregate CANLI mı hesaplanacak, projection mı? → PROJECTION tablosu

**Karar: `ProductRatingAggregate` projection tablosu** (ürün başına tek satır), moderasyon geçişlerinde
**aynı transaction içinde** yeniden hesaplanır. Gerekçe:
- Her PDP/kart isteğinde sınırsız review taraması yapılmaz (§6) — O(1) okuma.
- Batched kart summary'si TEK sorguyla (`WHERE productId IN (...)`) çözülür — N+1 yok.
- Float drift'e karşı **tamsayı toplamlar** saklanır: `reviewCount`, `sumRating`, `count1..count5`,
  `averageTimes100` (yuvarlanmış ortalama×100). Ortalama = `sumRating/reviewCount` (okuma anında türetilir).
- **Yalnız `APPROVED` yorumlar** aggregate'e dâhildir.
- Yeniden hesap **sıfırdan** yapılır (ürün için `APPROVED` yorumlar üzerinde tek `groupBy`) — delta
  aritmetiği yerine; küçük/orta hacimde ucuz ve **daima tutarlı** (delta bug'ı yok).

**Search read-model'e (`ProductSearchDocument`) dokunulmaz.** PLP/Home/Search kartları summary'yi AYRI
batched uçtan alır (wishlist-status deseni). Rating'i search dokümanına denormalize etmek (sort-by-rating
için) bilinçli olarak ileri faza bırakılır (TD-107) — bu faz batched resolver kullanır (§9, task talimatı).

### 1.8 Moderasyon ve yayın akışı nasıl işler? → PENDING → (APPROVED | REJECTED | HIDDEN)

- **PENDING:** yeni oluşturulan veya onaylı-iken düzenlenen yorum. Public'te GÖRÜNMEZ; aggregate'e dâhil
  değil.
- **APPROVED:** admin onayladı. Public'te görünür; aggregate'e dâhil; `publishedAt` set edilir.
- **REJECTED:** admin reddetti (hiç yayınlanmadı). Public'te görünmez; aggregate dışı. Müşteri düzenlerse
  yeniden `PENDING`.
- **HIDDEN:** daha önce onaylı iken admin gizledi (ör. kötüye kullanım). Public'te görünmez; aggregate dışı.
  REJECTED'tan ayrıdır (hiç onaylanmamış vs. onaylanıp gizlenmiş).

Aggregate'i etkileyen her geçiş (APPROVED'a giriş/çıkış) transaction içinde yeniden hesap tetikler. Admin
aksiyonları `AuditLog`'a (`action=UPDATE`, `entityType="ProductReview"`, `platformUserId`, `metadata`) yazılır.

### 1.9 Bildirim altyapısı? → YOK (stub) → bu fazda kurulmaz

`services/notification-service` 5 satırlık bir **stub**'tır (mailer/template/dispatch YOK). Platform-events
bus (`enqueuePlatformEvent`) tanımlı ama HİÇBİR yerde çağrılmıyor; worker consumer yalnız log basıyor.
Sıfırdan e-posta altyapısı kurmak bu fazın kapsamını aşar (transport + template + event→dispatch).

**Karar (task §12):** review approved/rejected bildirimi bu fazda EKLENMEZ. Roadmap + teknik borç (TD-108)
olarak kaydedilir. Yorum durumları müşteriye **Account "Değerlendirmelerim"** ekranında gösterilir (pull
model; push bildirim ileri faz).

---

## 2. Domain modeli (özet — tam şema §uygulama'da)

```
enum ProductReviewStatus { PENDING, APPROVED, REJECTED, HIDDEN }

ProductReview(
  id, storeId, productId, variantId?, customerId, orderId, orderLineId,
  rating(1–5 int), title?, body, status, verifiedPurchase, helpfulCount,
  moderationNote?, publishedAt?, createdAt, updatedAt)

ProductReviewHelpful(id, storeId, reviewId, customerId, createdAt)

ProductRatingAggregate(
  productId(PK), storeId, reviewCount, sumRating,
  count1, count2, count3, count4, count5, averageTimes100, updatedAt)
```

### Kurallar / invariant'lar
1. **Rating 1–5 arası integer** (contract + DB CHECK yerine servis validasyonu; zod `.int().min(1).max(5)`).
2. `orderLineId` **UNIQUE**; `(storeId, productId, customerId)` **UNIQUE** (§1.4). Servis check-then-insert
   + P2002 yut (idempotent/yarış-güvenli).
3. Yorum **silinmez**, yalnız durum değişir (REJECTED/HIDDEN).
4. **Approved olmayan yorum public uçta GÖRÜNMEZ.** Aggregate yalnız APPROVED.
5. Product/Variant modeline JSON yorum alanı **EKLENMEZ** (ayrı normalize tablo).
6. Ortalama **istemcide hesaplanmaz** — sunucu projection'dan verir.
7. `body` zorunlu (1–4000), `title` opsiyonel (≤120), `rating` zorunlu. **HTML kabul edilmez** — düz metin
   saklanır (React default escaping + gateway'de kontrol-karakter/uzunluk sınırı; markup stscript'i saklanmaz).
8. **FK kararı:** `product`/`customer`/`order`/`orderLine` → `onDelete: Cascade` (ürün/müşteri/sipariş
   fiziksel silinince yorum kalkar; OrderLine zaten Order'a Cascade). `variant` → `onDelete: SetNull`
   (varyant silinse bile yorum ürün-seviyesinde yaşar; bağlam null olur). `ProductRatingAggregate`/
   `ProductReviewHelpful` → Cascade.
9. Kısmi/tekil unique'ler Prisma-native ifade edilir (`@unique`/`@@unique`); TODO-159D'deki kısmi-index
   tuzağı burada YOK (koşulsuz unique'ler).

---

## 3. API yüzeyi

### Public (auth yok) — `/public/stores/:storeSlug/...`
| Uç | Metod | Açıklama |
|----|-------|----------|
| `/products/:productId/reviews/summary` | GET | Aggregate: average, count, distribution{1..5} |
| `/products/:productId/reviews` | GET | Sayfalı APPROVED yorumlar; sort + rating filtresi |
| `/reviews/summary` | POST | **Batched** { productIds[] } → summary map (PLP/Home/Search kartları) |

Sort: `newest` · `oldest` · `highest` · `lowest` · `most_helpful`. Rating filtresi: 1–5. Pagination
ADR-089 (varsayılan 10; 10/25/50/100; totalItems/totalPages). Response **allowlist**: id, rating, title,
body, authorName(maskeli), verifiedPurchase, helpfulCount, createdAt/publishedAt, (giriş varsa `viewerFoundHelpful`).
`customerId`/email/`orderId`/`orderLineId`/`moderationNote`/`status` **sızmaz**.

### Customer (`x-customer-session`) — `/public/stores/:storeSlug/customer/...`
| Uç | Metod | Açıklama |
|----|-------|----------|
| `/reviews` | GET | Kendi yorumlarım (tüm durumlar) + yoruma uygun sipariş kalemleri |
| `/products/:productId/review-eligibility` | GET | PDP "yorum yaz" için: { eligible, reason, orderLineId?, existingReview? } |
| `/reviews` | POST | Oluştur (orderLineId, rating, title?, body) — sunucu uygunluğu doğrular; PENDING |
| `/reviews/:reviewId` | PATCH | Kendi yorumunu düzenle; APPROVED ise → PENDING (yeniden moderasyon) |
| `/reviews/:reviewId/helpful` | POST | APPROVED yoruma faydalı oyu aç/kapat (idempotent toggle) |

Kurallar: müşteri yalnız kendi kalemleri üzerinden oluşturur; approved yorum SESSİZCE değişmez (düzenleme →
PENDING); rating/body zorunlu; uzunluk sunucuda; HTML yok; rate-limit (create/edit/helpful) `storeId:customerId`
anahtarıyla sliding-window. Kendi yorumuna helpful ENGELLİ; cross-store ENGELLİ.

### Admin (bearer platform-admin) — `/stores/:storeId/reviews...`
| Uç | Metod | Açıklama |
|----|-------|----------|
| `/reviews` | GET | Data Grid liste (ADR-089): search + status/rating/verifiedPurchase/productId/tarih filtre + sort |
| `/reviews/:reviewId` | GET | Detay (moderationNote, müşteri adı, sipariş referansı dâhil) |
| `/reviews/:reviewId/moderate` | POST | { action: approve\|reject\|hide, moderationNote? } → durum + AuditLog + aggregate yeniden hesap |

Bulk action: bu fazda YOK (task: "Sahte bulk moderasyon ekleme"). Gerçek/güvenli iş mantığı gerektiğinde
eklenir. Tek-tek moderasyon MVP.

---

## 4. Rating aggregate otoritesi (özet)

- **Otorite:** `ProductRatingAggregate` (projection). Tek yazma yolu: `recomputeAggregate(tx, storeId,
  productId)` — `APPROVED` yorumları `groupBy(rating)` ile sayar, satırı upsert eder (sıfır yorumda satırı
  sıfırlar/siler). Moderasyon `moderate` ucu ve customer `edit` (approved→pending) ucu bu fonksiyonu AYNI
  transaction'da çağırır.
- **Float testi:** `[5,4,4] → sum=13, count=3 → averageTimes100=433 → 4.3`; dağılım `{4:2,5:1}`. Tamsayı
  toplam saklama float drift'i imkânsız kılar (unit test ile korunur).
- Okuma: summary uçları projection'dan `average = round(sumRating/reviewCount,1)`, `count`, `distribution`.

## 5. Storefront entegrasyonu (özet)

- **Batched summary resolver:** `lib/server/reviews.ts` `getRatingSummaries(productIds) → Map<id,{average,
  count}>` — PLP/Home/Search RSC'leri sayfa başına TEK `POST /reviews/summary`. `mockRating` KALDIRILIR;
  4 render yüzeyi gerçek veriye geçer; yorum yoksa i18n `ratingPlaceholder` ("Henüz değerlendirme yok").
- **PDP:** yeni "Değerlendirmeler" alanı — ortalama+dağılım, sayfalı liste, rating filtresi, sort, verified
  rozeti, helpful butonu, empty/loading/error, "yorum yaz" akışı (giriş yoksa `?next` login; uygun kalem
  yoksa açıklayıcı mesaj; uygunsa form → gönderim sonrası PENDING mesajı). Theme token'ları; büyük redesign yok.
- **Account "Değerlendirmelerim":** boş `Placeholder` yerine gerçek bölüm — yoruma uygun kalemler + pending/
  approved/rejected/hidden yorumlarım (ürün adı/görsel, rating, metin, durum, tarih); izinli durumda düzenle.
- Etkileşimler wishlist optimistic-UI + a11y desenini aynalar (aria, feedback, çift-tık guard, rate-limit).

## 6. Store Admin moderasyon ekranı (özet)

`/reviews` — ADR-089 Data Grid (`components/data-grid/*`) + `components/selector/*` (ürün filtresi =
`useProductSelectorBinding`). Kolonlar: ürün, müşteri(maskeli), rating, durum(Badge), verified, tarih.
Filtreler: status (select), rating (1–5 select veya number-range), verifiedPurchase (select), product
(entity selector), tarih. Sort: createdAt/rating. Satır aksiyonu → `Modal` detay + approve/reject/hide +
moderationNote. Yeni tablo altyapısı yaratılmaz; mevcut kit + `AuditLog` yazımı. Nav "sales" grubuna eklenir.

## 7. Performans / güvenlik (özet)

- **Indexler:** `ProductReview` → `(storeId,status,createdAt)` (admin), `(productId,status,createdAt)`
  (public liste), `(storeId,productId,status)` (aggregate recompute), `customerId` (my reviews), `orderLineId`
  unique, `(storeId,productId,customerId)` unique. `ProductReviewHelpful` → `(reviewId,customerId)` unique,
  `storeId`, `customerId`. `ProductRatingAggregate` → PK `productId`, `storeId`. `EXPLAIN` ile doğrulanır.
- **Güvenlik:** tenant izolasyonu (her sorgu `storeId`); customer ownership (kendi kalemi/yorumu; 404 ile
  enumeration sızmaz); orderLine eligibility sunucu-otoriter; duplicate engeli (iki unique + P2002); rating
  integer; body/title uzunluk; HTML/script yok (düz metin + escaping); rate-limit (create/edit/helpful);
  moderation admin guard; public projection allowlist (PII/order/note sızmaz); helpful abuse (unique oy +
  kendi-yorumu engeli + rate-limit); ID enumeration (bulunamayan → 404).
- **Pagination:** public liste + admin ekran server-side (varsayılan public 10 / admin 25; maks 100;
  totalItems/totalPages). N+1 yok (batched summary + aggregate O(1) + helpful denormalize sayaç).

## 8. Kapsam dışı (MVP) / sonraki faz / teknik borç

- **TD-106:** iade/iptal sonrası yorum/rozet otomatik davranışı yok (korunur; moderasyon manuel).
- **TD-107:** rating aggregate search read-model'e (`ProductSearchDocument`) denormalize edilmedi →
  sort-by-rating / rating-facet arama ileri faz.
- **TD-108:** review approved/rejected e-posta/push bildirimi yok (notification-service stub; pull-model
  Account ekranı). Bildirim altyapısı ayrı roadmap işi.
- Sonraki faz: görsel/video yorumu · satıcı yanıtı · yorum-bazlı ürün skorlama · guest helpful.
