# TD-131 — Customer Data Erasure Workflow (Ön Analiz)

**Tarih:** 2026-07-27 · **Durum:** ANALİZ · **İlgili ADR:** ADR-149…155 · **Öncül:** TODO-161B / TD-130
(`RecommendationEventData.deleteForCustomer` zaten mevcut — "ileri hard-deletion akışı" burada tamamlanır).

## 1. Amaç ve kapsam

Store-admin üzerinden bir müşterinin verisini **tenant-scoped, audit edilebilir, geri döndürülemez**
biçimde silmek/anonimleştirmek. İki ayrı aksiyon:

- **DEACTIVATE** — hesabı pasifleştir (giriş engellenir, veri korunur, geri alınabilir).
- **ERASE_PERSONAL_DATA** — kişisel + davranışsal veriyi sil/anonimleştir; finansal/yasal kaydı koru;
  geri alınamaz; müşteri yeniden aktif edilemez; açık onay ister.

KVKK md. 7 (silme/yok etme/anonim hale getirme) + GDPR Art. 17 (right to erasure) ile Art. 17(3)(b)/(e)
(yasal yükümlülük + hukuki taleplerin tesisi) gerilimini modelin içine yerleştirir: **kişisel veri silinir,
yasal-mali kayıt asgari sette korunur.**

## 2. Müşteri-ilişkili tablo envanteri ve sınıflandırma

Kaynak: `packages/db/prisma/schema.prisma`. Sınıflar:
**[SİL]** hard-delete · **[ANONİM]** satır korunur, PII temizlenir · **[KORU]** dokunulmaz (yasal/mali) ·
**[KORU+ANONİM]** satır+mali alan korunur, temas PII'si anonimleştirilir.

### 2a. Customer FK'li tablolar (`customer Customer @relation`)

| Tablo | FK onDelete | Veri niteliği | Karar | Not |
|---|---|---|---|---|
| **Customer** | (kök) | kimlik PII | **ANONİM** | name/email/phone/birthDate/gender/verified→placeholder/null; status→ERASED; erasedAt/By/Reason |
| **CustomerCredential** | Cascade | parola hash (auth) | **SİL** | scrypt hash; kişisel kimlik doğrulama sırrı |
| **CustomerCredentialToken** | Cascade | aktivasyon/reset token hash | **SİL** | açık auth token kayıtları |
| **CustomerSession** | Cascade | oturum token hash | **SİL** | açık session token kayıtları |
| **CustomerOtpVerification** | Cascade | OTP kod hash + destination(email/tel) | **SİL** | davranış + temas PII |
| **CustomerIban** | Cascade | IBAN (kişisel finansal kimlik) | **SİL** | iade hedefi; sipariş-mali kaydı DEĞİL → hard-delete |
| **CustomerCommunicationPreference** | Cascade | KVKK izin/rıza | **SİL** | (marketing consent = false etkisi; satır silinir) |
| **CustomerAddress** | Cascade | adres defteri PII | **SİL** | sipariş snapshot'ı DEĞİL (o `OrderAddress`); güvenle silinir |
| **CustomerCoupon** | Cascade | cüzdan/atama state | **SİL** | davranışsal; kupon tanımı `Coupon`'da kalır |
| **CustomerList (+CustomerListItem)** | Cascade | wishlist/alışveriş listeleri | **SİL** | item'lar liste Cascade'iyle gider |
| **ProductReview** | Cascade | ürün yorumu (mağaza güveni) | **KORU+ANONİM** | yorum SİLİNMEZ; yazar adı Customer'dan türer → müşteri anonimleşince otomatik "Anonim Müşteri" |
| **ProductReviewHelpful** | Cascade | "faydalı" oyu (davranış) | **SİL** | denorm sayaç `helpfulCount` tutarlılığı için tx içinde düş |
| **RecentlyViewedProduct** | Cascade | görüntüleme geçmişi (davranış) | **SİL** | yalnız customerId dolu satırlar; visitorHash (guest) satırlarına DOKUNMA |
| **Order** | **SetNull** | finansal/yasal sipariş | **KORU+ANONİM** | customerId korunur (anonimleşen müşteriye bağlı kalır); temas PII anonimleşir (§4) |
| **CampaignRedemption** | SetNull | kampanya kullanım/mali sayaç | **KORU** | `customerId`/`email` PII taşır → §4'te temizlenir (anonimleştir), satır korunur |

### 2b. Plain-string `customerId` (Customer FK YOK — application-level cleanup)

