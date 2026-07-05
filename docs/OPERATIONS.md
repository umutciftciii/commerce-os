# Operations — Docker Build & Cache Hygiene

Bu belge local Docker dev/smoke stack'inin **deterministik clean-build** ve **cache hijyeni**
akışını tanımlar. Kapsam: `infra/docker/node.Dockerfile` + `infra/docker/docker-compose.yml`.
Production image optimizasyonu / K8s / reverse proxy kapsam dışıdır (bkz. `docs/DECISIONS.md`
ADR-019). Geçmiş: TODO-137 (TODO-122'nin çözümü).

## Kısa özet (TODO-137)

- İmajlar artık gerekli artifact'leri **imaj içinde** üretir: `pnpm install --frozen-lockfile` →
  `pnpm db:generate` → `pnpm exec turbo run build --filter="./packages/*"`.
- `.dockerignore` host'ta üretilmiş çıktıların (`node_modules`, `**/dist`, `**/.next`, `.turbo`,
  Prisma client) build context'ine girmesini engeller.
- **Host'ta önce `pnpm build` çalıştırmak ARTIK GEREKMEZ.** Önceki kırılgan workaround (host'ta
  `pnpm db:generate && pnpm build`, sonra docker build) kaldırıldı.
- Container'lar dev modda çalışır (`pnpm --filter <ws> dev`): backend `tsx watch` ile kaynaktan,
  Next app'ler `next dev` ile. İkisi de paylaşılan paketleri derlenmiş `dist/`'ten import eder;
  bu yüzden yalnız `packages/*` build edilir (app bundle gereksiz).

## Clean build

Host'ta hiçbir `dist/`/`.next` olmasa bile çalışır (context'e girmezler zaten):

```bash
# Tüm dev imajlarını sıfırdan kur (paylaşılan node.Dockerfile)
docker compose -f infra/docker/docker-compose.yml build \
  api-gateway store-admin-web storefront-web

# Ayağa kaldır
docker compose -f infra/docker/docker-compose.yml up -d
pnpm db:migrate      # migration'ları uygula (host'tan tetiklenir)
pnpm db:seed         # seed (idempotent)
```

Layer cache'i bozan bir değişiklik yaptıysanız (nadiren gerekir):

```bash
docker compose -f infra/docker/docker-compose.yml build --no-cache api-gateway
```

### Health doğrulama

```bash
curl -fsS http://localhost:4000/health            # api-gateway → 200
curl -fsS http://localhost:3000/api/health        # storefront-web → 200
curl -isS http://localhost:3002 | head -1         # store-admin-web → login redirect
docker compose -f infra/docker/docker-compose.yml ps   # tüm servisler healthy
```

### Stale-export regresyonu doğrulama

TODO-135 çökme senaryosunun (`does not provide an export named ...`) tekrar etmediğini imaj
içinden hızlıca kanıtlamak için:

```bash
docker compose -f infra/docker/docker-compose.yml \
  exec -w /app/apps/api-gateway api-gateway \
  node -e "import('@commerce-os/contracts').then(m=>console.log('ok:',typeof m.pickOrderShipmentStatus))"
# beklenen: ok: function
```

## Cache hijyeni (güvenli)

Önce durum:

```bash
docker system df
docker builder du 2>/dev/null || true
```

Yalnızca **kullanılmayan** build cache ve dangling image temizlenir. Named volume'lara
(özellikle `docker_postgres-data`) ve DB verisine **DOKUNULMAZ**:

```bash
docker builder prune -f      # kullanılmayan build cache
docker image prune -f        # yalnızca dangling (tag'siz) image — -a DEĞİL
```

> **Yapılmaz:** `docker volume prune`, `docker system prune --volumes`, `docker system prune -a`
> (açık onay olmadan) ve `docker container prune` (diğer projelerin durmuş container'larını da
> silebilir — bkz. README aynı politika). `-a` çalışan stack'in imajlarını da silip tam rebuild'e
> zorlar; `--volumes` Postgres verisini yok eder.

Temizlik sonrası tekrar `docker system df` ile teyit edilir.

## Ortam değişkeni (env) parsing kuralı (TD-036 / ADR-057)

Tüm servisler config'i merkezi Zod şeması (`packages/config`) üzerinden yükler; `docker-compose.yml`
bu şemaya `.env.example`'ı `env_file` olarak besler. Kural:

- **Opsiyonel env'ler boş bırakılabilir.** `KEY=` (boş), yalnız-boşluk veya tanımsız değer **"yok"**
  sayılır ve alanın **varsayılanına/undefined'ına** düşer; config yüklemesi (ve boot) **çökmez**.
  Örn. `PUBLIC_WEBHOOK_BASE_URL=`, `DHL_ECOMMERCE_TEST_BASE_URL=`, `CUSTOMER_OTP_DEV_CODE=`, tüm
  `SHIPMENT_SYNC_*` / `BARCODE_RETRY_*` / provider guard flag'leri.
- **Zorunlu env'ler strict.** `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_TOKEN`, `SESSION_SECRET`
  eksik/geçersizse boot **yüksek sesle hata** verir (`ConfigValidationError`). Bunlar bilerek
  boş-string toleransı almaz.
