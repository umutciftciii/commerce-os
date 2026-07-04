# Runbook — Kargo Sandbox Uçtan Uca Smoke (TODO-142)

Kargo akışının (gönderi oluşturma → barkod → tracking sync → webhook → müşteri/admin UI)
sandbox/local/staging ortamında güvenle doğrulanması için pratik kontrol listesi. Yıkıcı komut,
gerçek/prod credential ve runtime veri mutasyonu **içermez**. Domain mantığını değil, mevcut davranışı
**gözlemler**.

İlgili referans dokümanları (davranış detayı orada): `docs/OPERATIONS.md`
(webhook/sync/barkod/CBS/adres bölümleri), `docs/DECISIONS.md` (ADR-044…057).

> **Kapsam.** Bu bir okuma/gözlem runbook'udur. Yazma (createRecipient/createOrder/createbarcode/cancel)
> yalnızca ilgili guard üçlüsü (env flag + `providerConfig.allow*` + request `explicitConfirm:true`)
> bilinçli açıldığında ve **sandbox** hesapla yapılır. Şüphedeyseniz yazmayı KAPALI bırakın.

---

## 0. Ortam değişkenleri (hızlı referans)

| Env | Amaç | Smoke değeri |
| --- | --- | --- |
| `SHIPPING_SANDBOX_HTTP_ENABLED` | Sağlayıcı HTTP transport'u | Gerçek sandbox çağrısı için `true`; aksi halde çağrı `SHIPPING_HTTP_DISABLED` döner |
| `SHIPPING_ENCRYPTION_KEY` | Kargo credential AES-256-GCM anahtarı | Sandbox anahtarı (yoksa `CONFIG_MISSING`) |
| `SHIPMENT_SYNC_ENABLED` | Zamanlanmış sync worker | Gözlem için `true`, izole test için `false` + manuel sync-all |
| `BARCODE_RETRY_ENABLED` | Barkod retry/backoff worker | Gözlem için `true`, izole test için `false` + manuel retry |
| `PUBLIC_WEBHOOK_BASE_URL` | Panelde üretilen webhook URL tabanı | Yerel: `http://localhost:4000` |
| `DHL_ECOMMERCE_ALLOW_*` / `GELIVER_ALLOW_LABEL_PURCHASE` | Yıkıcı işlem guard'ları | Yazma testi yapmıyorsan `false` |
| `API_GATEWAY_URL` | Web app'lerin gateway tabanı (TD-038) | Compose: `http://api-gateway:4000`; boş→default |

Tümü opsiyonel/boş-string toleranslıdır (TD-036/TD-038); `KEY=` boş bırakmak varsayılana düşer,
boot çökmez.

---

## 1. Ön koşullar

- [ ] Stack ayakta: `docker compose ps` → tüm servis `healthy`/`running` (7/7).
- [ ] api-gateway sağlıklı: `curl -s localhost:4000/health` → `{"status":"ok"}`.
- [ ] storefront erişilebilir: `curl -s localhost:3002/api/health` (veya panelin health ucu).
- [ ] store-admin erişilebilir: `curl -s localhost:3001/api/health`.
- [ ] Sandbox env değerleri mevcut (bkz. §0); **gerçek/prod credential kullanılmıyor**.
- [ ] Yazma guard'ları amaca göre bilinçli açık/kapalı (varsayılan: kapalı).
- [ ] Sağlayıcı tipi ve mağaza sağlayıcı config'i doğrulandı (store-admin → Kargo Sağlayıcıları →
      ENABLED; DHL/MNG mı MOCK mu). Sağlayıcı config ENABLED değilse sync/barkod adayı seçilmez.

**Beklenen:** Transport kapalıyken (`SHIPPING_SANDBOX_HTTP_ENABLED=false`) tüm sağlayıcı çağrıları
`SHIPPING_HTTP_DISABLED` ile güvenle durur; bu bir hata değil, bilinçli kapalı transporttur.

---

## 2. Sipariş / ödeme uygunluğu

Gönderi yalnızca ödemesi uygun (PAID/AUTHORIZED) siparişte hazırlanabilir (`isOrderPaidForShipment`).

- [ ] **Ödenmemiş sipariş** için gönderi hazırlamayı dene → **409 `ORDER_PAYMENT_REQUIRED`**
      beklenir; gönderi oluşmaz.
- [ ] Ödemesi PAID/AUTHORIZED sipariş için prepare adımına geçilebilir.

