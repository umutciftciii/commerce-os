# ANALIZ-2C5 — Commercial Engine (Price · Compare-at · Cost · VAT · Margin)

TODO-151 · Phase 2C-5 · ADR-074

Bu belge, Commercial Engine'in **kod yazılmadan önce** yapılan repo/veri-modeli analizidir.
Amaç: mevcut fiyat semantiğini **bozmadan**, additive ve preview-first bir toplu ticari
veri yönetim motoru tasarlamak.

---

## 1. Mevcut fiyat alanları — otoritatif kaynak nerede?

Ticari alanlar **`ProductVariant`** üzerindedir (varyant otoritatif). `Product` seviyesinde
satış fiyatı kolonu **yoktur** — ürün yalnız sunum/kategorizasyon/attribute taşır. Fiyat okuyan
her tüketici (checkout, cart, order snapshot, storefront PDP) doğrudan `ProductVariant`'tan okur.

`packages/db/prisma/schema.prisma` · `model ProductVariant`:

| Alan | Tip | Semantik |
|---|---|---|
| `priceMinor` | `Int` | **KDV DAHİL brüt satış fiyatı** (checkout bunu tahsil eder — otoritatif) |
| `compareAtMinor` | `Int?` | Karşılaştırma/liste fiyatı (üstü-çizili showroom fiyatı) |
| `costMinor` | `Int?` | Maliyet (yalnız iç marj/kâr; public API'ye **asla** sızmaz) |
| `netPriceMinor` | `Int?` | KDV hariç net (admin girişi; F4C/ADR-063) |
| `vatRateBps` | `Int` (default 2000) | KDV oranı basis-point (2000=%20) |
| `vatAmountMinor` | `Int?` | KDV tutarı (server türetir) |
| `currency` | `String` | Para birimi (varyant seviyesi) |

> **Karar:** Commercial Engine `ProductVariant`'ı otoritatif kabul eder. `Product` seviyesinde
> **fallback fiyat yoktur**, dolayısıyla korunacak inheritance de yoktur (soru 11). `priceMinor`
> NOT NULL'dır — null varyant fiyatı yoktur; generated varyantlar da reçeteden `priceMinor` ile
> üretilir (2C-3), placeholder null fiyat yoktur.

## 2. Fiyat alanları minor unit mi?

Evet. **Tümü integer minor unit (kuruş).** Float para matematiği repo genelinde yasaktır
(`packages/utils/src/vat.ts` başlık notu). Hesaplarda tek deterministik `Math.round` (pozitifte
half-up) uygulanır. Commercial Engine da yalnız integer minor unit ile çalışır.

## 3. Currency hangi seviyede?

`currency` **varyant** seviyesindedir (`ProductVariant.currency`). Bu fazda **currency
conversion yoktur**; motor yalnız aynı para birimi içinde işlem yapar. Bir bulk apply'da hedef
varyantlar tek bir currency'de olmalıdır — karışık currency → `COMMERCIAL_CURRENCY_MISMATCH`
(blocking). Bu, "aynı para birimi varsayımı açıkça doğrulanmalı" gereğini karşılar.

## 4. Compare-at semantiği

`compareAtMinor` = **liste/showroom fiyatı** (üstü-çizili). Storefront'ta yalnız `compareAt >
priceMinor` iken indirim rozeti türer (F4B kararı: satış > liste artık 400 değil, sadece rozet
türemez). Discount% = `(compareAt − price) / compareAt × 100`. Business-invariant "compare-at ≥
price" **zorunlu değildir** (F4B gevşetildi) → motor bunu **warning** olarak sınıflar, blocking
değil (soru: "compare-at invariant ihlali, eğer business rule bunu zorunlu kılıyorsa" → bizde
zorunlu değil).

## 5. Cost — vergi dahil mi hariç mi?

Sistemde cost **opaque bir minor değerdir** ve **brüt (KDV dahil) satış tavanına** karşı
kısıtlanır: F4B kuralı `costMinor <= (compareAtMinor ?? priceMinor)`. Yani cost, brüt `priceMinor`
ile aynı düzlemde kıyaslanır. Marj/markup da mevcut UI'da **brüt** üzerinden hesaplanır
(`variants-manager.tsx`: `marginPct = (gross − cost)/gross`). Commercial Engine **bu semantiği
birebir korur**: margin/markup brüt `priceMinor` vs `costMinor` üzerinden hesaplanır (tutarlılık;
iki farklı marj rakamı göstermeyiz).

## 6. VAT nasıl temsil ediliyor?

**Basis points integer** (`vatRateBps`): 2000=%20, 1000=%10, 100=%1, 0=%0. Geçerli aralık
`[0, 10000]` (`packages/utils/src/vat.ts`). Presetler `[0,100,1000,2000]` ama alan serbest
(ülkeye kilitli değil — global mağaza). Commercial Engine **mevcut bps modelini korur**, yeni
enum eklemez. Yeni oran = additive (aralıkta herhangi bir bps).

## 7. Marj vs markup farkı

- **Margin** = `(price − cost) / price × 100` (satışın yüzde kaçı kâr).
- **Markup** = `(price − cost) / cost × 100` (maliyetin üzerine yüzde kaç eklendi).

İkisi de yalnız-okunur türetilir (persist edilmez). Sıfıra bölme güvenli: `price ≤ 0` → margin
null; `cost ≤ 0` → markup null; `cost == null` → ikisi de null. `variants-manager.tsx` zaten bu
ayrımı gösteriyor → motor aynısını contract'a taşır.

## 8. Fiyat uygulaması checkout/order snapshot'u nasıl etkiler?

`priceMinor` (brüt) checkout'un tahsil ettiği ve order line snapshot'una kopyalanan değerdir.
Order oluşturma **snapshot** alır (order line varyant fiyatını kopyalar) → **geçmiş siparişler
etkilenmez**. Apply yalnız `ProductVariant`'ı günceller; ileriki checkout'lar yeni fiyatı okur,
mevcut siparişler dokunulmaz. Bu, "legacy checkout/storefront behavior unbroken" kabul kriterinin
temelidir.

> **Fiyat anchoring kararı:** Commercial Engine'in **"Price"** alanı = **brüt `priceMinor`**
> (KDV dahil satış fiyatı). Gerekçe: (a) varyant LİSTE görünümündeki "Price" kolonu zaten brütü
> gösteriyor → matris tutarlı; (b) `priceMinor` checkout/order/storefront'un okuduğu otoritatif
> değer → türetme sürprizi yok; (c) bulk rounding/price-ending yalnız müşteri-yüzlü brüt fiyatta
> anlamlı. Apply'da brüt yazılır ve `netPriceMinor = splitGrossByVat(gross, bps).netMinor`,
> `vatAmountMinor = gross − net` **yeniden türetilir** (F4C üçlüsü korunur). VAT oranı değişiminde
> **brüt SABİT kalır**, net/KDV yeniden türetilir → müşteri fiyatı asla sessizce kaymaz (bulk VAT
> değişiminin en güvenli davranışı). Tekil düzenleme modalı (net-anchored) **DOKUNULMAZ**; iki
> anchoring bilinçli olarak yan yana yaşar (ADR-074'te gerekçelendirildi).

## 9. Mevcut audit yeterli mi?

Kısmen. `ProductPriceChange` (F4B) yalnız price/compareAt/cost taşır, **VAT değişimini** ve
**batchId/rule snapshot**'ı taşımaz; `AuditLog` ise generic. Commercial apply'ın alan-bazlı,
batch-gruplu, undo-hazır izini için **yeni append-only `VariantCommercialChange`** eklenir
(Identity Engine'in `VariantIdentityChange` deseni). `ProductPriceChange`'i **bozmadan** koruruz
(tekil PATCH akışı onu yazmaya devam eder); Commercial Engine kendi audit'ini yazar.

## 10. Elle değiştirilmiş vs rule-managed fiyat ayrımı?

Bu fazda fiyatların **"rule-managed" kalıcı bir işareti tutulmaz** (rule persistence kapsam
dışı — teknik borç). Her apply audit'te `source` (`DIRECT_EDIT` | `BULK_RULE`) ve opsiyonel
`ruleSnapshot` taşır → geçmişte hangi değişimin kuraldan hangisinin elle olduğu **audit'ten**
okunabilir. Canlı bir "bu fiyat kural-yönetimli" bayrağı YOK (gelecekte eklenebilir).

## 11. Product fallback fiyat davranışı?

Yok (bkz. soru 1). Korunacak fallback yok. `Product`'a fiyat kolonu **eklenmez**.

## 12. DRAFT / ARCHIVED varyantlar matris içinde?

Identity Engine deseni: hedef küme = **non-archived (DRAFT + ACTIVE)**. ARCHIVED varsayılan
**kapsam dışı** (bulk apply'a girmez) ama SKU/unique uzayında rezervedir. Commercial Matrix:
DRAFT + ACTIVE görünür/düzenlenebilir; ARCHIVED varsayılan gizli. `includeArchived` gelecekte
additive eklenebilir. Commercial apply **status'ü DEĞİŞTİRMEZ** (activation ayrı lifecycle).

## 13. Yuvarlama hangi katmanda?

**Pure `money.ts`** katmanında — server-authoritative. UI yalnız önizleme için aynı pure
fonksiyonları çağırabilir ama kesin sonuç sunucudadır. Yuvarlama, değer-üreten her operasyondan
**sonra** ve validation'dan **önce** uygulanır (yuvarlama sonucu tekrar validate edilir; negatif/
overflow guard yuvarlama sonrası da çalışır).

## 14. Bulk apply sırasında concurrent değişim koruması?

**PostgreSQL advisory xact lock** (`pg_advisory_xact_lock(hashtext(productId))`) — 2C-3/2C-4
dersi: void döndüğü için `$executeRaw` ZORUNLU (`$queryRaw` 500 verir). Aynı ürün için apply'lar
**serileşir**. Ek olarak stale-preview fingerprint kontrolü lost-update'i engeller.

## 15. Apply öncesi stale-preview nasıl engellenir?

**Commercial fingerprint**: preview, hedef varyantların mevcut ticari durumundan (id + price +
compareAt + cost + vatRateBps, kanonik sırada) deterministik bir FNV-1a hash üretir. Apply
request'i bu `baseFingerprint`'i taşır. Apply, advisory-lock altında **sunucuda** güncel değerleri
yeniden okur, fingerprint'i yeniden hesaplar; farklıysa → `COMMERCIAL_PREVIEW_STALE`, **hiçbir
yazım yapılmaz**. İstemcinin hesapladığı hedef değerlere **asla** güvenilmez — apply kuralı/
edit'i sunucuda yeniden değerlendirir (server-authoritative recomputation).

---

## Katman ve dosya planı (additive)

`apps/api-gateway/src/commercial-engine/` (Identity Engine deseni):

| Dosya | Saf? | Sorumluluk |
|---|---|---|
| `types.ts` | ✓ | enum/interface (field, operation, rounding, state) |
| `money.ts` | ✓ | integer minor aritmetiği (yüzde/sabit/markup/rounding/ending, overflow) |
| `calculator.ts` | ✓ | margin/markup/discount (güvenli bölme) |
| `fingerprint.ts` | ✓ | FNV-1a commercial fingerprint |
| `rule.ts` | ✓ | structured rule normalize + validate (Zod contract → compiled) |
| `evaluator.ts` | ✓ | compiled rule/direct-edit → target state |
| `validation.ts` | ✓ | blocking/warning sınıflama |
| `diff-engine.ts` | ✓ | alan-bazlı diff (O(n·f), Map/Set) |
| `preview.ts` | ✓ | orkestrasyon: rows + summary + fingerprint |
| `data.ts` | ✗ | Prisma read/transaction + advisory lock + writes + audit |
| `service.ts` | ✗ | preview/apply orkestrasyonu + stale check + server-recompute |
| `routes.ts` | ✗ | HTTP uçları |

Saf katman: Prisma / DB / HTTP / logger / process.env / Date.now / Math.random / network **bilmez**.

## Değişecek DB (additive)

- `enum CommercialField { PRICE COMPARE_AT_PRICE COST VAT_RATE }`
- `model VariantCommercialChange` (append-only audit; `VariantIdentityChange` deseni)
- Mevcut `ProductVariant` fiyat kolonları **DEĞİŞMEZ** (destructive değişiklik yok).

## Contracts / api-client / store-admin

- `contracts`: commercial preview/apply request+response şemaları.
- `api-client`: `admin.products.commercial.{get,preview,apply}`.
- `store-admin`: proxy route'ları + `use-commercial-matrix` hook + `CommercialMatrix` bileşeni +
  `product-form.tsx` entegrasyonu + TR/EN i18n.

## Reddedilen alternatifler (özet)

autosave · float para · client-calculated değerlere güven · JS eval / serbest formül DSL ·
preview'siz apply · her apply'da tüm varyant update · audit tutmamak · apply ile status ACTIVE
yapmak · compare-at/cost'u JSON'da tutmak. (Detaylı gerekçe: ADR-074.)
