# H-2 — Revenue Share Currency Guard (kök neden analizi)

**Tarih:** 2026-07-28 · **İlgili borç:** [[TD-133]] · **Önceki:** H-1 Theme Token Stored XSS (CLOSED)

Sponsorship revenue-share / settlement hesaplarında **farklı para birimlerinin sessizce tek
`netRevenueMinor` toplamında birleşmesi** riski. Finansal invariant: aynı settlement/charge/revenue-share
hesabı içinde farklı `currency` değerleri sessizce toplanamaz; uyuşmazlıkta **fail-closed**.

---

## 1. Kök neden — iki gizli currency-mixing noktası

### 1a. `collectBillableMetrics` (settlement metrik toplama) — BİRİNCİL
`apps/api-gateway/src/sponsorship/data.ts` `collectBillableMetrics` (~738-831):

```ts
const attrAgg = await db.orderSponsoredAttribution.aggregate({
  where: { storeId, campaignId: { in: campaignIds }, attributedAt: { gte, lt } },
  _sum: { grossRevenueMinor: true, refundedRevenueMinor: true, netRevenueMinor: true },
});
```

`OrderSponsoredAttribution.currency` **filtreye girmez**. Bir kampanyanın dönem içinde farklı para
birimli siparişleri varsa (TRY + USD), `_sum.netRevenueMinor` bunları **tek sayıda toplar**.
`previewSettlement` (~1563-1626) sonucu `currency: agreement.currency` ile damgalar ama **hiç kontrol
etmez** → REVENUE_SHARE'de `computePricedAmountMinor(netRevenueMinor × bp)` **karışık-para toplamı**
üzerinden tahakkuk üretir. Sessiz, denetlenemez finansal bozulma.

### 1b. `getDashboard` net gelir kovası — İKİNCİL
`getDashboard` (~2411-2435):

```ts
const netAgg = await db.orderSponsoredAttribution.groupBy({
  by: ["campaignId"], where: {...}, _sum: { netRevenueMinor: true },   // currency YOK
});
// ...
const cur = currencies.get(currency /* = agreement.currency */);
if (cur) cur.net += net;   // mağaza-currency net'i anlaşma-currency kovasına ekler
```

Kod yorumu bunu itiraf ediyor: *"Net gelir mağaza sipariş para birimindedir; anlaşma para birimiyle
gruplamak MVP yaklaşımıdır (kur dönüşümü kapsam dışı — TD)."* Kârlılık = `net − charged` karışık-para.

### `isSameCurrency` nerede VAR / nerede YOK
`billing-core.ts:154` `isSameCurrency` (case/trim-insensitive) tanımlı ve UYGULANAN yollar:
- payment ↔ charge (`data.ts:2047`), advance ↔ agreement (`:2183`), advance ↔ charge (`:2237`),
  agreement-update currency değişimi (`:1336`, ayrıca `CURRENCY_LOCKED` charge varsa).

UYGULANMAYAN yollar (H-2 boşluğu): **revenue/orders → settlement metrik toplama** ve **dashboard net
kovası**. ADR-127'nin ima ettiği `assertSameCurrency` helper'ı kodda yoktu.

---

## 2. Currency otoritesi (server-side)
- `SponsorshipAgreement.currency` — **tek otorite** (ADR-127; charge/settlement oluşturma anında snapshot).
- `Settlement.currency` = `agreement.currency` (türetilir, damgalanır).
- `Charge.currency` = `agreement.currency` (türetilir).
- `Payment.currency` = `charge.currency`; `AdvanceAllocation.currency` = `charge.currency`.
- `OrderSponsoredAttribution.currency` = **sipariş para birimi** (checkout'ta `recordOrderSponsoredAttribution`
  order currency ile yazar; `sponsored/data.ts:707-733`). Agreement currency'den BAĞIMSIZ set edilir.
- İstemci `input.currency` yalnız **karşılaştırma** için (payment/advance) — otorite değil.