| Tablo | Alan | Karar | Not |
|---|---|---|---|
| **RecommendationEvent** | `customerId String?` (plain) | **SİL** | `deleteForCustomer(storeId, customerId)` zaten var; yalnız customerId eşleşen satırlar; guest visitorHash korunur |

### 2c. `customerId` TAŞIMAYAN müşteri-adjacent tablolar (PII zaten minimize)

| Tablo | Kimlik anahtarı | Karar | Not |
|---|---|---|---|
| **OrderAttribution** | orderId (customerId TUTULMAZ, ADR-103) | **KORU** | zaten PII yok; mali attribution snapshot |
| **AttributionClick** | visitorIdHash/ipHash (HMAC) | **KORU** | guest davranışı; müşteriye bağlı DEĞİL → müşteri silmede dokunulmaz |
| **SponsoredProductEvent** | visitorIdHash (HMAC) | **KORU** | aynı — guest event, customerId yok |
| **OrderSponsoredAttribution** | orderId | **KORU** | mali attribution snapshot |

**Kritik guard:** Guest kimliği yalnızca `visitorHash`/`visitorIdHash` (HMAC) taşıyan tablolarda tutulur ve
müşteriye bağlanamaz. Bir müşterinin silinmesi **cross-store** hiçbir kaydı ve **guest** hiçbir event'i
etkilemez (bkz. §6).

## 3. Silinecek veriler (özet)

CustomerCredential · CustomerCredentialToken · CustomerSession · CustomerOtpVerification · CustomerIban ·
CustomerCommunicationPreference · CustomerAddress · CustomerCoupon · CustomerList + CustomerListItem ·
ProductReviewHelpful · RecentlyViewedProduct (yalnız customerId'li) · RecommendationEvent (yalnız
customerId'li, FK'siz).

**ProductReview kararı:** yorum **tamamen silinmez**. Mağaza güveni + moderasyon geçmişi korunur; yazar
kimliği Customer kaydından türetildiği için müşteri anonimleştirilince yorum otomatik "Anonim Müşteri"
adıyla görünür. `ProductReview.customerId` korunur ama artık PII taşımayan placeholder Customer'a işaret eder
(migration'sız; ilişkiyi null'a çekmek `customerId` non-nullable olduğu için ek migration gerektirir ve
gereksizdir — anonimizasyon zaten Customer düzeyinde tam sağlanır).

## 4. Anonimleştirilecek veriler

### 4a. Customer (satır korunur — placeholder)
- `firstName` → `"Anonim"`, `lastName` → `"Müşteri"`
- `email` → benzersiz placeholder `erased-<customerId>@erased.invalid` (store-scope unique kısıtını korur;
  orijinal e-posta slotu boşalır)
- `phone` → `null` · `birthDate` → `null` · `gender` → `null`
- `emailVerifiedAt`/`phoneVerifiedAt` → `null`
- `status` → `ERASED` (yeni final state) · `erasedAt` = now · `erasedByUserId` = admin · `eraseReason` = neden

### 4b. Order — temas PII anonimleştir (satır + mali alan korunur)
- `customerEmail` → `erased-<customerId>@erased.invalid`
- `billingEmail` → `null`
- `OrderAddress` (SHIPPING + BILLING): `fullName` → `"Anonim Müşteri"`, `phone` → `null`,
  `addressLine1` → `"—"`, `addressLine2` → `null`, `district` → `null`, `postalCode` → `null`
  (coğrafi-mali raporlama için `city` + `countryCode` kaba düzeyde korunur)

### 4c. CampaignRedemption — `email` → `null`, `customerId` korunur (anonim Customer'a bağlı)

## 5. Korunacak veriler (yasal/mali — asgari saklama seti)

**Dokunulmaz:** `Order` mali alanları (tüm tutarlar, currency, orderNumber, status, tarihler) · `OrderLine`
(SKU/title/price/KDV/maliyet snapshot) · `PaymentAttempt`/`PaymentProviderEvent` · `OrderDiscount` ·
`OrderAttribution`/`OrderSponsoredAttribution` (+refund defterleri) · `CampaignRedemption` mali tutarları.

**Yasal-kimlik istisnası (asgari saklama, KVKK md.7/GDPR 17(3)(b) — yasal yükümlülük):**
`Order.billingType`, `billingName`, `billingTaxId` (TCKN), `billingCompanyName`, `billingTaxOffice`,
`billingTaxNumber` **korunur.** Gerekçe: bunlar VUK md.253 gereği asgari saklama süresi (5 yıl) boyunca
tutulması zorunlu **resmi fatura kimliğidir**; erasure temas PII'sini kaldırır ama fatura yasal kimliğini
kaldıramaz. Süre-sonu silme (retention purge) bu analizin kapsamı dışıdır → **TD-132** (teknik borç).