**Beklenen hata:** `409 ORDER_PAYMENT_REQUIRED` (DUPLICATE_SHIPMENT ile aynı "sipariş durumu
çatışması" konvansiyonu). Müşteriye/loga secret düşmez.

---

## 3. Adres / CBS eşleme

- [ ] Sipariş teslimat adresinde il/ilçe var.
- [ ] DHL/MNG bağlamında CBS il/ilçe **kodu çözülüyor** (store-admin → sipariş → Kargo kartı →
      "Teslimat Adresini Düzenle" → CBS dropdown "eşleşme bulundu" + il/ilçe kodları).
- [ ] **Varış şubesi çözülemeyen** durum: kod 0/negatif kaydedilmez; barkod adımında MNG **20001
      "VARIŞ ŞUBESİ BULUNAMADI"** ile düşer (bu bir DATA_FIX sınıfıdır, §5).
- [ ] Onarım akışı: "Teslimat Adresini Düzenle" ile geçerli il/ilçe seç → kaydet → kodlar sunucuda
      CBS'e karşı **yeniden doğrulanır**, `lastBarcodeErrorCode` sıfırlanır, DHL'de alıcı yeniden
      iletilmeye çalışılır.

> **TD-035 notu:** Sandbox hesabın bazı varış şubelerini hiç çözemediği bilinen bir durumdur (kod
> değil, provision boşluğu). Bu durumda 20001 beklenen davranıştır.

---

## 4. Gönderi hazırlama (prepare)

- [ ] Uygun siparişte gönderi hazırla (createRecipient/createOrder yolu — yalnız guard açıksa canlı
      sağlayıcıya gider).
- [ ] **Duplicate davranışı:** aynı sipariş için ikinci aktif gönderi denemesi güvenli **duplicate**
      yanıtı döner; ikinci aktif gönderi AÇILMAZ.
- [ ] Prepare sonucu sipariş/gönderi durum özetine yansır (rozet: Hazırlanıyor/PACKED/AWAITING_PICKUP
      semantiği — ADR-045/050).

**Beklenen duplicate yanıtı:** mevcut gönderiye işaret eden güvenli yanıt (yeni kayıt yok, hata
fırlatılmaz); UI mevcut gönderiyi gösterir.

---

## 5. Barkod / etiket

- [ ] Barkod oluştur (store-admin → gönderi → "Barkod/Etiket Oluştur").
- [ ] **Beklenen sandbox hataları** üç sınıfa ayrılır (`barcode-service.ts`):
  - `RETRYABLE` — transient (timeout/5xx/network) → backoff ile **otomatik** denenir.
  - `DATA_FIX` — varış/adres eşlemesi geçersiz (ör. **20001 DESTINATION_BRANCH_NOT_FOUND**) →
    otomatik denenmez; admin onarımı (§3) bekler (`barcodeRetryBlockedReason=DATA_FIX`).
  - `TERMINAL` — kalıcı/desteklenmeyen (AUTH_FAILED, disabled) → otomatik denenmez.
- [ ] Retry/backoff durumu: `barcodeRetryCount`, `barcodeRetryBlockedReason`, `nextRetryAt` panelde
      izlenir. `MAX_ATTEMPTS` eşiğine ulaşan gönderiyi worker seçmez.
- [ ] **Manuel retry** ("Barkod/Etiket Oluştur") worker kapalıyken de çalışır ve backoff'u bypass eder.

---

## 6. Tracking sync

- [ ] Zamanlanmış sync worker davranışı: `docker compose logs api-gateway | grep "shipment sync"` →
      `worker started` / `cycle completed` özetleri (log yalnız id/store/provider/durum/hata kodu;
      secret/raw payload asla).
- [ ] **Manuel sync-all** (varsa): `POST /stores/:storeId/shipping/shipments/sync-all` (store-admin
      "Tümünü Senkronla") — zamanlanmış worker'dan bağımsız her zaman çalışır, stale/backoff filtresini
      atlar; çekirdek `sync-service.ts` ile **aynıdır** (drift yok).
- [ ] **Terminal gönderi hariç:** DELIVERED/RETURNED/CANCELLED/FAILED asla senkronlanmaz; durum yalnız
      sağlayıcı kanıtıyla ilerler, **geri gitmez**.
- [ ] **Regresyon yok:** tekrarlanan tur duplicate event üretmez (STATUS_CHANGED yalnız gerçek
      değişimde; TRACKING_UPDATED doğal anahtarla dedupe).

Transport kapalıyken sync `SHIPPING_HTTP_DISABLED` ile güvenle backoff'lar (hata değil).

---

## 7. Webhook

- [ ] Webhook token/URL: store-admin → Kargo Sağlayıcıları → sağlayıcı → **Webhook**. `PUBLIC_WEBHOOK_BASE_URL`
      tanımlıysa tam URL üretilir; değilse panel "public base URL ayarlanmalı" uyarısı gösterir.
- [ ] **Secret rotate:** "Secret'ı Yenile" → yeni secret **yalnız bir kez** gösterilir; eski token/secret
      anında geçersiz.
- [ ] **İmzalı örnek webhook** (idempotency + imza testi):
  ```bash
  BODY='{"eventId":"smoke-1","referenceId":"<ORDER_REF>","statusCode":4}'
  TS=$(date +%s)
  SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
  curl -X POST "$WEBHOOK_URL" -H "content-type: application/json" \
    -H "x-shipping-timestamp: $TS" -H "x-shipping-signature: $SIG" -d "$BODY"
  ```
- [ ] **Geçersiz imza:** yanlış/eksik `x-shipping-signature` → istek reddedilir, DB'ye yazılmaz.
- [ ] **Duplicate idempotency:** aynı gövdenin tekrarı `duplicate:true` döner (mutasyon yok).
- [ ] **Ham payload/secret sızmaz:** "Son Webhook Olayları" tablosunda ve hiçbir DTO'da raw payload/
      imza/secret gösterilmez. Outcome anlamları: `ACCEPTED` / `IGNORED_UNKNOWN_SHIPMENT` /
      `IGNORED_UNSUPPORTED` (bkz. OPERATIONS.md).

---

## 8. Müşteri UI doğrulama (storefront)

- [ ] Rozet/durum müşteri sipariş sayfasında görünür (Shipment.status'tan türetilir).
- [ ] Progress adımı doğru aşamayı gösterir.
- [ ] Timeline olayları listelenir.
- [ ] **Türkçe tarih biçimi:** `04.07.2026 18:00` (24 saat, saniyesiz; `formatDateTime`, TD-141).
- [ ] IN_TRANSIT durumunda rozet/progress **"Yolda"** gösterir.
- [ ] Yardımcı kopya **"Kargonuz taşıma sürecinde."** (IN_TRANSIT'te "alım bekleniyor" ipucu kalkar).
- [ ] **Ham sağlayıcı payload'u GÖRÜNMEZ;** yalnız allowlist projeksiyonu.

---

## 9. Store-admin UI doğrulama

- [ ] Gönderi detayı (durum, alıcı snapshot, tracking no, sağlayıcı logosu).
- [ ] "Son Webhook/Tracking Olayları" tablosu (RAW payload/secret göstermeden).
- [ ] Webhook yönetim modalı (rotate + üretilen URL/secret bir-kez gösterim).
- [ ] Retry/backoff paneli (`barcodeRetryCount` / `barcodeRetryBlockedReason` / `nextRetryAt`).
- [ ] "Teslimat Adresini Düzenle" / varış onarım UI (CBS dropdown, kod gösterimi).
- [ ] Event gösterimi güvenli: tarih `formatDateTime`, secret/raw yok.

---

## 10. Güvenlik kuralları (bu smoke sırasında)

- [ ] DB reset **YOK** (`prisma migrate reset`, `docker volume rm` vb. **çalıştırma**).
- [ ] Runtime veri üzerine **seed YOK**.
- [ ] Yıkıcı `docker system prune` / `docker volume prune` **YOK**.
- [ ] Canlı sağlayıcı / prod credential **YOK** — yalnız sandbox.
- [ ] Açık kanıt olmadan **sahte DELIVERED** üretme (durum yalnız gerçek sağlayıcı kanıtıyla ilerler).
- [ ] Müşteri/sipariş/gönderi verisi elle **değiştirilmez**.
- [ ] Loga secret/env değeri **basılmaz**.

---

## 11. Final smoke raporu (kopyala-yapıştır şablonu)

```text
KARGO SANDBOX SMOKE RAPORU
Tarih            : YYYY-MM-DD HH:MM (TZ)
Branch/commit    : <branch> @ <main commit sha>
Rebuild edilen   : <api-gateway / storefront-web / store-admin-web / -->
Env modu         : sandbox | staging   (SANDBOX_HTTP=<on/off>, SYNC=<on/off>, RETRY=<on/off>)
Sipariş referenceId : <ORDER_REF>
Shipment id / takip : <SHIPMENT_ID> / <TRACKING_NO>
Sağlayıcı        : DHL(MNG) | GELIVER | MOCK

Prepare          : OK | duplicate | <hata kodu>
Barkod           : OK | RETRYABLE | DATA_FIX(20001) | TERMINAL | <kod>
Sync             : OK | SHIPPING_HTTP_DISABLED | PROVIDER_SYNC_UNSUPPORTED | <kod>
Webhook          : imzalı=ACCEPTED | geçersiz-imza=reddedildi | duplicate=duplicate:true
Müşteri UI       : rozet/progress/timeline/TR-tarih/"Yolda" = OK | <not>
Admin UI         : detay/olaylar/webhook-modal/retry-panel/onarım = OK | <not>

Hatalar / kısıtlar:
- <ör. TD-035: sandbox varış şubesi çözülemedi → 20001 (beklenen)>
- <...>
```