**Sonuç:** attribution currency ≠ agreement currency **bugün mümkün** (order currency variant-başına
`server.ts`; `Store`'da tek currency alanı yok). Bu yüzden guard gereklidir.

---

## 3. Revenue-share hesaplama politikası (bu faz)
- Metrik toplama **yalnız `currency = agreement.currency`** attribution satırlarını toplar → snapshot
  revenue rakamları **her zaman tek para birimi**.
- Dönem+kampanya kapsamında **yabancı-currency** attribution satırı varsa → **fail-closed**
  (`REVENUE_CURRENCY_MISMATCH`), draft OLUŞTURULMAZ/GÜNCELLENMEZ. Sessiz skip + kısmi settlement YOK
  (operatör finansal kapsamı eksik görmez — §5).
- FX dönüşümü / primary-currency fallback / kur dönüşümü **YOK** (FUTURE CAPABILITY, teknik borç değil).
- Refund/reversal attribution'ın **kendi currency**'sinde işler (ratio-based, currency girişi yok →
  cross-currency refund yapısal olarak imkânsız).

---

## 4. Fail-closed noktaları + domain error kodları
| Durum | Kod |
|---|---|
| agreement currency eksik/boş | `AGREEMENT_CURRENCY_REQUIRED` |
| dönemde yabancı-currency attribution | `REVENUE_CURRENCY_MISMATCH` |
| settlement.currency ≠ agreement.currency (finalize/charge) | `SETTLEMENT_CURRENCY_MISMATCH` |
| payment.currency ≠ charge.currency | `CURRENCY_MISMATCH` (mevcut) |
| allocation advance/charge currency | `CURRENCY_MISMATCH` (mevcut) |
| refund ≠ order currency | yapısal engel (ratio) |

Ham finansal payload / hassas metadata response'a dönmez; yalnız `expectedCurrency`, `foundCurrencies`,
`mismatchedOrderCount` (güvenli özet) döner. Order referansları YALNIZ AuditLog metadata'sında (bounded).

---

## 5. Mevcut veride çoklu-currency var mı?
Salt-okuma tarama scripti: `packages/db/scripts/security/scan-sponsorship-currency.mjs`. Kontrol: agreement
currency yok/boş · campaign↔agreement · **order/attribution↔agreement** · settlement↔agreement ·
charge↔settlement · payment↔charge · allocation↔charge · multi-currency revenue bucket. Rapor: store /
agreement-campaign-settlement kimliği / mismatch tipi / kayıt sayısı. PII veya tam ödeme verisi loglanmaz.

Enterprise-demo bugün tek-currency (TRY) → latent; guard eklenince tek-currency akış **bozulmaz**
(regresyon testi + canlı smoke ile kanıtlanır).

---

## 6. Değişecek dosyalar
- `billing-core.ts` — SAF `assertSameCurrency` + `REVENUE_SHARE_CURRENCY_MISMATCH` sınıflandırma helper'ları.
- `data.ts` — `collectBillableMetrics(expectedCurrency)` filtre + diagnostics; `previewSettlement` /
  `finalizeSettlement` / `createChargeFromSettlement` / `createRefundAdjustment` fail-closed; `getDashboard`
  currency-aware net + `currencyMismatch` özet; yeni error tipleri.
- `sponsorship/routes.ts` — yeni kod → HTTP eşlemesi + güvenli `extra` detay.
- `commercial-automation/settlement-scheduler-persistence.ts` — mismatch object → `{ok:false}` (fail-closed).
- `store-admin-web` — settlement/agreement/dashboard mismatch uyarısı + buton disable + TR/EN.
- `packages/db/scripts/security/scan-sponsorship-currency.mjs` — salt-okuma denetim.

Migration: **GEREKMEZ** — tüm modellerde `currency` alanı zaten var (schema `SponsorshipAgreement/
Settlement/Charge/Payment/AdvanceAllocation/OrderSponsoredAttribution`). Additive migration yok.