- **Opsiyonel ama boş OLMAYAN geçersiz değer → hata.** Örn. `PUBLIC_WEBHOOK_BASE_URL=not-a-url` ya da
  `WORKER_CONCURRENCY=abc` sessizce yutulmaz; anahtar adıyla hata verilir.
- **Secret güvenliği.** Hata mesajı yalnız env **anahtarını** ve doğrulama mesajını içerir; env
  **değeri asla loglanmaz/basılmaz**. Şifreleme anahtarları (`PAYMENT_ENCRYPTION_KEY`,
  `SHIPPING_ENCRYPTION_KEY`) config'te opsiyoneldir; boş değer downstream'de `key.trim().length` ile
  "yok" sayılır (sırasıyla güvensiz dev fallback / `CONFIG_MISSING`).
- `.env.example`'a **gerçek secret yazılmaz**; yalnız placeholder/dev değerleri.

Yardımcılar: `packages/config/src/env.ts` (`optionalEnv`, `optionalUrlEnv`, `optionalBooleanEnv`,
`optionalNumberEnv`). Yeni opsiyonel env eklerken bu helper'ları kullanın (inline `z.preprocess`
tekrarlamayın).

### Web app request-time env kuralı (TD-038)

Web app'ler (storefront/store-admin/admin) merkezi `loadConfig`'i kullanmaz; opsiyonel env'leri
Next.js server bağlamında **istek/boot zamanında** `process.env.X ?? default` ile okur. TD-036'nın
boot-time normalizasyonu bu okumaları kapsamıyordu; `API_GATEWAY_URL=` gibi **boş string** bir env,
`??` fallback'ini bypass edip boş/bozuk değere düşebiliyordu.

- **Kural (config ile aynı).** Opsiyonel web env'lerinde `undefined | null | "" | yalnız-boşluk`
  → **"yok"** kabul edilir ve `?? default`'a düşer. Duz-string helper: `optionalEnvString`
  (`packages/utils`) — config'in zod-tabanlı `optionalEnv`'inin karşılığıdır ve web bundle'ına zod
  taşımadan aynı toleransı sağlar (config'in `loadConfig`/zod şeması **client bundle'a girmez**).
- **Uygulanış.** Gateway URL cozumu tek noktada: `resolveApiGatewayUrl` (`packages/api-client`) boş/
  whitespace `API_GATEWAY_URL`'yi "yok" sayar; storefront `gatewayBaseUrl()` buraya delege eder,
  store-admin/admin `createApiClient()` üzerinden aynı noktayı kullanır. Diğer okumalar helper ile
  sarıldı: cookie/CSRF adları, demo mağaza slug'ları, `STOREFRONT_BASE_URL` (aktivasyon linki),
  `STOREFRONT_CART_SECRET`.
- **Değişmeyen.** Zorunlu değerler strict kalır (ör. `INTERNAL_API_TOKEN` doğrudan okunur, boş-string
  toleransı almaz). Karşılaştırmalı okumalar (`NODE_ENV === "production"`, `ADMIN_COOKIE_SECURE ===
  "true"`, `ADMIN_COOKIE_SAME_SITE === "strict"`) zaten boş string'de doğru else-dalına düştüğünden
  dokunulmadı. Helper değeri **asla loglamaz** (secret güvenliği).

## Kargo sandbox uçtan uca smoke (TODO-142)

Gönderi → barkod → tracking sync → webhook → müşteri/admin UI akışının sandbox/local/staging'de güvenle
doğrulanması için adım adım kontrol listesi ve final rapor şablonu: **[docs/runbooks/shipping-sandbox-smoke.md](runbooks/shipping-sandbox-smoke.md)**.
Yıkıcı komut / gerçek credential / runtime mutasyon içermez; davranışı gözlemler. Aşağıdaki webhook/
sync/barkod/CBS/adres bölümleri runbook'un referans dayanağıdır.

## Kargo webhook kurulumu (TODO-128 / TODO-104)

