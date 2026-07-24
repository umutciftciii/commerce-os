# TODO-161A — Sponsorship Agreements, Billing & Settlement — Ön Analiz

> Durum: uygulama fazı analizi. Öncül: **TODO-161** (Sponsored Product Management, ADR-114…120)
> — sponsorlu **gösterim motoru** TAMAMLANDI ve bu fazda **YENİDEN YAZILMAZ**. Bu faz mevcut
> placement + attribution katmanını **TÜKETİR** ve üzerine ticari/finansal operasyonu kurar.
> Kararlar **ADR-121…ADR-127** olarak kaydedilir (§14 eşleme). Commit/PR/deploy YAPILMAZ
> (görev kuralı §17).

---

## 0. Mevcut altyapı (keşif sonucu)

### 0.1 Sponsorlu domain (TODO-161)

| Model | Rol | Bu fazda |
|---|---|---|
| `SponsoredProductCampaign` | kampanya (placement, pencere, priority, maxSlots) | **tüketilir**; yalnız 1 additive kolon (`commercialMode`) |
| `SponsoredProductPlacement` | kampanya↔ürün junction | dokunulmaz |
| `SponsoredTargetKeyword` | SEARCH_RESULTS allowlist | dokunulmaz |
| `SponsoredProductEvent` | IMPRESSION/CLICK/CART funnel (`isBot`, `visitorIdHash`, write-time dedupe) | **ücretlendirme paydası** |
| `OrderSponsoredAttribution` | sipariş satırı gelir snapshot'ı (gross/refunded/net) | **CPA + revenue-share paydası** |
| `OrderSponsoredAttributionRefund` | append-only iade defteri (`refundKey` idempotent) | **refund adjustment kaynağı** |

Ölçüm zaten **sunucu-otoriter**: event'ler GATEWAY-imzalı token'dan gelir (ADR-118), bot UA
`isBot=true` ile işaretlenir, aynı `(visitorIdHash, placementId, type)` 30 dk içinde ikinci satır
açmaz. **Bu, ücretlendirme için ayrı bir "billable event" boru hattı kurmayı gereksiz kılar** —
mevcut tablo üzerinde `isBot = false` filtresi + `DISTINCT` yeterlidir (§4.3).

### 0.2 Ticari/finansal altyapı — mevcut durum

- **Vendor/Company modeli YOK.** `Product.vendor` yalnızca serbest metin (`String?`) bir etikettir;
  ilişkisel varlık değildir. Tedarikçi/firma tablosu bulunmuyor.
- **`Customer`** son-tüketici kimliğidir (credential, adres, sipariş, cüzdan, liste, yorum). B2B
  reklamvereni buraya bindirmek storefront auth yüzeyini ve KVKK sınırını kirletir.
- **`Influencer`** (TODO-160) bir iş-ortağı kimliğidir ama tracking-link/attribution'a bağlıdır;
  vergi/fatura/tahsilat alanı yoktur ve **ADR-091 gereği sponsored domainiyle BİRLEŞTİRİLMEZ**.
- **Fatura / muhasebe / accounting modülü YOK.** Sistemde para akışı yalnızca **müşteri siparişi**
  yönünde vardır: `PaymentProviderConfig` / `PaymentAttempt` / `PaymentProviderEvent` +
  TODO-159F ödeme tahsilatı (`payments/payment-state.ts`, `payments/recovery-routes.ts`).
  Bunlar **sipariş** merkezlidir (`orderId` zorunlu) ve B2B alacak takibine uymaz.
- **`AuditLog`** (`action`, `entityType`, `entityId`, `metadata`, `storeId`) tüm admin yazmalarında
  `recordAudit` ile kullanılır — bu fazda da aynı yol.
