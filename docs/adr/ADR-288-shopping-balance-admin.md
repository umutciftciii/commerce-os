# ADR-288 — Shopping Balance Admin (Müşteri Bakiye Yönetimi)

**Durum:** ACCEPTED (2026-08-09; Store Admin > Finans > Alışveriş Bakiyesi).

**İlişkili:** ADR-281/282/283/284 (Customer Shopping Balance / Store Credit domaini), ADR-285/286
(refund destination + non-expiring return credit), ADR-268 (Financial Reporting), ADR-089 (Admin Data
Grid), ADR-287 (Playwright E2E release gate). Kaynak: `apps/api-gateway/src/customer-credit/`.

---

## Bağlam

Store credit (alışveriş bakiyesi) domaini (ADR-281..286) müşteri-başına lot-tabanlı, değişmez, FEFO bir
finansal defterdir. Bugüne dek admin tarafında bakiye YALNIZ müşteri detayından (Müşteriler > müşteri >
"Alışveriş Bakiyesi" kartı) tek-tek görülebiliyordu; mağazanın **tüm** bakiye hesaplarını merkezî
görecek, drill-down yapacak ve yükümlülüğü (liability) raporlayacak operasyonel bir yüzey yoktu.

## Karar

Store Admin'e **Finans > Alışveriş Bakiyesi** yüzeyi eklendi. Yeni finansal domain/model **YOK**;
kanonik domain (helper/projection) reuse edilir. Yüzey **salt-okunurdur** (tek yazma = mevcut goodwill
grant yolu).

### 1. Finansal otorite değişmez

Kullanılabilir bakiye = **canlı lot Σ remaining** predikatı ile: `status='ACTIVE' AND
remainingAmountMinor > 0 AND (expiresAt IS NULL OR expiresAt > now)`. Bu, `ledger-calc.ts`
`availableBalanceMinor` ve `report.ts` `outstandingLiabilityMinor` ile **bire bir aynı** predikattır.
Bakiye asla ledger'dan, `cachedAvailableMinor` cache'inden veya client'tan türetilmez.

### 2. Projeksiyonlar (`customer-credit/admin-projection.ts`, SALT-OKUNUR)

- `listCustomerBalances` — per-müşteri agregasyon, **tek raw SQL** (`COUNT(*) OVER()`, N+1 yok). Baz tablo
  `CustomerCreditAccount` (store-scoped), `Customer` + lot-agg + ledger-agg CTE'lerine join. Sunucu-taraflı
  arama (ad/e-posta), `balancePositive`/`source`/`expiringWithinDays` filtreleri, sıralama, sayfalama.
- `shoppingBalanceSummary` — mağaza-geneli KPI (filtreden bağımsız), aynı canlı-lot predikatı.
- `getCustomerBalanceDetail` — özet bucket'lar + lot listesi + ledger (mevcut `getCustomerBalance` reuse).

### 3. Kolon/bucket semantiği (kanonik)

Lifetime bucket'lar append-only ledger'dan tip bazında (`amountMinor` pozitif büyüklük, yön `direction`):

| Alan | Kaynak | Tanım |
| --- | --- | --- |
| available | canlı lot | Σ remaining (canlı-lot predikatı) |
| issued (toplam yüklenen) | ledger | Σ tüm CREDIT-yön hareket (lifetime brüt giriş) |
| spent | ledger | `ORDER_PAYMENT_DEBIT` |
| refundOrigin (iade kaynaklı) | ledger | `REFUND_RESTORE` |
| restored | ledger | `ORDER_CANCELLATION_RESTORE` + `RETURN_CREDIT_RESTORE` |
| goodwill | ledger | `ADMIN_GOODWILL_CREDIT` + `RECOVERY_GOODWILL_CREDIT` |
| expired | ledger | `EXPIRE` |
| nearestExpiry | canlı lot | MIN(expiresAt) (canlı, non-null) |
| lastMovement | ledger | MAX(createdAt) |

KPI özeti: outstanding liability, bakiyeli müşteri sayısı, goodwill bakiye (sourceType ∈
{ADMIN_GOODWILL,RECOVERY_GOODWILL}), refund-origin bakiye (sourceType ∈
{ORDER_REFUND,ORDER_CANCELLATION,ORDER_RETURN}), yakında-dolacak bakiye (expiresAt ∈ (now, now+N gün];
N varsayılan 30) — hepsi aynı canlı-lot predikatının daraltılmışı.

### 4. Rotalar + guard

`GET /stores/:storeId/shopping-balance` (liste + summary) ve `.../:customerId` (detay),
`requireStorePlatformAdmin` ile korunur (mevcut credit routes ile aynı DI). storeId-first scoped;
cross-store erişim not-found'dan ayırt edilemez (leak-free). Para HTTP'de **kanonik minor string**.
Client'tan bakiye/kaynak güveni yok.

### 5. Bakiye tanımlama (grant) — reuse

"Bakiye tanımla" mevcut goodwill grant yolunu (`issueCredit` → `POST .../customers/:id/credit`)
REUSE eder: expiring-only (30/60/120/180 gün), `maxGoodwillCreditPerActionMinor` politikası,
SUPER_ADMIN override, idempotency (`@@unique(storeId, idempotencyKey)`), AuditLog. Manuel non-expiring
goodwill **yasak**; refund-origin non-expiring yalnız refund-system path'lerinde kalır.

### 6. Manuel bakiye düşürme — bu PR'da YOK (bilinçli)

Güvenli adjustment debit (`adminAdjustBalance` → `ADMIN_ADJUSTMENT_DEBIT`, SUPER_ADMIN-only) domainde
**zaten mevcut**. Bu yüzey grant-only tutuldu; ayrılmış admin-privileged bir "bakiye düşür" yüzeyi
TECHNICAL_DEBT'e (TD-SBA-1) çıkarıldı.

## Sonuçlar

- (+) Merkezî operasyonel görünürlük + drill-down; finansal semantik finance report ile birebir.
- (+) Yeni finansal yazma yolu yok → invariant yüzeyi büyümez.
- (−) Liste raw SQL (identifier'lar çift-tırnaklı; modellerde `@@map` yok) — şema yeniden adlandırmada
  senkron tutulmalı. Karşılığında tek-sorgu, N+1-siz agregasyon.
- İlk store-admin E2E harness'ı bu iş kapsamında kuruldu (ADR-287 uzantısı; bkz. TESTING.md).