Kargo sağlayıcı webhook'ları `POST /public/shipping/webhooks/:token` ucuna gelir; her istek
HMAC-SHA256 imza + timestamp ile doğrulanır (imzasız/yanlış istek reddedilir, DB'ye yazılmaz).

Operatör (env):

- `PUBLIC_WEBHOOK_BASE_URL` — sağlayıcıların bu uca **dışarıdan** ulaşabileceği public taban URL
  (örn. `https://api.cmddigital.com`; yerel: `http://localhost:4000`). Store-admin panel tam webhook
  URL'sini bu tabandan üretir. **Tanımsızsa** panel URL üretmez ve "public base URL ayarlanmalı"
  uyarısı gösterir. Secret DEĞİLDİR; yalnız erişim adresidir.
- `SHIPPING_ENCRYPTION_KEY` — webhook secret'ı DB'de AES-256-GCM ile şifreler (zaten kargo domaini için
  zorunlu). Yoksa rotate/decrypt `CONFIG_MISSING` döner.

Store-admin (UI: Kargo Sağlayıcıları → sağlayıcı satırı → **Webhook**):

1. "Secret'ı Yenile" ile webhook secret+token üretilir. **Yeni secret yalnızca bir kez** gösterilir —
   kaydetmeden kapatılırsa tekrar görüntülenemez (yeniden rotate gerekir). Eski token/secret anında geçersiz olur.
2. Gösterilen **Webhook URL** ve **secret** sağlayıcının webhook/callback ayarına girilir.
3. "Son Webhook Olayları" tablosu teslimatları gözlemlemek içindir (RAW payload/imza/secret gösterilmez).

### Provider ham webhook adapter davranışı (TODO-130 / ADR-055)

İmza doğrulama GEÇTİKTEN sonra payload, provider-özel adapter ile normalize edilir
(`apps/api-gateway/src/shipping/webhook-adapters.ts`):

- **PLATFORM sözleşmesi** (ADR-048: `eventId/referenceId/trackingNumber/externalShipmentId/statusCode/...`)
  tüm sağlayıcılar için çalışmaya devam eder. Test/entegrasyon istekleri bu formatla atılabilir.
- **DHL eCommerce (=MNG)**: getshipmentstatus-benzeri durum push'u
  (`{"shipment":{"referenceId":...,"shipmentId":...,"shipmentStatusCode":4,...}}`) ve trackshipment-benzeri
  kümülatif hareket push'u (dizi ya da `{"referenceId":...,"events":[...]}`) çözülür.
- **Geliver**: ham format örneği repoda olmadığından güvenli `IGNORED_UNSUPPORTED` kaydedilir
  ("Geliver ham formatı desteklenmiyor (örnek payload gerekli)"). Gerçek örnek payload alınınca adapter
  doldurulacak; o zamana kadar Geliver için PLATFORM formatı kullanılabilir.

**Hareket metniyle durum ilerletme (TODO-140).** Sağlayıcı bir HAREKET (trackshipment / DHL_TRACKING)
push'unda durum KODU taşımadan yalnız METİN gönderse bile (MNG/DHL sandbox: "SMOKE AKTARMADA",
"SMOKE TRANSFER MERKEZİNDE"), gönderinin üst durumu artık **"Yolda" (IN_TRANSIT)** olarak ilerler —
müşteri rozeti/progress "Yolda"ya geçer ve "Kargonun alımı bekleniyor." ipucu kalkar. Metin kanıtı
Türkçe büyük/küçük + diakritikten bağımsız değerlendirilir: TRANSFER/AKTARMA/TAŞIMA/YOLDA/HUB/SORTING/
DAĞITIM MERKEZ → IN_TRANSIT; DAĞITIMA ÇIKTI/DAĞITIMDA → OUT_FOR_DELIVERY; TESLİM EDİLDİ → DELIVERED.
Zayıf metin (oluşturuldu/etiket/barkod/paketlendi/"teslim alındı"=kuryeye teslim) İLERLETMEZ. **Kapsam
güvenliği:** metin çıkarımı yalnız HAREKET push'una uygulanır; getshipmentstatus DURUM push'u
(DHL_STATUS) ve PLATFORM sözleşmesi hâlâ yalnız kod/isDelivered ile ilerler. Terminal (DELIVERED/
RETURNED/CANCELLED) durum metinle GERİ ALINMAZ; ileri durum sonradan gelen zayıf/aktarma metniyle geri
çekilmez. Webhook ve zamanlanmış sync AYNI çıkarımı kullanır (drift yok).

**Sonuç (outcome) anlamları** ("Son Webhook Olayları" tablosunda görünür):

- `ACCEPTED` — gönderi eşleşti; durum sağlayıcı KANITI (kod, isDelivered VEYA hareket metni; bkz.
  TODO-140) varsa ilerledi (bilinmeyen/zayıf metin ilerletmez, DELIVERED/terminal geri alınmaz),
  event/hareketler dedupe edilerek yazıldı.
- `IGNORED_UNKNOWN_SHIPMENT` — imza geçerli ama kimlikler (externalShipmentId → trackingNumber →
  referenceId önceliğiyle, yalnız o mağaza+config kapsamında) hiçbir gönderiyle eşleşmedi. Gönderi
  YARATILMAZ; kayıt audit içindir.
- `IGNORED_UNSUPPORTED` — imza geçerli ama payload tanınmadı (bozuk JSON / sözleşme dışı / Geliver ham
  format / tek teslimatta birden fazla gönderi kimliği). Hiçbir mutasyon yapılmaz; `statusText` sanitize
  nedeni gösterir.

**Test etme (imzalı istek örneği):** gövde `BODY`, unix saniye `TS` ve rotate'te alınan `SECRET` ile
`SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')`;
istek: `curl -X POST "$WEBHOOK_URL" -H "content-type: application/json" -H "x-shipping-timestamp: $TS"
-H "x-shipping-signature: $SIG" -d "$BODY"`. Aynı gövdenin tekrarı `duplicate:true` döner (idempotent).
Tabloda ve hiçbir DTO'da raw payload/imza/secret gösterilmez; müşteri kargo takibi yalnız mevcut
allowlist projeksiyonunu görür.

## Zamanlanmış kargo sync worker'ı (TODO-129)

Barkodu hazır gönderilerin durumu artık admin aksiyonu beklemeden ilerler: api-gateway süreci
içindeki zamanlanmış döngü, terminal olmayan gönderileri periyodik olarak sağlayıcı
tracking/status sorgusuyla senkronlar (`apps/api-gateway/src/shipping/sync-worker.ts`).
Çekirdek mantık `sync-service.ts`'tedir ve **manuel `sync-all` ucu ile aynıdır** (drift olmaz).