- **Data Grid** (TODO-159A/ADR-089) + **ortak seçici** (TODO-159B/ADR-090) + CSV export deseni
  (`csvCell` formül-önek guard'ı) hazır; **yeni paralel tablo sistemi kurulmaz**.

### 0.3 Yeniden kullanılan para/durum desenleri (TODO-159F)

`payments/payment-state.ts` bu fazın doğrudan öncülüdür ve deseni aynen taşınır:

- Para her yerde **tamsayı minor unit** (`...Minor`), float YOK.
- **Kalan bakiye SUNUCUDA türetilir** (`computeRemainingMinor`), istemci tutarı otorite değildir.
- **Aşırı-tahsilat reddi** (`isWithinRemaining`).
- **Monotonic durum geçişi** (geç gelen olay durumu geriye çevirmez).

---

## 1. Mevcut ticari operasyon açığı (problem tanımı)

TODO-161 MVP'si bilinçli olarak bir **self-merchandising** kararıydı (TD-119): kampanya
oluşturulur, sponsorlu gösterim üretilir, ölçülür — **ama hiçbir ticari kayıt yoktur**. Somut açıklar:

1. **Sponsor firma kimliği yok.** "Bu kampanya kimin adına yayında?" sorusunun DB'de karşılığı yok.
2. **Anlaşma yok.** Süre, bedel, ücretlendirme modeli, vade, vergi, imza hiçbir yerde tutulmuyor.
3. **Tahakkuk yok.** Gerçekleşen impression/click/order metrikleri paraya çevrilmiyor.
4. **Tahsilat yok.** Kısmi ödeme, kalan bakiye, vade aşımı takibi yok.
5. **Mutabakat yok.** Dönem kapanışında metrik snapshot'ı alınmıyor → geçmiş rapor, event verisi
   değiştikçe sessizce kayıyor.
6. **Guard yok.** Ödemesi olmayan / anlaşması olmayan kampanya sessizce sponsorlu gösterim üretebiliyor.

---

## 2. Netleştirilen kararlar

### 2.1 Sponsor tarafı mevcut Vendor/Company ile temsil edilebilir mi? → **HAYIR** (ADR-121)

Temsil edilebilecek bir model **yok** (§0.2). Üç aday da reddedilir:

- `Product.vendor`: ilişkisel değil, serbest metin.
- `Customer`: son-tüketici auth yüzeyi; B2B reklamverenin storefront'a girişi olmamalı.
- `Influencer`: ADR-091 gereği ayrı domain; vergi/fatura alanı yok, tracking-link'e bağlı.

**Karar:** yeni `SponsorAccount` modeli. Gerekçe: reklamveren kimliği **ticari** bir varlıktır
(vergi dairesi/no, fatura adresi, cari bakiye) ve son-tüketici yaşam döngüsüyle hiçbir alanı
paylaşmaz. Birleştirme, `Customer` üzerinde anlamı olmayan nullable kolon yığını üretirdi.
`Influencer` ile `SponsorAccount` gelecekte **ayrı ayrı** aynı gerçek firmaya işaret edebilir;
birleştirme ileri faza bırakılır (TD).

### 2.2 Fiyatlandırma kampanya başında mı, gerçekleşen metriklerden sonra mı? → **İKİSİ DE, TEK YOLDAN** (ADR-122)

- `FIXED_FEE`: bedel **anlaşma anında** bilinir (`agreedAmountMinor`).
- `CPM` / `CPC` / `CPA` / `REVENUE_SHARE`: bedel **dönem kapanışında** gerçekleşen metrikten hesaplanır.

**Ancak ikisi de aynı boru hattından geçer:** `Settlement (dönem + metrik snapshot) → Charge (tahakkuk)
→ Payment (tahsilat)`. FIXED_FEE için settlement metrikleri **bilgi amaçlıdır**, tutar
`agreedAmountMinor`'dan gelir. Tek boru hattı = tek denetim izi, tek bakiye matematiği, tek ekran.

Formüller **tek otoritede** (`sponsorship/billing-core.ts`, SAF, yan etkisiz, birim-testli):

| Model | Formül (minor unit) |
|---|---|
| `FIXED_FEE` | `agreedAmountMinor` |
| `CPM` | `round(billableImpressions / 1000 × unitPriceMinor)` |
| `CPC` | `billableClicks × unitPriceMinor` |
| `CPA` | `attributedOrders × unitPriceMinor` |
| `REVENUE_SHARE` | `round(netRevenueMinor × revenueSharePercentBp / 10000)` |

Yuvarlama **tek noktada** ve `Math.round` ile (banker's rounding YOK — tutarlılık > istatistiksel
nötrlük; ticari belge deterministik olmalı).

### 2.3 Fatura platform içinde mi üretilecek? → **HAYIR; ticari belge + tahsilat takibi** (ADR-126)

MVP **resmî e-Fatura/e-Arşiv üretmez, muhasebe fişi oluşturmaz.** Üretilen kayıt bir
**tahakkuk** (`SponsorshipCharge`) — iç ticari belgedir: numara, düzenlenme tarihi, vade, matrah,
vergi, toplam, tahsil edilen, kalan.

**UI adlandırma kuralı (pazarlıksız):** ekranlarda `Tahakkuk` / `Tahakkuk No` kullanılır;
`Fatura` / `Fatura No` **KULLANILMAZ**. Kullanıcının platform içi kaydı resmî mali belge sanması
engellenir. Ekranda açık uyarı satırı gösterilir.

### 2.4 KDV ve para birimi otoritesi → **ANLAŞMA** (ADR-127)

- **`SponsorshipAgreement.currency` + `taxRateBp` tek otoritedir.** Charge ve Settlement bu değerleri
  **oluşturma anında snapshot'lar** (sonradan anlaşma değişse geçmiş belge kaymaz).
- `taxAmountMinor = round(subtotalMinor × taxRateBp / 10000)`, `totalAmountMinor = subtotal + tax`.
  Vergi **matrah üzerinden** hesaplanır (KDV dahil fiyat varsayımı YOK).
- **Currency karışmaz:** ödeme para birimi charge/agreement ile eşleşmezse **400 `CURRENCY_MISMATCH`**.
  Dashboard toplamları **para birimi bazında ayrı** döner; tek "toplam" altında toplanmaz.
- Mağaza para birimi ile anlaşma para birimi **farklı olabilir** (yabancı sponsor); gelir metriği
  (`netRevenueMinor`) mağaza para birimindedir → `REVENUE_SHARE` anlaşmasında para birimi mağaza
  siparişlerinin para birimiyle **aynı olmak zorundadır** (aksi halde 400 `CURRENCY_MISMATCH`,
  kur dönüşümü MVP kapsamı DIŞI).

### 2.5 Kısmi tahsilat ve vade takibi → **append-only defter + türetilmiş bakiye** (ADR-125)

- `SponsorshipPayment` **append-only**'dir. Kalan bakiye SUNUCUDA türetilir:
  `remaining = charge.totalAmountMinor − Σ payments.amountMinor`.
- **Aşırı tahsilat reddedilir** (`400 OVERPAYMENT`): `0 < amount ≤ remaining`.
- **Ödeme iptali/iadesi = yeni NEGATİF satır** (`reversalOfPaymentId`, `amountMinor < 0`),
  mevcut satır **silinmez/değiştirilmez**. Bir ödeme en fazla bir kez ters çevrilir
  (`@@unique([reversalOfPaymentId])`), ters kayıt tutarı orijinalin tam tersidir.
- Charge durumu her ödeme sonrası bakiyeden **türetilir**: `PAID` / `PARTIALLY_PAID` / `ISSUED`.
- **`OVERDUE` KALICI DEĞİL, TÜRETİLMİŞTİR** (ADR-125): `dueAt < now && remaining > 0 && status ∈
  {ISSUED, PARTIALLY_PAID}`. Kalıcı olsaydı bir cron'a bağımlı, güncellenmediğinde yanlış olan
  bir alan üretirdi. Persist edilen `status` enum'u `{DRAFT, ISSUED, PARTIALLY_PAID, PAID,
  CANCELLED}`; API/UI ayrıca **`displayStatus`** döndürür ve orada `OVERDUE` görünür.

### 2.6 Kampanya ödeme alınmadan yayınlanabilir mi? → **Tercih edilen MVP + store setting** (ADR-124)

Kampanyaya additive `commercialMode` eklenir:

- `INTERNAL_PROMOTION` — **varsayılan**; mağazanın kendi ürününü öne çıkarması. Ticari kayıt
  gerektirmez, guard'dan **muaftır**. *Mevcut tüm kampanyalar bu değeri alır → sıfır regresyon.*
- `SPONSORED` — üçüncü taraf adına yayın. Ticari kayıt **zorunludur**.

`StoreSettings.allowUnpaidSponsoredCampaigns` (`Boolean @default(false)`):

- **`false` (varsayılan):** `SPONSORED` kampanya **yalnızca** ticari olarak uygunsa yayınlanır ve
  **teslim edilir**. Uygunluk = geçerli anlaşma bağlı + anlaşma `ACTIVE` + anlaşma penceresi `now`'u
  kapsıyor + vadesi geçmiş açık tahakkuk **yok** + bütçe tükenmemiş.
- **`true`:** teslim engellenmez; ekranlarda **görünür risk göstergesi** kalır.

**Guard İKİ katmanda zorlanır** — yalnız admin yazma tarafı yeterli DEĞİLDİR (anlaşma sonradan
süresi dolabilir / vade geçebilir):

1. **Admin yazma:** `status=ACTIVE` + `commercialMode=SPONSORED` + uygun değil → `409
   SPONSORSHIP_NOT_ELIGIBLE`.
2. **Teslim (render):** `resolveHomeCandidates` / `resolveSearchCandidates` aday sorgusunda
   uygunluk **WHERE koşulu olarak** uygulanır → uygun olmayan `SPONSORED` kampanya hiç aday
   olmaz, dolayısıyla **impression bile kaydedilmez**. "Sessizce sponsorlu gösterim üretip ticari
   kaydı olmayan kampanya çalıştırma" kuralı burada sağlanır.

Bütçe tükenmesi (`budgetLimitMinor` aşımı) **settlement finalize anında** deterministik olarak
tespit edilir ve `SponsorshipAgreement.budgetExhaustedAt` damgalanır (cron gerektirmez; bütçe
zaten yalnız tahakkuk anında bilinebilir). Ödeme/limit artışı bu damgayı temizler.

### 2.7 Settlement snapshot + immutability (ADR-123)

- Dönem tipleri: `CAMPAIGN_END` · `WEEKLY` · `MONTHLY` · `MANUAL`.
- `DRAFT` settlement **yeniden hesaplanabilir** (preview). `FINALIZED` **immutable**: metrik
  alanları ve `snapshot` (Json) bir daha yazılmaz; her yazma denemesi `409 SETTLEMENT_FINALIZED`.
- **Aynı dönem iki kez tahakkuk ettirilemez — DB seviyesinde:**
  `@@unique([agreementId, periodStart, periodEnd])`. `DRAFT` silinebilir (dönem serbest kalır);
  `FINALIZED` dönemi **kalıcı olarak** işgal eder.
- Sonradan gelen event/iade **FINALIZED settlement'ı sessizce değiştirmez**. Düzeltme gerekiyorsa
  ayrı bir **`ADJUSTMENT` tahakkuku** üretilir (§2.8).

### 2.8 Refund adjustment (ADR-123)

Dönem kapandıktan sonra `OrderSponsoredAttributionRefund` üzerinden gelen iade, `CPA` /
`REVENUE_SHARE` anlaşmalarında tahsil edilmiş bedeli fazla bırakır. Çözüm:

- Finalized settlement'ın snapshot'ındaki `refundedRevenueMinor` ile **şimdiki** değer karşılaştırılır;
  fark → **negatif tutarlı `ADJUSTMENT` charge** (alacak azaltıcı).
- **İdempotent:** `@@unique([storeId, idempotencyKey])`, anahtar `refund-adj:<settlementId>:<refundedTotal>`.
  Aynı iade seti ikinci kez adjustment üretmez.
- `FIXED_FEE` / `CPM` / `CPC` iadeden **etkilenmez** (gösterim/tıklama gerçekleşmiştir) →
  adjustment 0 döner, kayıt açılmaz.

---

## 3. Domain modeli (Prisma — ADDITIVE)

Yeni enum'lar: `SponsorAccountStatus`, `SponsorshipAgreementStatus`, `SponsorshipPricingModel`,
`SponsorshipSettlementPeriod`, `SponsorshipSettlementStatus`, `SponsorshipChargeType`,
`SponsorshipChargeStatus`, `SponsorshipPaymentMethod`, `SponsoredCommercialMode`.

Yeni modeller (hepsinde `storeId` + `@@index([storeId])` — tenant izolasyonu):

| Model | Anahtar kısıtlar |
|---|---|
| `SponsorAccount` | `@@unique([storeId, companyName])` |
| `SponsorshipAgreement` | `@@unique([storeId, agreementNumber])` |
| `SponsorshipAgreementCampaign` | `@@unique([campaignId])` — bir kampanya en fazla **bir** anlaşmaya bağlı (guard determinizmi) |
| `SponsorshipSettlement` | `@@unique([agreementId, periodStart, periodEnd])` — çift tahakkuk DB'de imkânsız |
| `SponsorshipCharge` | `@@unique([storeId, chargeNumber])`, `@@unique([settlementId])`, `@@unique([storeId, idempotencyKey])` |
| `SponsorshipPayment` | `@@unique([reversalOfPaymentId])`, `@@unique([storeId, idempotencyKey])` |

Mevcut modellere **2 additive kolon**: `SponsoredProductCampaign.commercialMode`
(default `INTERNAL_PROMOTION`) ve `StoreSettings.allowUnpaidSponsoredCampaigns`
(default `false`). Var olan satırlar default'la dolar → **geriye dönük davranış değişmez**.

Para alanları **tamsayı minor unit** (`...Minor`); oranlar **basis point** (`...Bp`, 10000 = %100)
— float YOK.

---

## 4. SAF çekirdek — `apps/api-gateway/src/sponsorship/billing-core.ts`

Yan etkisiz, Prisma'ya bağımsız, birim-testli. Tüm ticari matematik **yalnız buradadır**.

### 4.1 Anlaşma yaşam döngüsü

```
DRAFT ──▶ PENDING_APPROVAL ──▶ ACTIVE ──▶ SUSPENDED ──▶ ACTIVE
   │              │               │                        │
   ▼              ▼               ▼                        ▼