## 6. FK'siz / application-level event temizliği + guard'lar

- `RecommendationEvent`: `deleteForCustomer(storeId, customerId)` → yalnız `storeId` + `customerId` eşleşen
  satırlar. Guest (`visitorHash`) satırları ETKİLENMEZ.
- `AttributionClick` / `SponsoredProductEvent`: customerId taşımaz → müşteri silmede dokunulmaz (guest).
- **Cross-store izolasyonu:** her sorgu `where: { storeId, customerId }` ile scope edilir; başka mağazanın
  aynı e-posta/telefonlu müşterisi ETKİLENMEZ. `deleteForCustomer` de storeId-scoped.

## 7. Dry-run (yazma YOK)

Preview raporu üretir, **hiçbir yazma yapmaz**:
- müşteri özeti (id, anonimleştirilmiş görünecek görünüm) + store
- silinecek tablo başına kayıt sayıları (sessions, otp, iban, addresses, lists+items, coupons, helpful,
  recentlyViewed, recommendationEvents, credential/tokens)
- anonimleştirilecek alanlar listesi (Customer + Order temas PII + OrderAddress sayısı)
- korunacak finansal kayıt sayıları (orders, orderLines, payments, redemptions)
- review davranışı (anonimleştirilecek yorum sayısı)
- aktif session sayısı · açık (UNPAID/UNFULFILLED aktif) sipariş var mı
- risk/uyarılar (already-erased, aktif session, açık sipariş, açık kritik operasyon)

## 8. Apply güvenliği

Zorunlu: explicit confirmation phrase (sabit metin) · customerId · **server-side storeId** (client otoritesi
değil) · reason · current user (actorUserId) · idempotency (server-türetilmiş anahtar + advisory lock) ·
**pg advisory xact lock** · **transaction** · **kilit altında ikinci okuma** (already-erased re-check) ·
cross-store guard · already-erased guard. Hata → tam rollback (yarım silme yok).

## 9. Audit / operation log

`recordAudit({ action: "DELETE", platformUserId, storeId, entityType: "Customer", entityId, metadata })`.
metadata **PII taşımaz** — yalnız: mode (dry-run/apply), reason, silinen tablo sayıları, anonimleştirilen alan
adları, korunan finansal kayıt sayıları, sonuç. Ham email/telefon/TCKN/IBAN **asla** metadata'ya yazılmaz.

## 10. API yüzeyi (registerCustomerAdminRoutes içine)

- `POST /stores/:storeId/customers/:customerId/deactivate` — PASSIVE + tüm session revoke.
- `POST /stores/:storeId/customers/:customerId/erasure/preview` — dry-run raporu (yazma yok).
- `POST /stores/:storeId/customers/:customerId/erasure/apply` — confirmation + reason + apply.
- `GET  /stores/:storeId/customers/:customerId/erasure/status` — erased mi + erasedAt/By/Reason.

Domain error kodları: `CUSTOMER_ALREADY_ERASED` · `CUSTOMER_HAS_ACTIVE_SESSION` (uyarı; blok değil) ·
`CUSTOMER_HAS_OPEN_OPERATION` · `CONFIRMATION_REQUIRED` · `ERASURE_IN_PROGRESS` · `CROSS_STORE_ACCESS`
(yapısal olarak 404 CUSTOMER_NOT_FOUND ile de kapanır).

## 11. Store-admin UI

Müşteri detay ekranı: `Hesabı Pasifleştir` + `Kişisel Verileri Sil` (ayrı danger modal: geri-alınamaz
açıklama, silinecek özet, korunacak finansal özet, confirmation phrase input, reason, dry-run sonucu).
Sonrası: müşteri `Silinmiş/Anonimleştirilmiş` durumunda görünür; kişisel alanlar erişilemez; sipariş geçmişi
finansal snapshot ile görünür; giriş yapılamaz.

## 12. Login/terminal-state etkileşimi

- Login zaten `status === "ACTIVE"` ister (`customers/index.ts:1799`) → PASSIVE (deactivate) ve ERASED
  (erase) girişi otomatik engeller.
- Session doğrulama da `status === "ACTIVE"` ister (`:1573`).
- `adminUpdateCustomer` + activate: ERASED **terminal** — durum ACTIVE'e geri çekilemez (yeni guard).

## 13. Migration

Additive: `CustomerStatus` enum'a `ERASED`; `Customer`'a `erasedAt DateTime?`, `erasedByUserId String?`,
`eraseReason String?`. Veri kaybı yok; geri uyumlu.