**Provider-agnostic tasarım:** worker sağlayıcı HTTP detayını bilmez; `shipment.provider` →
adapter registry dispatch eder. Sync desteklemeyen sağlayıcılar (şu an MOCK/GELIVER —
`SYNC_PROVIDERS`, `serialize.ts`) güvenle atlanır (`lastSyncErrorCode=PROVIDER_SYNC_UNSUPPORTED`);
yeni sağlayıcı tracking kazandığında tek değişiklik yeri `SYNC_PROVIDERS` listesidir.

Env (hepsi boş bırakılabilir; boş değer varsayılana düşer, config yüklemesi çökmez):

- `SHIPMENT_SYNC_ENABLED` — varsayılan **false** (docker dev compose'da açık). Kapalıyken
  api-gateway başlangıçta `shipment sync worker disabled` loglar; döngü kurulmaz.
- `SHIPMENT_SYNC_INTERVAL_SECONDS` — tur aralığı (varsayılan 300, min 30).
- `SHIPMENT_SYNC_BATCH_SIZE` — tur başına en fazla gönderi (varsayılan 25).
- `SHIPMENT_SYNC_STALE_AFTER_MINUTES` — aynı gönderi en erken bu süre sonra yeniden senkronlanır (varsayılan 15).
- `SHIPMENT_SYNC_MAX_ATTEMPTS` — ardışık hata eşiği (varsayılan 10); eşiğe ulaşan gönderiyi
  worker seçmez, **manuel sync-all çalışmaya devam eder** ve başarılı sync sayacı sıfırlar.

Seçim kuralları: durum `ORDER_CREATED/LABEL_PENDING/LABEL_CREATED/IN_TRANSIT/OUT_FOR_DELIVERY/
DELIVERY_FAILED` (terminal DELIVERED/RETURNED/CANCELLED/FAILED asla), provider config ENABLED,
`nextSyncAt` (hata backoff'u) geçmiş ve son sync `stale-after`'dan eski. Durum yalnız sağlayıcı
kanıtıyla ilerler; asla geri gitmez. Tekrarlanan tur duplicate event üretmez (STATUS_CHANGED yalnız
gerçek değişimde; TRACKING_UPDATED doğal anahtarla dedupe).

**Kapatma:** `SHIPMENT_SYNC_ENABLED=false` (compose'da override) + api-gateway restart.
**Manuel tetik:** `POST /stores/:storeId/shipping/shipments/sync-all` (store-admin "Tümünü
Senkronla") — zamanlanmış worker'dan bağımsız her zaman çalışır ve stale/backoff filtrelerini atlar.

Güvenli runtime doğrulama: `docker compose logs api-gateway | grep "shipment sync"` ile
`worker started`/`cycle completed` özetleri izlenir (log yalnız id/store/provider/durum/hata kodu
içerir; secret/raw payload asla). Sağlayıcı HTTP'si `SHIPPING_SANDBOX_HTTP_ENABLED=false` iken
sync `SHIPPING_HTTP_DISABLED` koduyla güvenle backoff'lar; gerçek sorgu için bu bayrak +
credential gerekir.

## Barkod retry/backoff worker'ı (TODO-123)

Barkod oluşturma **geçici** bir sağlayıcı hatasıyla (timeout, 5xx, network, tanınmayan) düştüğünde,
sistem konservatif backoff ile otomatik yeniden dener. Hata **veri düzeltmesi gerektiriyorsa**
(varış şubesi/adres eşlemesi geçersiz) otomatik denenmez; admin düzeltmesi (TODO-124/TODO-139)
bekler. Çekirdek `apps/api-gateway/src/shipping/barcode-service.ts`'tedir ve **manuel "Barkod/Etiket
Oluştur" ile aynıdır** (drift olmaz); döngü `barcode-retry-worker.ts` (TODO-129 sync worker deseni).

**Sınıflandırma** (`lastBarcodeErrorCode` "ne oldu"; `barcodeRetryBlockedReason` "neden otomatik
denenmiyor" — AYRIDIR):

- **RETRYABLE** (transient): `SHIPPING_HTTP_TIMEOUT`, `BARCODE_PROVIDER_ERROR` (generic 5xx),
  `PROVIDER_NETWORK_ERROR` → backoff ile denenir. Limit dolunca `barcodeRetryBlockedReason=MAX_ATTEMPTS`.
- **DATA_FIX**: `DESTINATION_BRANCH_NOT_FOUND`, `ADDRESS_DISTRICT_CODE_REQUIRED`, `CBS_CODE_INVALID`,
  `RECIPIENT_EMAIL_*` → **otomatik denenmez**; admin adres/il-ilçe düzeltmesi bloğu kaldırır.
- **TERMINAL**: `AUTH_FAILED`, `SHIPPING_HTTP_DISABLED`, `BARCODE_CREATE_DISABLED` vb. → otomatik
  denenmez; manuel kontrol.

Env (hepsi boş bırakılabilir; boş değer varsayılana düşer, config yüklemesi çökmez):

- `BARCODE_RETRY_ENABLED` — varsayılan **false** (docker dev compose'da **açılmaz**; MNG sandbox'a
  düzenli otomatik çağrı üretmemek için). Kapalıyken api-gateway başlangıçta `barcode retry worker
  disabled` loglar; döngü kurulmaz. **Manuel retry worker kapalıyken de çalışır.**
- `BARCODE_RETRY_INTERVAL_SECONDS` — tur aralığı (varsayılan 300, min 30).
- `BARCODE_RETRY_BATCH_SIZE` — tur başına en fazla gönderi (varsayılan 10).
- `BARCODE_RETRY_STALE_AFTER_MINUTES` — üssel backoff tabanı: `stale·2^(deneme-1)`, 6 saatle sınırlı (varsayılan 15).
- `BARCODE_RETRY_MAX_ATTEMPTS` — ardışık transient hata eşiği (varsayılan 5); eşiğe ulaşan gönderiyi
  worker seçmez (`MAX_ATTEMPTS`), **manuel "Şimdi Tekrar Dene" çalışmaya devam eder**.

**Seçim kuralları:** durum `ORDER_CREATED`/`LABEL_PENDING` (kilitli `LABEL_CREATED`/`IN_TRANSIT`+ asla),
provider `DHL_ECOMMERCE` + ENABLED, `barcodeRetryBlockedReason` boş, `lastBarcodeErrorCode` dolu (transient),
`barcodeRetryCount < max`, `barcodeNextRetryAt ≤ now`. Durum yalnız barkod kanıtıyla ilerler; sahte başarı
yok; yeni gönderi açılmaz. `BARCODE_FAILED` event yalnız ilk hata / hata kodu değişimi / yeni blok nedeninde
yazılır (spam yok).

**Otomatik ne zaman:** yalnız transient hatada + backoff dolunca. **Admin düzeltmesi ne zaman:** DATA_FIX
blokunda — UI "Adres düzeltmesi gerekiyor" + varış onarım/adres düzenleme CTA'sı (TODO-124/139) gösterir.
Düzeltme `lastBarcodeErrorCode` + retry sayaç/backoff/blok alanlarını sıfırlar → deneme yeniden anlamlı.

**Manuel retry:** shipment detay → "Şimdi Tekrar Dene" (aynı `create-label` ucu). Backoff'u **bypass eder**
(admin açıkça tıkladı); ama DATA_FIX/TERMINAL blokunda veri düzeltilmediyse aynı hata döner.

**Açma (dev/prod):** compose `api-gateway` env'ine `BARCODE_RETRY_ENABLED=true` ekle + restart. Güvenli
runtime doğrulama: `docker compose logs api-gateway | grep "barcode retry"` (`worker started`/`cycle
completed`; log yalnız id/store/provider/durum/hata kodu; secret/raw payload asla).
**Kapatma:** `BARCODE_RETRY_ENABLED=false` (veya kaldır) + restart.

## CBS il/ilçe eşleme + "Varış şubesi bulunamadı" onarımı (TODO-124)

**Nasıl çalışır:** DHL/MNG prepare (createRecipient+createOrder) ve generic create-order,
sağlayıcı çağrısından ÖNCE alıcının il/ilçe metnini CBS Info listesine karşı çözer
(`apps/api-gateway/src/shipping/cbs-resolver.ts`). TR-güvenli normalize (tr-TR küçük harf +
diakritik katlama: İstanbul/ISTANBUL/uskudar/kucukcekmece aynı anahtar) ile **yalnız exact
match** yapılır; fuzzy/serbest-metin tahmini YOKTUR. Geçerli saklı kod (>0) aynen korunur;
0/geçersiz kod asla gönderilmez. CBS listeleri providerConfig başına 6 saat in-memory
cache'lenir (sağlayıcı aşırı çağrılmaz). CBS verisi varken il/ilçe eşleşmezse sağlayıcı
ÇAĞRILMADAN 422 `ADDRESS_DISTRICT_CODE_REQUIRED` döner ("Alıcı il/ilçe bilgisi kargo
firmasında eşleşmedi."); CBS'e ulaşılamıyorsa (HTTP kapalı/credential eksik) eski isim-bazlı
davranış sürer.

**"Varış şubesi bulunamadı" (MNG barkod 500 kod 20001) nasıl düzeltilir:**

1. Barkod denemesi `DESTINATION_BRANCH_NOT_FOUND` olarak sınıflandırılır: BARCODE_FAILED
   event + `Shipment.lastBarcodeErrorCode` yazılır; durum İLERLEMEZ, retry mümkün kalır.
2. Store-admin → Kargo Gönderileri → gönderi detayı → **"Varış İl/İlçe Eşlemesi"** kartı:
   mevcut il/ilçe, kargo il/ilçe kodları ve eşleşme rozeti görünür.
3. **"Adres İl/İlçe Eşlemesini Düzelt"** → CBS il/ilçe dropdown'larından doğru seçimi yapın
   ("CBS'den Eşleştir" mevcut adı otomatik ön-seçer). Kaydet: kodlar sunucuda CBS'e karşı
   yeniden doğrulanır, Shipment recipient SNAPSHOT'ı güncellenir (sipariş/müşteri adresi
   DEĞİŞMEZ) ve alıcı kaydı aynı referenceId ile sağlayıcıya yeniden iletilir.
4. **Barkodu yeniden deneyin:** "Barkod/Etiket Oluştur". Başarı `lastBarcodeErrorCode`'u sıfırlar.

**Sınırlama:** MNG'nin mevcut sipariş kaydında varış güncellemesini kabul ettiği garanti
değildir (`providerResent=false` dönerse yerel düzeltme korunur ve UI "Bu düzeltme mevcut
kargo kaydını otomatik güncellemeyebilir." uyarısını gösterir). Onarım+retry düzelmeyen eski
kayıtlar (ör. sandbox OS-000053/54/55) için yeni sipariş/gönderi gerekebilir; barkod öncesi
`cancelshipment` çağrılamaz (shipmentId yok). TODO-123 retry/backoff job'ı
`DESTINATION_BRANCH_NOT_FOUND` gönderileri admin düzeltmesine kadar retry ETMEMELİDİR.

## Sipariş teslimat adresini düzeltme (TODO-139)

Sipariş oluştuktan sonra teslimat adresi yanlış/eksikse, gönderi **henüz taşınmaya
başlamadan** admin adresi düzeltebilir. Bu **müşteri adres defterini DEĞİL**, yalnız bu
siparişin teslimat snapshot'ını (`OrderAddress` SHIPPING + varsa güvenli durumdaki `Shipment`
alıcı snapshot'ı) günceller.

**Nasıl:**

1. Store-admin → Siparişler → sipariş detayı → **Kargo** kartı → **"Teslimat Adresini
   Düzenle"**.
2. Ad/telefon/adres alanlarını düzeltin. DHL sağlayıcı bağlamı varsa il/ilçe **CBS
   dropdown'larından** seçilir ("CBS eşleşmesi bulundu/bulunamadı" + kargo il/ilçe kodları
   gösterilir). Kaydet: kodlar sunucuda CBS'e karşı **yeniden doğrulanır** (0/negatif asla
   kaydedilmez), Order snapshot ve (varsa) Shipment snapshot güncellenir, geçerli eşleşmede
   `lastBarcodeErrorCode` sıfırlanır ve DHL'de alıcı kaydı sağlayıcıya yeniden iletilmeye
   çalışılır.
3. Uygunsa **"Barkod/Etiket Oluştur"** ile barkodu yeniden deneyin.

**Adres ne zaman KİLİTLİDİR:** Aktif gönderi `LABEL_CREATED`, `IN_TRANSIT`,
`OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RETURNED` veya `CANCELLED` durumundaysa
düzenleme kapalıdır; uç 409 `SHIPMENT_ADDRESS_LOCKED` döner, UI "Kargoya verilmiş siparişlerde
adres değiştirilemez." gösterir. Düzenlenebilir durumlar: gönderi yok **veya** `DRAFT` /
`ORDER_CREATED` / `LABEL_PENDING`.

**`providerResent:false` ne demek:** Yerel snapshot güncellendi ancak kargo firmasının
mevcut kaydı otomatik güncellenemedi/desteklenmiyor (ör. DHL olmayan sağlayıcı, ya da sağlayıcı
reddi). Yerel düzeltme **korunur**; UI "Kargo firması üzerindeki kayıt güncellenemedi. Barkod
tekrar hata verirse yeni gönderi oluşturmak gerekebilir." uyarısını gösterir. Duplicate guard
bozulmaz — otomatik ikinci aktif gönderi açılmaz; gerekirse yeni gönderi manuel oluşturulur.
TODO-123 retry job'ı adres onarımından **sonra** (düzeltilmiş kodlarla) çalışmalıdır.

## Kampanyalar & Kuponlar (F4A / ADR-058)

**Merge sonrası dağıtım:** `api-gateway`, `storefront-web`, `store-admin-web` rebuild edilir; DB'ye
additive migration `20260705120000_add_campaigns_coupons` uygulanır (`prisma migrate deploy` — mevcut
veriye dokunmaz, RESET YOK). 7/7 container healthy doğrulanır.

**Smoke (TEST250 senaryosu):**
1. Store-admin `/campaigns` → yeni kampanya: tip "Kupon kodu", sabit ₺250, min sepet ₺1.000, toplam limit
   10, müşteri başına 1, kod `TEST250` → Oluştur → **Etkinleştir** (kampanyalar DRAFT doğar).
2. Storefront: ₺1.000 üzeri sepete `TEST250` uygula → indirim satırı + genel toplam düşer; kaldır → toplam
   eski haline döner. `BADCODE` → "geçerli bir kod değil"; min altı sepette → min tutar mesajı.
3. Checkout: kuponlu sipariş oluştur → sipariş toplamı sunucu hesabıyla eşleşir; DB'de `OrderDiscount`
   snapshot + `CampaignRedemption` (sipariş başına 1) doğrulanır; aynı e-posta ikinci denemede 409.
4. Kuponsuz checkout regresyonu birebir eski davranıştır (indirim satırı/redemption YAZILMAZ).

**Kurallar:** İndirim tutarı istemciden ASLA alınmaz; limitler sipariş transaction'ında atomik doğrulanır
(quote anındaki gösterim yalnız UX'tir). Kupon kodları mağaza-scoped'tur; başka mağazanın kuponu çözülmez.
ARCHIVED kampanya düzenlenemez (terminal). Sipariş iptal/refund edilse bile redemption kaydı TARİHSEL kalır
(kompanzasyon yok — ADR-058); limiti dolmuş bir kampanyayı yeniden açmak için limiti artırın ya da yeni
kampanya tanımlayın.

**Kampanya analitiği nasıl okunur (F4A.2 / ADR-059):** Kampanya detayındaki sayılar sipariş anındaki
immutable kayıtlardan (OrderDiscount + CampaignRedemption) hesaplanır; kampanya sonradan düzenlense/
arşivlense bile geçmiş rakamlar DEĞİŞMEZ. "İndirim öncesi ciro" = kullanımlı siparişlerin ara toplam
(subtotal) toplamı; "indirim sonrası ciro (tahsil)" = aynı siparişlerin genel toplamı (kargo dahil).
İptal/iade edilen siparişlerin kullanımları tarihsel olarak DAHİLDİR (kompanzasyon yok); net-ciro
beklentisiyle karşılaştırırken bunu dikkate alın. Tekil müşteri, customerId (yoksa e-posta) üzerinden
tekilleştirilir; misafir siparişlerinde e-posta değişirse aynı kişi birden fazla sayılabilir. Vitrin
rozetleri yalnız ACTIVE + herkese açık (isPublic) + penceresi açık + limiti dolmamış kampanyaları
gösterir; rozet görünmüyorsa önce bu dört koşulu kontrol edin.

## Vitrin kampanya gösterimi + kupon cüzdanı (F4A.3 / ADR-060)

**Merge sonrası dağıtım:** `api-gateway`, `storefront-web`, `store-admin-web` rebuild edilir; additive
migration `20260705130000_add_customer_coupon_wallet` uygulanır (`prisma migrate deploy` — mevcut veriye
dokunmaz, RESET YOK). 7/7 container healthy doğrulanır.

**Otomatik kampanya vs kupon kampanyası (vitrin gösterimi):**
- **Otomatik sepet indirimi** (AUTOMATIC_CART / PRODUCT_DISCOUNT / CATEGORY_DISCOUNT): ürün kartında
  "Sepette %10", ürün detayında "Sepette %10 indirim" + **"Kod gerekmez"** + varsa "₺1.000 üzeri geçerli".
  Sepet/checkout'ta otomatik indirim satırı olarak uygulanır. Kod ASLA gösterilmez.
- **Public kupon** (COUPON_CODE + `isPublic=true`): ürün kartında "Kuponlu ürün"; ürün detayında KUPON
  KARTI (indirim tutarı, alt limit, son kullanma, **kupon kodu**, "Kuponu ekle"/"Kodu kopyala"). Sepette
  "Kuponlar" alanında kart olarak görünür (Kullan / Uygulandı / Alt limit eksik).

**Public vs private kupon:**
- **Public** (`isPublic=true`): ürün/sepet ekranlarında keşfedilir; kodu güvenle gösterilir (kupon ACTIVE
  ve penceresi geçerliyse). Herkes claim edip kullanabilir.
- **Private** (`isPublic=false`): hiçbir public yüzeyde GÖRÜNMEZ (kart/detay/sepet adayları). Yalnızca
  kodu bilen müşteri "Kupon Kodu Ekle" ile tanımlayabilir ya da store-admin belirli bir müşteriye/e-postaya
  atayabilir. İç kimlik/priority/stackable/usage/limit/redemption public gövdeye ASLA taşınmaz.

**Birden çok rozet önceliği:** Ürün başına TEK rozet gösterilir. Seçim deterministiktir: önce `priority`
DESC, sonra kampanya id ASC (indirim tutarı sepete bağlı olduğundan rozet seçiminde karşılaştırılmaz).
Kampanya rozeti, `compareAt` (indirimli fiyat) rozetine göre önceliklidir.

**İki adımlı kupon akışı (cüzdan):** "Kupon Kodu Ekle" kodu DOĞRULAR (ACTIVE + pencere + limit) ve
uygunsa "Kuponlar" alanına EKLER (claim); uygun değilse güvenli negatif metin gösterir. Alt limit/kapsam
claim'i reddetmez — kart "Alt limit eksik" durumuyla görünür. Uygulama AYRI adımdır: kart üzerindeki
"Kullan" → APPLIED (sepette couponCode olarak uygulanır); "Kaldır" → AVAILABLE (kart cüzdanda kalır);
başarılı sipariş → USED. İndirim tutarı yine sunucu motorundan gelir (ADR-058); istemci APPLIED durumuna
GÜVENİLMEZ. MVP: sepet başına tek APPLIED kupon.

**Store-admin kupon atama:** İki yerden yapılır, AYNI backend servisini kullanır:
- Kampanya detayı → "Müşteriye kupon ata" (kupon seç + e-posta gir) + atama listesi (durum/kaynak/tarih).
- Müşteri detayı → "Müşteri Kuponları" (kupon seç + ata) + cüzdan geçmişi.
Cross-store atama reddedilir; e-posta listede MASKELİ gösterilir; private kuponu atama PUBLIC YAPMAZ.

**Smoke (F4A.3):** (1) Otomatik "Sepette %10": kart "Sepette %10", detay "Kod gerekmez", sepet/checkout
otomatik indirim satırı. (2) TEST250 public kupon: detayda kupon kartı+kod, sepette "Kuponlar" kartı,
"Kupon Kodu Ekle" ile claim → "Kullan" uygular. (3) Private kupon: üründe/kartta/adaylarda görünmez,
kod ile claim çalışır. (4) BADCODE: güvenli hata; otomatik kampanya indirim satırı korunur. (5) Public
payload: iç id/priority/usage/stackable/limit/redemption YOK. (6) Admin: iki ekrandan atama; atanan kupon
yalnız o müşteride görünür.

**Sınırlamalar:** Misafir sepetinde kalıcı müşteri kimliği olmadığından misafire ATANAN kupon, checkout
e-postası girilene kadar görünmez; misafir kod-claim'i sepet cookie'sinde (`claimedCodes`) yaşar.

## Kupon merkezi — "Kuponlarım / Tüm Kuponlar" (F4A.5 / ADR-060 devamı)

**Migration YOK.** F4A.5 yalnızca okuma uçu + UI ekler; şema değişmez. Merge sonrası rebuild edilecekler:
`api-gateway` (yeni uç) + `storefront-web` (sayfa). `store-admin-web` etkilenmez.

**Rota ve erişim.** Kupon merkezi mevcut hesap konvansiyonundadır: **`/account?section=coupons`** (sol
menü ve header hesap dropdown'ından ulaşılır). **Oturum zorunludur**; misafir bu sayfaya girerse mevcut
hesap davranışıyla `/auth/login?next=/account`'a yönlendirilir (F4A.5 ayrı bir misafir kupon merkezi
AÇMAZ). Sepetteki "Kuponlar" alanına eklenen **"Tüm Kuponlar"** bağlantısı da bu sayfaya gider; müşteri
oturum açmamışsa aynı login redirect'i devreye girer (dead link yok).

**Uç.** `GET /public/stores/:slug/customer/coupons` — müşteri-scoped (`x-customer-session` zorunlu; yoksa
401) + store-scoped. SEPET-BAĞIMSIZDIR (kupon merkezi listelemesi için sepet gerekmez).

**Görünürlük — hangi kupon nerede çıkar:**
- **Public** (COUPON_CODE + `isPublic=true`, ACTIVE, pencere geçerli, toplam limit dolmamış): "Kullanılabilir"
  ve "Tüm Kuponlar"da görünür (kaynak "Herkese açık").
- **Atanmış** (store-admin bu müşteriye/e-postaya atadı): "Sana Özel" + "Kullanılabilir"de; kullanılınca
  "Kullanıldı"da (kaynak "Sana özel").
- **Kod ile eklenmiş** (müşteri sepet veya bu sayfadaki "Kupon Kodu Ekle" ile claim etti): eklendikten
  sonra listede görünür (kaynak "Kod ile eklendi").
- **Private** (`isPublic=false`): public listede ASLA çıkmaz; yalnızca atanmış veya bu müşteri/e-posta
  tarafından claim edilmiş/kullanılmışsa görünür.
- **Kullanıldı**: yalnızca bu müşteri/e-postanın KENDİ kullandığı kuponlar; kullanım tarihi + kendi sipariş
  numarası (sipariş detayına link) gösterilir. Başka müşterinin kullanımı SIZMAZ.

**Sepet-bağımsızlık.** Merkez alt limit "eksik" (MIN_ORDER_NOT_MET) HESAPLAMAZ — kartlar Kullanılabilir ya
da Süresi doldu olur; alt limit yalnız bilgi olarak yazılır. Uygulanan kupon ("Uygulandı") sepet
`couponCode` cookie'sinden işaretlenir (kaynak doğrusu). "Kullan" mevcut sepet apply akışını çağırır;
indirim tutarı İSTEMCİDE hesaplanmaz, checkout'ta motor yeniden doğrular. Bir kod bir kez kullanıldıysa
"Kullanılabilir"den düşer, yalnız "Kullanıldı"da görünür.

**Public payload güvenliği.** Yanıt allowlist'tir: iç kampanya/kupon id, priority, stackable, usageCount,
limitler, redemption iç verisi ve başka müşterilerin atamaları SIZMAZ. Kod yalnız public/atanmış/claim
edilmiş + güvenli olduğunda gösterilir.

**Smoke (F4A.5):** (1) Oturum açmış müşteride `/account?section=coupons` yüklenir, başlık "Kuponlarım".
(2) TEST250 public kupon "Kullanılabilir"de. (3) Belirli müşteriye atanan kupon yalnız o müşteride "Sana
Özel"de. (4) Private kupon kod-claim'den önce görünmez; "Kupon Kodu Ekle" ile eklenince kart çıkar. (5)
"Kullan" uygular → "Uygulandı" + "Sepete Git". (6) Kupon uygulanmış siparişten sonra kupon "Kullanıldı"da
(tarih + sipariş linki). (7) Sepetteki "Tüm Kuponlar" linki sayfaya gider. (8) Yanıtta iç alan yok.

**Sınırlamalar (F4A.5):** Kategori çip filtresi henüz yok (kampanya `categoryIds` mevcut ama kategori-ad
çözümlemesi + kod tarafı kapsam eşleşmesi ayrı iş — sekme/arama önce yapıldı, kategori follow-up). Misafir
kupon merkezi yok (oturum zorunlu). Çok-kullanımlı public kupon bir kez kullanıldığında "Kullanılabilir"den
düşer (MVP kabulü).
