# Influencer Campaign Lifecycle & Granular Analytics — Analiz

> Kapsam: TODO-160 (ADR-102…107) ile shipped edilen influencer tracking & attribution
> çekirdeği üzerine **kampanya/link yaşam döngüsü** ve **kampanya/URL bazında granüler
> analitik** eklenmesi. Bu belge mevcut akışı çıkarır, iki ürün kusurunu kök nedeniyle
> tanımlar ve alınan kararları listeler. İlgili ADR'ler: ADR-170…ADR-176.

## 0. İki ürün kusuru (talep)

1. **Durdurulmuş kampanyanın tracking URL'si hâlâ ürüne yönlendiriyor.**
2. **Influencer detayındaki analizler tüm kampanya/link verilerini tek toplamda
   gösteriyor; kampanya ve URL bazında ayrıştırılmıyor.**

---

## 1. Mevcut akış (kod envanteri)

### 1.1 Modeller (`packages/db/prisma/schema.prisma`)

| Model | Satır | Not |
|---|---|---|
| `Influencer` | 3593 | `status: InfluencerStatus(ACTIVE\|INACTIVE)`; `@@unique([storeId, code])` |
| `InfluencerCampaign` | 3616 | `status: InfluencerCampaignStatus(ACTIVE\|PAUSED\|ARCHIVED)`; `attributionWindowDays`, `startsAt?`, `endsAt?` |
| `InfluencerTrackingLink` | 3647 | `status: TrackingLinkStatus(ACTIVE\|INACTIVE)`; `tokenHash` (plain saklanmaz), `utmSource/Medium/Campaign?` |
| `AttributionClick` | 3681 | KVKK: yalnız hash + `referrerHost`; `isBot`; **UTM snapshot YOK** (link'e join) |
| `OrderAttribution` | 3711 | sipariş başına TEK; `snapshot Json` (immutable, UTM dahil); `grossRevenueMinor/refundedRevenueMinor/netRevenueMinor/currency` |
| `OrderAttributionRefund` | 3747 | append-only iade defteri; `@@unique([orderAttributionId, refundKey])` |

**Enum boşluğu:** Campaign'de `DRAFT/ENDED/CANCELLED` yok (yalnız ACTIVE/PAUSED/ARCHIVED);
link'te `PAUSED/REVOKED` yok (yalnız ACTIVE/INACTIVE). İstenen yaşam döngüsü semantiği
(bkz. §2, §5) bu değerler olmadan ifade edilemez.

### 1.2 Redirect route

İki katman:

- **Storefront** `apps/storefront-web/app/t/[token]/route.ts` — `GET /t/:token`. Gateway'e
  `postTrackClick` POST atar, dönen `targetPath`'e `safeNextPath` ile redirect, `grant`
  varsa `commerce_os_attribution` cookie yazar.
- **Gateway** `apps/api-gateway/src/influencers/routes.ts` — `POST /public/stores/:slug/track/:token`
  (601). Rate-limit → format → store çöz → `tokenHash` lookup → **aktiflik kontrolü (629-634):**
  `link.status===ACTIVE && campaign.status===ACTIVE && influencer.status===ACTIVE` +
  kampanya tarih aralığı. Aktif değilse `grant:null` döner **ama gerçek `targetPath`'i
  (ürün yolu) yine döndürür (636-641).**

**Sorulara net cevap:**

- *Redirect yalnız link status'una mı bakıyor?* Hayır — link + campaign + influencer status
  + kampanya tarih penceresi kontrol ediliyor.
- *Campaign status kontrol ediliyor mu?* Evet (attribution/click kapısı için). **Ama redirect
  HEDEFİ için değil** — pasifken bile kullanıcı gerçek ürüne gönderiliyor. **Kusur 1'in kök
  nedeni budur.**
- *Link durdurulduğunda click/session/cookie yazılıyor mu?* **Hayır** — `active=false` →
  click insert yok, grant null → storefront cookie'ye dokunmaz. Bu kısım zaten doğru.
- *Redirect anında store aktif mi / target ürün aktif mi?* **Hayır, kontrol edilmiyor.**
  (Boşluk — §3'te kapatılıyor.)

### 1.3 Attribution / cookie / conversion

- Cookie: `commerce_os_attribution` (opak grant taşıyıcı, httpOnly+lax) + `commerce_os_vid`
  (opak visitor id). Grant gateway-imzalı (HMAC/SESSION_SECRET); içindeki `expiresAt` click
  anındaki `attributionWindowDays`'ten türetilir.
- Conversion: `apps/api-gateway/src/influencers/checkout-attribution.ts` →
  `resolveAttributionForCheckout`. Grant imza + cross-store + pencere + **campaign ACTIVE +
  influencer ACTIVE** DB'den yeniden doğrulanır; sonra `OrderAttribution` snapshot yazılır
  (checkout yan etkisi; public write endpoint yok).

**Soru:** *Eski attribution cookie kampanya durduktan sonra siparişe attribution yazabiliyor mu?*
Şu an **hayır** — `campaign.status !== "ACTIVE"` reddediliyor. Yani PAUSED/ENDED kampanyada
pencere-içi geçerli eski session bile conversion üretemiyor. Bu, istenen politikadan (§5)
**daha katı**; ENDED/PAUSED için conversion politikası değiştirilecek. Ayrıca **link REVOKED
checkout'ta engellenmiyor** (link opsiyonel okunuyor) — kapatılacak.

### 1.4 Analytics / dashboard

- Endpoint: `GET /stores/:storeId/influencer-analytics` (routes.ts 467), filtreler
  `dateFrom/dateTo/influencerId/campaignId/trackingLinkId`.
- Servis: `getAnalyticsImpl` (data.ts 718) — 12 paralel raw SQL. **Zaten** `byInfluencer`,
  `byCampaign`, `byLink`, `byProduct` breakdown üretiyor; ama:
  - Para birimi **tek satır** olarak "en sık currency" seçilip (786) tüm gelir
    `SUM(grossRevenueMinor)` ile **para birimi ayrımı olmadan** toplanıyor → çok-para-birimli
    mağazada sessiz yanlış toplam.
  - Store-admin **influencer detayı yalnız `summary` KPI şeridini** gösteriyor; kampanya
    kartları statik (window + linkCount) — **per-campaign/per-link performans metriği yok**.
    **Kusur 2'nin kök nedeni budur:** veri katmanı breakdown üretse de UI tek toplamda kalıyor;
    üstelik kampanya detay / link detay drill-down route'u yok.

### 1.5 Store-admin UI

`apps/store-admin-web/app/(app)/influencers/[id]/page.tsx` (839 satır): üstte `AttributionMetrics`
(influencer toplam KPI), "Influencer kampanyaları" (window + linkCount), "İzleme linkleri"
(lifetime totalClicks + attributedOrders). Contracts: `packages/contracts/src/index.ts`
8066-8421. API-client: `packages/api-client/src/index.ts` `influencers.*`.

**campaignId/linkId event ve order attribution'da güvenilir korunuyor mu?**
- `AttributionClick`: `campaignId` + `trackingLinkId` FK (güvenilir). UTM **snapshot değil**,
  link'e join ile okunuyor → link sonradan UTM'i değişirse geçmiş click raporu değişir.
- `OrderAttribution`: `campaignId` + `trackingLinkId?` + `snapshot Json` (UTM dahil, immutable).
  Sipariş-anı UTM korunuyor. `trackingLinkId` `onDelete: SetNull` (link silinirse null; snapshot
  yine kimliği taşır).

---

## 2. Yaşam döngüsü modeli (karar → ADR-170)

Additive migration (PG enum değeri eklemek güvenli). **Gereksiz değil — §5 attribution
politikası ENDED/CANCELLED ve PAUSED/REVOKED ayrımını zorunlu kılar.**

### Campaign — `InfluencerCampaignStatus`
Eklenen: `DRAFT`, `ENDED`, `CANCELLED`. Korunan: `ACTIVE`, `PAUSED`, `ARCHIVED` (legacy).
Legacy `ARCHIVED` ≡ `ENDED` semantiği (terminal, tarih uzatılmadıkça yeni click yok, geçmiş
metrik korunur, pencere-içi eski session conversion üretebilir). Yeni UI `ARCHIVED` üretmez.

### Tracking link — `TrackingLinkStatus`
Eklenen: `PAUSED`, `REVOKED`. Korunan: `ACTIVE`, `INACTIVE` (legacy). Legacy `INACTIVE` ≡
`PAUSED` (yeniden etkinleştirilebilir). `REVOKED` terminal (rotation/iptal) — geri alınamaz.

Normalizasyon saf helper'larla (`normalizeCampaignStatus` / `normalizeLinkStatus`) yapılır;
mantık her yerde normalize edilmiş değeri kullanır.

---

## 3. Redirect erişim kuralı (karar → ADR-171)

Tracking URL yalnız **hepsi** sağlanırsa hedefe yönlendirir:
`campaign ACTIVE` · `link ACTIVE` · `startsAt geçmiş` · `endsAt geçmemiş` · influencer ACTIVE
· **store ACTIVE** (yeni) · **target ürün/kategori aktif** (yeni).

Sağlanmazsa: hedefe redirect **yok**, click/session/cookie/visitor **yok**, pencere
başlatılmaz. Bunun yerine markalı terminal sayfaya (`/campaign-unavailable`) yönlendirilir.

Saf karar fonksiyonu `evaluateRedirectEligibility(...)` (tracking-core.ts, birim-testli) →
`{ allowed, reason }`. `reason` domain kodu (§15); public yanıt ham kodu göstermez, 3 mesaj
kovasına eşlenir.

---

## 4. Durdurulmuş kampanya terminal sayfası (karar → ADR-172)

`/campaign-unavailable` — markalı storefront sayfası. Duruma göre 3 mesaj kovası (kampanya
sona erdi / şu anda aktif değil / bağlantı artık kullanılamıyor). Ürün adı/müşteri bilgisi
sızdırılmaz; token yanıtta görünmez; bu sayfa attribution event **değildir**.

**HTTP semantiği kararı:** İdeal `410 Gone`. Ancak Next.js App Router render edilen
`page.tsx` için özel status (410) döndüremiyor (yalnız route handler ham yanıtta). Ürün
kararı: **markalı UX önceliği** → `/t/[token]` route handler pasifken `307` ile
`/campaign-unavailable?reason=...`'e yönlendirir; terminal sayfa **200 + `robots: noindex,
nofollow`**. Bu, talebin açıkça izin verdiği "güvenli 200 + noindex" yoludur. Gerekçe
ADR-172'de.

---

## 5. Attribution kapanış politikası (karar → ADR-173)

Yeni ziyaretlerde (PAUSED/ENDED/CANCELLED): click/session/cookie/attribution **yok** (§3
redirect kapısı).

Önceden geçerli oluşmuş session için conversion (checkout) kararı:

| Durum | Yeni click | Pencere-içi eski session conversion |
|---|---|---|
| `ACTIVE` | var | ✅ |
| `PAUSED` | yok | ✅ (grant zaten geçerliyken üretilmişti) |
| `ENDED` / `ARCHIVED` | yok | ✅ (pencere bitişten önce başladıysa) |
| `CANCELLED` | yok | ❌ (eski session da üretmez) |
| `DRAFT` | yok | ❌ |
| link `REVOKED` | yok | ❌ (o linkten conversion yok) |
| link `PAUSED`/`INACTIVE` | yok | ✅ (yalnız yeni click kapalı) |

Saf fonksiyon `evaluateConversionEligibility(campaignStatus, linkStatus, influencerStatus,
withinWindow)` (birim-testli) `resolveAttributionForCheckout`'ta kullanılır. Session **silinmez**
(cookie doğal TTL'inde kalır); yalnız conversion yazımı kapıdan geçer.

---

## 6. Redirect race (karar → ADR-171)

Campaign/link status **sunucuda aynı işlemde** okunur (gateway tek `resolveTrackingLinkByTokenHash`
+ eşzamanlı status). İstemci cache otoritesi yok. Stop sonrası geç gelen istek DB'den güncel
status okur → attribution üretmez. Click insert + grant üretimi status okumasından **sonra**
sıralı yapılır; write başarısız olsa da attribution grant üretilmez (kapı önce).

---

## 7-9. Dashboard bilgi mimarisi (karar → ADR-174)

Üç seviye + drill-down route'ları:
- **A. Influencer toplamı** — `GET .../influencers/:id/analytics` (mevcut analytics
  influencerId ile). campaign/active-campaign/link count + clicks/unique/orders/revenue/CR/AOV.
- **B. Kampanya tablosu** — her campaign satırı metrikli; satır → kampanya detayı.
- **C. Link tablosu** — seçili campaign altında her link metrikli + UTM + status + tarihler.
- **Campaign detay** `GET .../campaigns/:campaignId/analytics` + time series + UTM breakdown.
- **Link detay** `GET .../links/:linkId/analytics` + time series.

Aynı kampanyadaki linkler `campaignId` scope'uyla izole; cross-store reddedilir; hiyerarşi
(influencer→campaign→link) sunucuda doğrulanır.

---

## 10. UTM snapshot politikası (karar → ADR-175)

- **Order:** UTM zaten `OrderAttribution.snapshot`'ta immutable (korunur). ✅
- **Click:** UTM click'e snapshot **edilmiyor** (link'e join). Karar: click-seviyesi UTM
  raporu link'in **mevcut** UTM'inden okunur; UTM alanları link üzerinde **değiştirilemez
  kabul edilir değil** — bu yüzden click raporunun tarihsel doğruluğu için ya (a) UTM'i
  click'e snapshot ederiz ya (b) UTM'i immutable yaparız. **Karar:** MVP'de UTM link create'te
  set edilir; sonradan güncelleme UI'dan **kaldırılır** (UTM immutable → click join tarihsel
  olarak doğru; migration'sız, en düşük risk). Order snapshot zaten mevcut.
- Yeni link alanları: `utmContent`, `utmTerm`, `customLabel` (additive migration).

## 11-12. Currency & unique visitor (karar → ADR-176)

- **Multi-currency:** Gelir **yalnız aynı currency içinde** toplanır. Analytics per-currency
  dizisi döner (`revenues: [{currency, gross, refunded, net}]`); tek currency ise özet o
  currency'i taşır, birden fazlaysa UI ayrı gösterir, **sessiz tek toplam üretilmez**.
- **Unique visitor:** `COUNT(DISTINCT visitorIdHash)` (ham IP değil), campaign/link + tarih
  scope'unda. Aynı kişinin tekrar tıklaması click'i artırır, unique'i artırmaz. Kampanyalar
  arası unique toplanırken bir ziyaretçi iki kampanyada iki kez sayılabilir (union değil,
  toplam) — **dokümante edilir** (influencer toplamı `DISTINCT visitorIdHash` union'dur; kampanya
  satır toplamlarının aritmetik toplamından farklı olabilir).

---

## 13. Durdurma / yeniden etkinleştirme (ADR-170)

- `PAUSED → ACTIVE`: linkler yeniden çalışır; `REVOKED` link otomatik açılmaz; yeni click'ler
  için pencere yeni click anından başlar; geçmiş metrik korunur.
- `CANCELLED`: terminal; reactivate yok (explicit yeni kampanya gerekir); linkler terminal.
- `ENDED`: `endsAt` uzatılırsa explicit yeniden ACTIVE gerekir; sessiz açılmaz.

---

## 14-16. UI, hata kodları, testler

Domain kodları (§15): `CAMPAIGN_NOT_ACTIVE`, `CAMPAIGN_ENDED`, `CAMPAIGN_CANCELLED`,
`TRACKING_LINK_NOT_ACTIVE`, `TRACKING_LINK_REVOKED`, `TRACKING_LINK_EXPIRED`,
`TRACKING_TARGET_NOT_AVAILABLE`, `STORE_NOT_ACTIVE`. Public redirect ham göstermez; store-admin
TR/EN karşılıkları eklenir. Test kapsamı §16 (redirect/attribution/analytics/UI).

---

## Kararlar özeti

| # | Karar | ADR |
|---|---|---|
| D1 | Lifecycle enum'ları additive genişlet + legacy normalize | ADR-170 |
| D2 | Redirect erişim kuralı (store + target aktiflik dahil) + race | ADR-171 |
| D3 | Terminal sayfa 200+noindex (Next App Router 410 kısıtı) | ADR-172 |
| D4 | Attribution kapanış politikası (PAUSED/ENDED convert, CANCELLED/REVOKED etmez) | ADR-173 |
| D5 | 3-seviyeli dashboard + campaign/link detay route'ları | ADR-174 |
| D6 | UTM immutable + click join; content/term/label additive | ADR-175 |
| D7 | Per-currency ayrı toplam + unique visitor DISTINCT hash | ADR-176 |
</content>
</invoke>