CANCELLED     CANCELLED      COMPLETED / CANCELLED     COMPLETED / CANCELLED
```

`isAgreementTransitionAllowed(from, to)` **allowlist**'tir (izin verilmeyen → `409
INVALID_STATUS_TRANSITION`). `COMPLETED` ve `CANCELLED` **terminal**dir. İptal, geçmiş settlement
ve ödeme kayıtlarını **SİLMEZ** (append-only defterler korunur; yalnız yeni teslim/tahakkuk durur).

### 4.2 Kampanya tarih kapsaması

`isCampaignCoveredByAgreement(agreement, campaign)`: anlaşma penceresi kampanya penceresini
**tamamen kapsamalıdır**. Kampanyanın açık ucu (`startsAt`/`endsAt` = null) **sonsuz** kabul edilir
ve kapalı bir anlaşma penceresi tarafından kapsanamaz → bağlama reddedilir (`400
CAMPAIGN_WINDOW_NOT_COVERED`).

### 4.3 Billable metrik tanımı (bot + duplicate dışlama)

- `billableImpressions` = `isBot = false` **ve** `(visitorIdHash, placementId)` bazında
  `DISTINCT` IMPRESSION sayısı. (Write-time dedupe 30 dk penceresiyle çalışır; ücretlendirme
  **dönem boyunca tekil** ziyaretçi sayar → daha muhafazakâr, sponsor lehine.)
- `billableClicks` = `isBot = false` **ve** `(visitorIdHash, placementId)` bazında `DISTINCT` CLICK.
- `attributedOrders` = `OrderSponsoredAttribution` satır sayısı (zaten sunucu-otoriter, bot yok).
- `netRevenueMinor` = `Σ gross − Σ refunded` (attribution defterinden).
- `visitorIdHash` NULL olan event'ler (hash üretilemeyen istisnai durum) **ücretlendirmeye girmez**.

### 4.4 Fonksiyonlar

`computePricedAmountMinor` · `computeTaxAmountMinor` · `computeChargeTotals` ·
`computeRemainingMinor` · `isWithinRemaining` · `resolveChargeStatus` · `isChargeOverdue` ·
`resolveChargeDisplayStatus` · `computeDueAt` · `isBudgetExceeded` ·
`isAgreementTransitionAllowed` · `isCampaignCoveredByAgreement` · `computeRefundAdjustmentMinor` ·
`isAgreementCommerciallyEligible` · `assertSameCurrency`.

---

## 5. API yüzeyi (hepsi store-admin; **public uç YOK**)

`/stores/:storeId/...` + `requireStoreAdmin` guard'ı; her sorgu `where: { storeId, ... }`.

| Metot | Yol |
|---|---|
| GET/POST | `sponsors` |
| GET/PATCH | `sponsors/:id` |
| GET/POST | `sponsorship-agreements` |
| GET/PATCH | `sponsorship-agreements/:id` |
| POST | `sponsorship-agreements/:id/campaigns` (bağla) |
| DELETE | `sponsorship-agreements/:id/campaigns/:campaignId` (çöz) |
| POST | `sponsorship-agreements/:id/settlements/preview` (DRAFT hesapla/yeniden hesapla) |
| POST | `sponsorship-settlements/:id/finalize` |
| POST | `sponsorship-settlements/:id/charge` (tahakkuk üret; idempotent) |
| POST | `sponsorship-settlements/:id/refund-adjustment` |
| GET | `sponsorship-settlements` · `sponsorship-charges` · `sponsorship-payments` |
| POST | `sponsorship-charges/:id/issue` · `.../cancel` |
| POST | `sponsorship-charges/:id/payments` (manuel tahsilat) |
| POST | `sponsorship-payments/:id/reverse` |
| GET | `sponsorship-dashboard` |
| GET | `sponsorship-charges/export` · `sponsorship-payments/export` (CSV) |

**Güvenlik kuralları:** vergi numarası / iletişim / fatura adresi / `documentUrl` **hiçbir public
response'a çıkmaz** (public uç yok). Finalized settlement immutable. Charge üretimi idempotent.
Aşırı tahsilat reddedilir. Currency tutarlılığı zorlanır. Durum geçişleri allowlist. Cross-store
erişim `storeId` scope'u ile 404 döner (varlık sızıntısı yok).

---

## 6. Store Admin ekranları (ADR-089/090 reuse — yeni tablo sistemi YOK)

`/sponsors` · `/sponsors/[id]` · `/sponsorship-agreements` · `/sponsorship-agreements/[id]` ·
`/sponsorship-settlements` · `/sponsorship-payments`.

Data Grid (`useDataGridQuery` + `DataGrid` + `DataGridToolbar` + `DataGridPagination`), BFF
proxy (`app/api/...` + `requireStoreContext` + `isValidCsrfRequest` + `pickListQuery` allowlist),
`SurfaceCard`/`PageHeader`/`Badge` premium kit. Nav'a "Sponsorluk" grubu eklenir.

Dashboard KPI: aktif sponsor · aktif anlaşma · toplam sözleşme bedeli · tahakkuk eden · tahsil
edilen · kalan alacak · vadesi geçen · dönemsel sponsorlu net gelir · campaign profitability
(`netRevenue − charge`). Kırılımlar: sponsor · anlaşma · kampanya · pricing model · vade durumu.
**Her KPI para birimi bazında ayrı satırdır** (§2.4).

---

## 7. Muhasebe ve belge sınırı (MVP dışı — TD)

Paraşüt/Logo/Mikro entegrasyonu · e-Fatura/e-Arşiv · banka hareketi eşleştirme · otomatik
mutabakat · gelir muhasebeleştirme (revenue recognition) · komisyon faturaları · çoklu para birimi
kur dönüşümü · sponsor self-service portalı · otomatik dönemsel settlement zamanlayıcısı.

---

## 8. Kararlar → ADR eşlemesi

| ADR | Konu |
|---|---|
| ADR-121 | Sponsor ticari domain sınırı (`SponsorAccount` ayrı model) |
| ADR-122 | Pricing model otoritesi (tek sunucu-taraflı formül seti) |
| ADR-123 | Settlement snapshot + immutability + refund adjustment |
| ADR-124 | Unpaid campaign publication policy (iki katmanlı guard) |
| ADR-125 | Tahakkuk ↔ tahsilat ayrımı, türetilmiş bakiye ve `OVERDUE` |
| ADR-126 | Ticari belge sınırı (tahakkuk ≠ resmî fatura) |
| ADR-127 | Currency + vergi otoritesi ve snapshot davranışı |

---

## 9. Test kapsamı

**Domain (SAF):** agreement lifecycle · campaign date coverage · invalid transition · FIXED_FEE ·
CPM · CPC · CPA · revenue share · bot/dedupe exclusion · budget cap · settlement idempotency ·
finalized immutability · refund adjustment · tax calculation · overdue · partial payment · full
payment · overpayment rejection · currency mismatch.

**HTTP/entegrasyon:** cross-store isolation · guard (409) · idempotent charge · reversal ·
CSV injection · dashboard currency ayrımı.

**Frontend:** sponsor CRUD · agreement form · campaign linking · settlement preview/finalize ·
charge creation · manual payment · overdue state · dashboard · CSV · loading/empty/error/a11y.
