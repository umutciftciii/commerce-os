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

## Search kampanya snapshot + reconciliation (TODO-155.2)

Search read-model (`ProductSearchDocument`) F4A **kampanya rozeti** snapshot'ı taşır (`campaign` jsonb +
`campaignStartsAt/EndsAt`) — PDP ile AYNI "tek formül" (ADR-062). Deploy sonrası (additive migration
`20260719140000_add_search_campaign_snapshot`) mevcut dokümanlar snapshot'sızdır; **backfill/reindex ile
dolar**: `pnpm --filter @commerce-os/search-service search:backfill --store <id>` (veya `--all`).

**Lifecycle:** kampanya create/update/activate/pause/archive → otomatik `reindexStore` (search-index kuyruğu;
fire-and-forget). Mutasyonsuz zaman-sınırı geçişleri (gelecek-başlangıçlı kampanya aktifleşmesi / süre dolması)
için **reconciliation sweep** — varsayılan **KAPALI**:
- `CAMPAIGN_RECONCILE_ENABLED` (false; açılınca api-gateway süreci içinde düşük frekansla çalışır),
  `CAMPAIGN_RECONCILE_INTERVAL_SECONDS` (3600), `CAMPAIGN_RECONCILE_BATCH_SIZE` (200).
- Sweep enqueue-only + idempotent: (a) süresi geçmiş snapshot'lı ürünleri (b) yeni açılan kampanya
  mağazalarını reindex kuyruğuna alır. In-process/tek-instance (çoklu replica'da çift-tarama zararsız).
- **Read-time bastırma** zaten stale badge'i gizler (`campaignStartsAt/EndsAt` penceresi `now`'a göre geçersizse
  rozet dönmez) → sweep gecikse bile kullanıcı yanlış görmez.

**Doğrulama:** `docker compose logs api-gateway | grep "campaign reconcile"` (`worker disabled` / `worker started`
/ `cycle completed`). Snapshot kontrolü: `GET /public/stores/:slug/search` yanıtında `products[].campaign`
(süresi geçmişse null); iç campaign id/limit/priority/stackable **sızmaz** (allowlist). **checkout nihai fiyat
otoritesidir; PLP kampanya fiyatı bilgilendirici tahmindir.**

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

## Kampanya/kupon sunum alanları + erişim modeli (F4A.4 / ADR-061)

**Merge sonrası dağıtım:** additive migration `20260705140000_add_campaign_presentation_fields`
(`prisma migrate deploy` — mevcut veriye dokunmaz, RESET YOK; mevcut kampanyalar null/varsayılan
değerlerle çalışır, backfill gerekmez). Rebuild: `api-gateway` + `store-admin-web` + `storefront-web`.
7/7 container healthy doğrulanır.

**Sunum ≠ hesaplama (temel kural).** Yeni alanlar YALNIZCA görünümdür ve indirim motorunu ETKİLEMEZ.
İndirim motoru yalnız doğrulanmış kural alanlarını kullanır (type/discountType/discountValue/
maxDiscount/minOrder/pencere/limitler/kapsam/isPublic/stackable/priority). Sunum alanları:
`displayTitle`, `shortDescription`, `terms`, `badgeLabel`, `badgeVariant`, `cardStyle`, `displayPriority`.

**Public/private gösterim alanları.** Sunum alanları DB'de/admin'de her kampanyada bulunabilir; ancak
public projeksiyona YALNIZCA `isPublic=true` kampanyalar için (ürün rozeti) veya müşterinin cüzdanına
girmiş (atanmış/claim edilmiş) kuponlar için (sepet/kupon merkezi) taşınır. Private (CODE_CLAIMED/
ADMIN_ASSIGNED → `isPublic=false`) kuponların sunum alanları hiçbir public listede claim/atama olmadan
GÖRÜNMEZ. Sunum alanları allowlist'in parçasıdır; iç kimlik/limit/priority/stackable yine sızmaz.

**Erişim/edinme modelleri (`accessModel`).** Admin tek bir seçici ile belirler; `isPublic` bundan
TÜRETİLİR (authoritative gate) ve admin'e ayrı input olarak gösterilmez:
- **AUTO_VISIBLE** (otomatik sepette indirim) → `isPublic=true`. Kod/claim gerekmez; "Sepette …" olarak
  otomatik uygulanır. Otomatik kampanya tiplerinde tek geçerli modeldir.
- **PUBLIC_CLAIMABLE** (herkese açık kupon) → `isPublic=true`. Ürün/sepet/kupon merkezinde listelenir;
  mevcut cüzdan akışıyla claim/kullan edilir.
- **CODE_CLAIMED** (kod ile kazanılan özel kupon) → `isPublic=false`. Public listelenmez; müşteri kodu
  "Kupon Kodu Ekle" ile doğrulatıp cüzdanına ekler.
- **ADMIN_ASSIGNED** (müşteriye atanan kupon) → `isPublic=false`. Store-admin belirli müşteriye/e-postaya
  atar; yalnız o müşterinin cüzdan/sepet/kupon merkezinde görünür.

**Rozet etiketleri / kart görünümleri.** `badgeVariant` ∈ {DEFAULT, SUPER, LIMITED_TIME, PERSONAL,
WEEKEND, NEW_CUSTOMER}; `cardStyle` ∈ {STANDARD, FEATURED, PERSONAL}. `badgeLabel` serbest metin kart
etiketidir (örn. "Süper Kupon", "Sana Özel"). Vitrin, `badgeLabel` varsa onu; yoksa kaynak-temelli
varsayılan rozeti gösterir. `displayTitle` yoksa üretilmiş etiket ("₺100 kupon" / "Sepette %10 indirim")
kullanılır; `terms` yoksa "Detaylar" gösterilmez.

**Reserved (henüz yok).** İlk sipariş / geri dönen müşteri / e-posta listesi gibi segment kriterleri motor
tarafından ENFORCE EDİLEMEDİĞİ için ne enum'a ne forma eklenmiştir (aktif davranış üretmez). İleride
enforcement eklenirse ayrı iş olarak değerlendirilecektir.

**Takip tabanlı kupon YOKTUR.** "Takip et kazan" / store-follow / seller-follow / marketplace-follow
mantığı bilinçli olarak hiçbir enum, UI kopyası, doküman maddesi veya testte yer almaz — bu ürün
marketplace değildir.

**Store-admin formu.** `/campaigns` formu 6 bölümdür: (1) Görünüm/Kupon Kartı, (2) İndirim Kuralı,
(3) Geçerlilik (bitişten türetilmiş "Bugün bitiyor / Son 3 Gün" önizleme etiketi), (4) Erişim/Kitle
(yalnız 4 desteklenen model; kupon tipinde 3 claim modeli), (5) Kapsam (tüm ürünler / seçili kategori /
seçili ürün — marka/vendor scope YOK, first-class model olmadığı için follow-up), (6) Önizleme (kupon
kartı görünüm önizlemesi; GERÇEK indirim hesabı YAPMAZ). Doğrulama: displayTitle ≤120, shortDescription
≤240, badgeLabel ≤40, terms ≤2000.

**Smoke (F4A.4):** (1) Kupon oluştur: başlık "Hafta sonu 500 TL'ye 100 TL kupon", etiket "Süper Kupon"
(SUPER), min ₺500, indirim ₺100, geçerlilik aralığı, detay metni, erişim herkese açık → form kaydeder.
(2) Store-admin önizleme kartı başlık/etiket/alt limit/geçerlilik gösterir. (3) Vitrin ürün/sepet/kupon
merkezi kartı başlığı/rozeti/alt limiti/geçerliliği/"Detaylar"ı güvenle gösterir. (4) "Takip et kazan"
hiçbir yerde yok. (5) Kupon yine cüzdan/sepet/kupon merkezi akışıyla claim/kullan edilir. (6) Checkout
toplamı + OrderDiscount snapshot değişmez. (7) Private kuponun sunum alanları public'te sızmaz.
(8) TEST250 ve otomatik sepet kampanyası eskisi gibi çalışır.

**Sınırlamalar (F4A.4):** Marka/vendor kapsamı yok (`Product.brand`/`Product.vendor` serbest metin;
first-class model değil — icat edilmedi, follow-up). Reserved segmentler pasif. Coupon-seviyesi sunum
alanı eklenmedi (campaign-seviyesi yeterli). Sunum alanları OrderDiscount snapshot'ına yazılmaz
(görünüm; sipariş etiketi mevcut label mantığından gelir).

## Ürün kartı "Sepette" fiyat gösterimi + smoke/stale kampanya denetimi (F4A.6 / ADR-062)

**Migration YOK.** F4A.6 yalnız additive public DTO alanları + projeksiyon/UI ekler; DB şeması değişmez.
Merge sonrası rebuild edilecekler: **api-gateway** (rozet projeksiyonu değişti) + **storefront-web** (kart/
detay UI + tipler). store-admin etkilenmez.

**Kart "Sepette" fiyat kuralı — nihai fiyat NE ZAMAN gösterilir?** Ürün kartında (ve detayda) otomatik sepet
indiriminin güvenli birim nihai fiyatı SADECE şu koşullarda gösterilir:
- kampanya `AUTOMATIC_CART_DISCOUNT` (kod gerektirmeden uygulanır) VE
- indirim tipi `PERCENT` (sabit tutarlı sepet indirimi tek birime güvenle bölünemez → gösterilmez) VE
- ürün TEK-FIYATLI (görünür varyant fiyatları eşit; fiyat aralığında tekil nihai fiyat gösterilmez) VE
- `minOrder` yok ya da birim fiyat bu eşiği tek başına karşılıyor.
Bunların biri sağlanmazsa nihai fiyat **gösterilmez**; kart yalnız "Sepette %X" rozeti + (varsa) "₺X üzeri"
alt-limit notu gösterir. **Sahte/garanti olmayan nihai fiyat asla üretilmez.** Tahmin gateway'de motorun
formülüyle (round(unit*yüzde), maxDiscount cap) hesaplanır; checkout yine tek kaynak-doğrusudur.

**Kupon vs otomatik ayrımı.** Public kupon kampanyaları kartta "Kuponlu ürün" olarak kalır (kod gerekir
izlenimi); otomatik "Sepette" fiyat bloğuna DÖNÜŞMEZ. `displayKind` kampanyanın `type`'ından türetilir —
`accessModel` default'u (AUTO_VISIBLE) bunu ETKİLEMEZ.

**Stackable-duyarlı gösterim.** Bir ürüne uygulanan tüm uygun kampanyalar `stackable` ise otomatik "Sepette"
birincil + public kupon ikincil çip BİRLİKTE görünür. En az biri non-stackable ise (checkout'ta diğerlerini
bloklar) yalnız öncelik kazananı (priority DESC, id ASC) görünür.

**accessModel default denetim notu (legacy kampanyalar).** F4A.4 migration'ı mevcut kampanyalara
`accessModel=AUTO_VISIBLE` verdi. Bu KOZMETİKTİR: rozet projeksiyonu `displayKind`'i `type === COUPON_CODE`
kontrolünden türetir, accessModel'den değil. Yani bir kupon-kodu kampanyası, AUTO_VISIBLE olsa bile "Kuponlu
ürün" (PUBLIC_COUPON) olarak kalır; otomatik "Sepette" indirimine dönüşmez. Şüphede kalınırsa DB'de
`SELECT id,name,type,"accessModel","isPublic",status FROM "Campaign" WHERE status='ACTIVE';` ile denetleyin.

**Smoke/test kampanya temizlik prosedürü (GÜVENLİ).** Vitrin sahte/eski bir indirim gösteriyorsa önce
DENETLE, sonra en az müdahaleyle düzelt:
1. Aktif kampanyaları listele (mağaza-scoped):
   `docker exec docker-postgres-1 psql -U commerce_os -d commerce_os -c "SELECT c.id,c.name,c.type,c.status,c.\"isPublic\",c.priority,c.\"storeId\",s.slug FROM \"Campaign\" c JOIN \"Store\" s ON s.id=c.\"storeId\" WHERE c.status='ACTIVE' ORDER BY c.\"createdAt\";"`
2. Storefront'un hangi mağazayı çektiğini doğrula (`STOREFRONT_DEMO_STORE_SLUG`, default `demo-store`); yalnız
   o mağazanın ACTIVE+public kampanyaları vitrini etkiler.
3. "İndirim gibi görünen" bir kampanya DEĞİL de varyant `compareAtMinor > priceMinor` (liste/satış farkı)
   olabilir: `SELECT p.slug,v."priceMinor",v."compareAtMinor" FROM "ProductVariant" v JOIN "Product" p ON p.id=v."productId" WHERE p."storeId"=<demo>;` — bu bir mock artığıdır, kampanya değildir.
4. **Silme YOK.** Yalnızca açıkça smoke/test/demo olduğu DOĞRULANMIŞ kampanyalar için ARCHIVED (kalıcı) veya
   PAUSED (geri açılabilir) kullan. Kullanıcı-oluşturduğu gerçek kampanyayı KAPATMA. Şüphede ise mutasyon
   yapma, adayları raporla. DB reset / seed-over-runtime / volume silme YASAK.

**F4A.6 runtime denetim özeti (2026-07-05).** demo-store: `TEST250` (public kupon, priority 1, global —
bilinçli aktif, KALIR) + `Sepette %10` (otomatik, 2 ürün kapsamı); ikisi de non-stackable → kartta TEST250
kazanır (kural gereği doğru). Gördüğünüz demo-hoodie "indirimi" varyant compareAt (₺1.299/₺1.499) mock
artığıdır → maliyet/marj + liste fiyatı + fiyat audit'i (son 30 gün en düşük fiyat) **F4B** olarak ayrıldı.
`f4a-smoke-test-store` üstündeki artık smoke kampanyalar bırakıldı (demo storefront'u etkilemez).

## Varyant KDV + ürün kartı fiyatı + sipariş satış özeti (F4C / ADR-063, ADR-064)

- **Kart fiyat kuralı.** Vitrin ürün kartı fiyat ARALIĞI göstermez; en ucuz AKTİF görünür varyantın KDV
  dahil fiyatı gösterilir. Otomatik kampanya "Sepette" tahmini de aynı en-ucuz tabandan hesaplanır. Ürün
  detayı varyant fiyatlarını ayrı ayrı göstermeye devam eder.
- **Kaydet CTA davranışı.** Ürün/varyant formlarında kaydetme durumu başarıda VE hatada sıfırlanır
  (finally); kaydetme sırasında buton disabled (double-submit yok). "Kaydediliyor…"da takılı buton görürsen
  F4C öncesi build çalışıyordur.
- **KDV semantiği (ADR-063).** Admin varyantta KDV HARİÇ net fiyat + oran girer (bps: 2000=%20, 1000=%10,
  100=%1, 0=%0). Sunucu hesaplar: `vat = round(net·bps/10000)`, `brüt = net + vat` → `priceMinor` KDV DAHİL
  brüt satış fiyatıdır ve vitrin/sepet/checkout HEP brüt gösterir. Legacy istemci yalnız brüt gönderirse
  `net = round(brüt·10000/(10000+bps))` ile ayrıştırılır (brüt korunur). Yalnız oran değişirse net sabit
  kalır, brüt yeniden hesaplanır. İstemcinin KDV tutarı ASLA kabul edilmez. Maliyet tavanı brüt üzerinden:
  cost ≤ (compareAt ?? brüt). Float para matematiği YASAK (tam sayı minor + tek Math.round).
- **Migration/backfill.** `20260706120000_add_variant_vat_and_order_snapshots` additive'dir; varyant
  backfill'i brütü KORUR (görünen fiyat değişmez). OrderLine backfill'i bilinçli YOKTUR — eski siparişler
  legacy kalır. Uygulama: `pnpm db:migrate` (reset/seed YOK).
- **Sipariş snapshot kuralı (ADR-064).** createOrder/addOrderLine sipariş ANINDA satır başına net/oran/KDV/
  brüt/liste(compareAt ?? brüt)/maliyet snapshot'ı yazar; adet güncellemesi satır toplamlarını BİRİM
  snapshot'tan türetir. Satış özeti (`Order.salesSummary`) her zaman snapshot'lardan türetilir; güncel ürün
  fiyat/maliyeti siparişi ETKİLEMEZ.
- **Satış özeti okuma.** Bölüm A her siparişte dolu (ara toplam/indirim+etiket/kargo/ödenmesi gereken/
  net ödenen/kalan). Bölüm B yalnız F4C sonrası siparişlerde; eski siparişte "Bu sipariş eski formatta
  oluşturuldu" bilgisi normaldir (bug değil). Maliyet snapshot'sız satır varsa Maliyet/Brüt kâr/Net kâr "—"
  gösterilir. İndirim KDV dağılımı MVP: Bölüm B indirim ÖNCESİ net/KDV gösterir; Net kâr = Brüt kâr −
  brüt kampanya indirimi (deterministik, ADR-064).
- **Bilinen sınır.** Sepet/checkout'taki "KDV (dahil)" bilgi satırı hâlâ %20 sabit çıkarımdır (toplamları
  etkilemez); karma oranlı mağazada satır oranlarından türetme follow-up'tır. Fatura ÜRETİMİ bu fazda yok;
  alanlar hazırdır.

## Felaket kurtarma (DR): gerçek backup/restore — PB-2/PB-3

> **Gerçek DB felaket kurtarma** (şifreli + offsite + doğrulanmış restore) ayrı bir runbook'tadır:
> **`docs/runbooks/database-backup-restore.md`** (ADR-159…166). Komutlar: `pnpm db:backup:run` (encrypt+offsite),
> `pnpm db:restore` (gerçek restore), `pnpm db:verify-restore` (izole doğrulama), `pnpm db:backup:retention`,
> `./infra/scripts/dr-smoke.zsh` (uçtan uca izole DR tatbikatı). **PB-2 CLOSED; PB-3 production offsite
> yapılandırması bekliyor (TD-139).**
>
> Aşağıdaki bölüm **demo veri** güvenliği içindir (gerçek DR DEĞİL). `db:restore-enterprise` gerçek restore değil,
> demo re-seed'dir → **`db:reseed-enterprise`** olarak yeniden adlandırıldı (eski ad deprecation köprüsü; ADR-166).

## Demo veri güvenliği: backup, güvenli reset & recovery (TODO-159G / ADR-108)

**Neden.** 2026-07-23'te elle `prisma db push` çalışan yerel DB'yi sıfırladı ve enterprise-demo
kataloğu (471 ürün) silindi (TD-116). Aşağıdaki guard'lar + akış tekrarını engeller.

### Kural (ÖNCE OKU)
- `prisma db push`, `prisma migrate reset`, `docker volume rm` **YASAK** (migrasyon = `prisma migrate deploy`).
- Enterprise seed'in yıkıcı `wipeScope`'u artık guard'lıdır (ADR-108): prod-benzeri `DATABASE_URL`,
  yanlış store scope veya flag'siz toplu silme → **hard fail**.

### Reset öncesi zorunlu yedek (backup guard)
```bash
pnpm db:backup                 # infra/backups/commerce_os-manual-<stamp>.sql.gz (gitignored)
pnpm db:backup pre-reset       # etiketli
```

### Enterprise-demo kataloğunu güvenli geri yükle
```bash
# Tek komut: yedek al → seed → search backfill → invariant doğrula
pnpm db:reseed-enterprise

# Dolu bir kataloğu bilinçli EZMEK gerekiyorsa (circuit breaker > 10 ürün):
ALLOW_DESTRUCTIVE_DEMO_RESET=true pnpm db:seed-enterprise && pnpm db:backfill-enterprise
```
> `db:seed-enterprise` search projeksiyonunu SİLER ama yeniden yazMAZ — reset sonrası
> `db:backfill-enterprise` ZORUNLU (aksi halde PLP/facet/autocomplete boş döner).

### Guard davranışı (ADR-108 · `packages/db/scripts/enterprise/safety.mjs`)
| Durum | Sonuç |
|---|---|
| İlk seed (0 ürün) | Sürtünmesiz çalışır |
| Dolu katalog (>10 ürün), flag YOK | **DURUR** — `ALLOW_DESTRUCTIVE_DEMO_RESET=true` iste |
| `DATABASE_URL` prod/staging/RDS/Neon… | **REDDEDİLİR** (flag'e rağmen) |
| Host allowlist dışı (localhost bile tek başına yetmez) | **REDDEDİLİR** — `ALLOW_DEMO_SEED_ON_ANY_DB=true` ile bilinçli override |
| Yanlış store scope (demo-store vb.) | **REDDEDİLİR** |
| Order/Customer/Payment/Review/Wishlist | `wipeScope` ASLA dokunmaz (statik-invariant testli) |

> Guard'lar api-gateway imajına baked kaynaktan koşar → `safety.mjs`/`persist.mjs` değişince
> `docker compose -f infra/docker/docker-compose.yml build api-gateway` gerekir (TD-116-b).

## `_prisma_migrations` baseline operasyonu (TODO-159G Faz B, 2026-07-24)

Veri kaybı olayından (TD-116) sonra yerel DB `db push`-kurulu olduğundan `_prisma_migrations`
taşımıyordu. Hotfix (PR #115) merge+deploy edildikten SONRA, **reset/push/drop KULLANILMADAN**
migration geçmişi baseline edildi:

```bash
# 1) ZORUNLU: tam custom-format backup + doğrulama
docker exec docker-postgres-1 pg_dump -U commerce_os -d commerce_os -Fc > pre-baseline.dump
docker exec -i docker-postgres-1 pg_restore --list < pre-baseline.dump   # TOC != 0 doğrula

# 2) DB'nin migration geçmişiyle birebir olduğunu KANITLA (shadow DB'de replay + diff)
pnpm exec prisma migrate diff \
  --from-migrations packages/db/prisma/migrations \
  --to-url "$LIVE_DB_URL" --shadow-database-url "$SHADOW_DB_URL" --exit-code
#   → "No difference detected" GÖRMEDEN devam etme.

# 3) Her migration'ı applied işaretle (DDL/veri DEĞİŞMEZ; sadece _prisma_migrations'a kayıt)
for d in $(ls packages/db/prisma/migrations | grep -E '^[0-9]' | sort); do
  pnpm exec prisma migrate resolve --applied "$d" --schema packages/db/prisma/schema.prisma
done

# 4) Doğrula
pnpm exec prisma migrate status   # hedef: "Database schema is up to date!"
```

**Sonuç (2026-07-24):** 51/51 applied, 0 rolled-back, `migrate status` = "up to date", veri
sayıları birebir korundu (verify-enterprise 21/21, storefront smoke PASS). TD-116-a KAPANDI.

> **schema.prisma vs DB "drift" NORMALDİR:** `migrate diff --from-database --to-schema-datamodel`,
> `ProductSearchDocument.searchVector` (tsvector GENERATED + GIN index) farkını gösterir. Bu, ham-SQL
> migration `20260719120000_add_search_read_model`'in eklediği ve Prisma datamodel'in ifade edemediği
> bir artefakttır; her doğru migrate edilmiş DB'de (production dahil) vardır. Bozulma DEĞİLDİR.

## KALICI OPERASYON KURALI — destructive DB komutları YASAK

`prisma db push` (özellikle `--force-reset` / `--accept-data-loss`), `prisma migrate reset`,
`docker volume rm <postgres>` ve elle `DROP DATABASE/SCHEMA/TABLE` **her ortamda YASAKTIR.**
Şema değişikliği yalnız `prisma migrate dev` (üret) → `prisma migrate deploy` (uygula) ile yapılır.
Yerel dev'de dahi enterprise-demo kataloğunu yeniden kurmak gerekiyorsa: `pnpm db:reseed-enterprise`
(backup→seed→backfill→verify) kullan; seed guard'ları (ADR-108) yıkıcı yolu zaten fail-safe kılar.
Bu kural TD-116 (2026-07-23 veri kaybı) sonrası kalıcıdır.

## SKU governance — audit & backfill (TODO-160A / ADR-109…113)

SKU'lar varyant-seviyesi tek otoritedir, mağaza içinde benzersizdir (`@@unique([storeId, sku])`) ve
deterministik üretilir. Aşağıdaki komutlar operasyonel governance içindir. **OrderLine snapshot'larına
ASLA dokunmazlar.**

**Audit (salt-okuma):** boş/duplicate/geçersiz/aşırı-uzun/opak/barcode-eşit SKU'ları raporlar + öneri
üretir. Hiçbir yazma yapmaz.

```bash
# Docker (deploy sonrası; kod container'da olmalı):
pnpm db:audit-sku -- --store=edm-store --json
# Host (worktree/dev; DATABASE_URL host postgres'e):
cd packages/db && DATABASE_URL=postgresql://commerce_os:commerce_os_password@127.0.0.1:5432/commerce_os \
  node scripts/audit-sku.mjs --store=edm-store --json
```

**Backfill (VARSAYILAN DRY-RUN; yıkıcı değil):** yalnız BOŞ (veya `--include-opaque` ile opak `V-…`)
SKU'ları deterministik doldurur; **geçerli SKU'lara dokunmaz**. Kurallar (ADR-113):

- `--apply` için `--store=<id>` ZORUNLU.
- Aday sayısı `--max-rows` (default 1000) aşarsa `--force` gerekir (circuit breaker).
- Her yazma `skuSource=AUTO` + AuditLog (`SYSTEM`, field-level old/new). `--actor=<platformUserId>` gerçek
  bir kullanıcı olmalı (aksi halde AuditLog FK ihlali; boş bırakılırsa `null`).
- Gerçek yazma öncesi: `pnpm db:backup pre-sku-backfill`.

```bash
node scripts/backfill-sku.mjs --store=edm-store                    # dry-run (varsayılan)
node scripts/backfill-sku.mjs --store=edm-store --include-opaque   # dry-run, opak dahil
pnpm db:backup pre-sku-backfill
node scripts/backfill-sku.mjs --store=edm-store --apply            # GERÇEK yazma (yalnız boş)
```

Doğrulama: apply sonrası tekrar `audit-sku` çalıştır → `flagged: 0` (hedeflenen sınıf için) beklenir.

## Sponsorship billing migration (TODO-161A)

- Migration `20260725090000_add_sponsorship_billing_settlement` **ADDITIVE**'dir: 5 yeni tablo
  (`SponsorAccount`/`SponsorshipAgreement`/`SponsorshipAgreementCampaign`/`SponsorshipSettlement`/
  `SponsorshipCharge`/`SponsorshipPayment`) + 9 enum + 2 additive kolon
  (`SponsoredProductCampaign.commercialMode` default `INTERNAL_PROMOTION`,
  `StoreSettings.allowUnpaidSponsoredCampaigns` default `false`). Var olan satırlar default'la dolar →
  geriye dönük davranış DEĞİŞMEZ. Docker/production apply yolu `prisma migrate deploy`.
- **tsvector sahte-diff tuzağı (tekrar):** `prisma migrate diff` üretirken `ProductSearchDocument`
  için `DROP INDEX ..._searchVector_gin_idx` / `..._title_trgm_idx` / `ALTER COLUMN "searchVector"
  DROP DEFAULT` ifadeleri SAHTE fark olarak çıkar (generated kolon + GIN/trigram Prisma şemasında
  ifade edilemez). Bunlar migration SQL'inden BİLİNÇLİ ÇIKARILMIŞTIR — uygulansalardı arama
  read-model index'leri düşerdi. Yeni sponsorship-benzeri migration üretirken aynı temizlik gerekir.
- **Checksum drift:** Bir migration DOSYASI uygulandıktan SONRA düzenlenirse (ör. trailing newline)
  `_prisma_migrations.checksum` (dosyanın sha256'sı) kayar ve `migrate dev` "modified after applied"
  hatası verir (`migrate deploy` etkilenmez — yalnız isimle atlar). Çözüm: dosyayı uygulamadan önce
  düzeltin; kaçırılırsa `UPDATE _prisma_migrations SET checksum='<yeni sha256>' WHERE migration_name=…`.

## Theme productization migration + sistem mağazası (TODO-164B / ADR-232)

- Migration `20260731120000_theme_productization_role_separation` **ADDITIVE**'dir: `Store.systemPurpose TEXT`
  (nullable) + `Theme.ownerScope TEXT DEFAULT 'STORE'` + `Theme.overridePolicy JSONB` + `Theme.sourceThemeId TEXT` +
  `Theme.sourceThemeVersion INTEGER` + `Theme_ownerScope_idx`. Var olan satırlar null/default'la dolar → mevcut tema
  görünümü DEĞİŞMEZ. Apply yolu `prisma migrate deploy` (docker'da `pnpm db:deploy`). `db push`/`migrate reset`/
  `volume rm` YASAK.
- **Sistem mağazası (`systemPurpose ≠ null`, ör. `THEME_LIBRARY`)** normal mağaza listeleri (`listStores`), fleet
  binding (`listThemeBindingSummaries`) ve storefront public resolver'dan (`resolvePublicStore` → 404) merkezi olarak
  dışlanır. Bir tema kütüphanesi mağazası oluşturulacaksa (Dilim 2) mutlaka `systemPurpose="THEME_LIBRARY"` ile
  idempotent upsert edilmeli; slug ile ayırmak YETMEZ.
- **Override policy enforcement:** Store Admin save/publish gateway'de `enforceOverridePolicy` ile denetlenir; locked
  alan API ile değiştirilemez (409 `THEME_FIELD_LOCKED`). Client gizlemesi yetki sayılmaz. Platform template
  (`ownerScope=PLATFORM`) yayınlanmadan önce policy EXPLICIT olmalı (aksi halde 409 `THEME_POLICY_INCOMPLETE`).

## Platform Theme Library, Designer & Rollout (TODO-164B Dilim 2 / ADR-238…245)

- Migration `20260731130000_theme_library_designer_rollout` **ADDITIVE**: `Theme.policyRevision INTEGER DEFAULT 0` +
  `ThemeVersion.stagedLogoMediaId/stagedFaviconMediaId TEXT` + `ThemeVersion.assetSnapshot JSONB` (hepsi nullable/
  default → mevcut satırlar + published görünüm DEĞİŞMEZ). Apply `prisma migrate deploy`.
- **Kütüphane mağazası** `ensureThemeLibraryStore` ile idempotent get-or-create (`systemPurpose="THEME_LIBRARY"`,
  slug `__theme-library__`, ACTIVE). İlk kütüphane isteğinde otomatik oluşur; elle seed GEREKMEZ. Bu mağaza
  storefront/fleet/assignable-stores'dan dışlanır → müşteriye asla görünmez.
- **Yetki:** Kütüphane uçları (`/admin/theme-library/*`) YALNIZ SUPER_ADMIN (requirePlatformAdmin). Store Admin
  `GET /stores/:id/theme/platform-status` ile yalnız kendi mağazasının platform-teması DURUMUNU okur (mutasyon yok).
- **TD-162 logo staging:** publish AYNI $transaction içinde `stagedLogo/Favicon` → StoreSettings'e atomik yazar +
  `assetSnapshot` alır. Publish herhangi bir gate'te başarısızsa TÜM txn geri alınır → StoreSettings ve production
  görünümü DEĞİŞMEZ. Rollback hedef sürümün `assetSnapshot`'ına döner. Manuel StoreSettings düzenlemesi GEREKMEZ.
- **Geçersiz media (hardening):** staged media stage+publish'te txn-içi doğrulanır → `THEME_MEDIA_NOT_FOUND` (404) /
  `THEME_MEDIA_NOT_OWNED` (409, cross-store) / `THEME_MEDIA_INVALID` (400, görsel değil). Geçersiz media artık 500
  DEĞİL kontrollü 4xx döner; ham Prisma/FK mesajı sızmaz; StoreSettings kısmi update almaz (media stage↔publish
  arasında silinse bile publish güvenli 404 döner, mevcut görünüm korunur).
- **Controlled rollout:** `assign`/`update/apply` her mağaza için ayrı yürür; sonuç success/failed/skipped ayrı
  raporlanır (bir mağaza başarısız → diğerleri sessizce başarılı SAYILMAZ). Her başarılı apply `invalidateResolvedTheme`
  ile o mağazanın 30s tema cache'ini düşürür. Deploy orchestrator YOK — her apply idempotent, bounded audit'li.
- **Preview:** version-scoped imzalı token (kısa TTL, production cache'ten izole). Storefront middleware token'ı
  request cookie'sine forward eder (ilk yükte de draft/hedef sürüm). Gerçek müşteri verisi kullanılmaz (tema
  template'ten, katalog demo mağazadan). Token sızsa bile store+theme+version scoped ve kısa ömürlü.

## Birleşik sponsorluk: avans/mahsup + anlaşma-kapılı aktivasyon (TODO-161A.2 / ADR-128, ADR-129)

Migration `20260726120000_add_sponsorship_advance_allocation` ADDITIVE: yeni tablo
`SponsorshipAdvanceAllocation` (append-only avans mahsup defteri) + `SponsorshipAgreement`'a
`approvedAt`/`approvedByUserId` nullable kolonları. Yeni ENUM/kolon-değişikliği YOK → sıfır regresyon.
El ile yazıldı (tsvector sahte-diff'i bilinçli olarak dahil edilmedi — ADR-079 deseni).

**Ticari kampanya operasyonu (75.000 TL FIXED_FEE örneği).**
1. Sponsor firma oluştur (`/sponsors`).
2. 75.000 TL FIXED_FEE anlaşma oluştur (`/sponsorship-agreements`) — `PENDING_APPROVAL` bırak.
3. Sponsorlu kampanya oluştur → tip "Ticari sponsorluk", sponsor + anlaşma seç. ACTIVE denemesi
   **reddedilir** (`AGREEMENT_NOT_ACTIVE` — "Kampanyayı aktifleştirmek için anlaşmayı onaylayın").
4. Anlaşmayı `ACTIVE` yap (onay damgası düşer) → kampanyayı bağla → `ACTIVE` yap (başarılı).
5. Anlaşma detayında **Tahakkuk oluştur** (FIXED_FEE, 75.000) → sponsor carisinde kalan alacak 75.000.
6. **Avans ekle** (30.000) → **Avansı mahsup et** (avans + açık tahakkuk + 30.000 seç) → kalan alacak 45.000.
7. Tahakkuğa 20.000 tahsilat → kalan 25.000; 25.000 tahsilat → tahakkuk `PAID`. Fazla tahsilat reddedilir
   (`OVERPAYMENT`).
8. Anlaşmayı `SUSPENDED` yap → kampanya public teslimden düşer (delivery guard). INTERNAL_PROMOTION
   kampanyalar çalışmaya devam eder.

**Eşzamanlılık.** Aynı anlaşmada tahsilat/mahsup `pg_advisory_xact_lock(hashtext('sponsorship-agreement:<id>'))`
ile serileştirilir. İstemci iyimser kilit için gördüğü kalanı `expectedRemainingMinor` olarak gönderir;
sunucudaki değişmişse `409 BALANCE_CHANGED` → istemci yeniler.

**Defter bütünlüğü.** Tahsilat ve mahsup defterleri APPEND-ONLY: iptal = negatif satır (silme/güncelleme
YOK). Geçmiş event/settlement/tahakkuk/ödeme kayıtları anlaşma suspend/cancel olsa da SİLİNMEZ.

## Commercial Automation & Retention — zamanlanmış job'lar + manuel operasyon (TODO-161A.1 / ADR-130…136)

İki yeni **süreç-içi zamanlanmış worker** (api-gateway; ADR-051 shipment-sync deseni). Her ikisi de
**default KAPALI** — env bayrağı açılmadan hiçbir otomatik iş yapmaz. Manuel tetik + görünürlük store-admin
`/operations` sayfasından; uçlar tenant-izole (`/stores/:storeId/commercial-automation/...`, platform-admin).

### 1) `sponsorship-settlement-scheduler` (TD-125)

Kapanmış dönemler için OTOMATİK **DRAFT** settlement üretir (otomatik finalize YOK). Yalnız ACTIVE/COMPLETED +
WEEKLY/MONTHLY/CAMPAIGN_END anlaşmalar. `previewSettlement` reuse → unique-dönem + FINALIZED-immutable →
duplicate imkânsız, idempotent. Dönem sınırları store timezone'a göre (`StoreSettings.timezone`, fallback
`COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE`).

Env: `SETTLEMENT_SCHEDULER_ENABLED` (false), `SETTLEMENT_SCHEDULER_INTERVAL_SECONDS` (3600, min 60),
`SETTLEMENT_SCHEDULER_BATCH_SIZE` (500).

Manuel: `POST /stores/:storeId/commercial-automation/settlement-scheduler/run` body `{ dryRun?: boolean }`
(varsayılan RUN; `dryRun:true` yalnız aday raporlar). Log doğrulama:
`docker compose logs api-gateway | grep "settlement scheduler"`.

### 2) `attribution-event-retention` (TD-121 + TD-113)

Süresi geçmiş HAM funnel/click event'lerini store-scope batch DELETE eder: `SponsoredProductEvent`,
`AttributionClick`. Finans snapshot/defter/settlement ASLA silinmez (ADR-134; yaprak tablo → orphan yok).

Env: `ATTRIBUTION_RETENTION_ENABLED` (false — açılmadan otomatik silme YOK), `_INTERVAL_SECONDS` (86400, min 3600),
`_BATCH_SIZE` (1000), `SPONSORED_EVENT_RETENTION_DAYS` (180, min 30), `INFLUENCER_CLICK_RETENTION_DAYS` (180, min 30),
`ATTRIBUTION_RETENTION_MAX_DELETE_PER_RUN` (200000, circuit breaker).

**Güvenlik (ADR-135):** dry-run VARSAYILAN; apply explicit (`dryRun:false` / worker `apply=true`); cutoff SUNUCU
config otoritesi (istemci gönderemez); circuit breaker aşılırsa APPLY reddedilir (dry-run raporlar);
zamanlanmış worker default KAPALI. Manuel:
`POST /stores/:storeId/commercial-automation/retention/run` body `{ dryRun?: boolean }` — **APPLY yalnız
`dryRun:false` ile** (store-admin UI'da danger onay modal'ı + kapsam gösterimi). Dry-run önce ZORUNLU alışkanlık.

### Overlap & görünürlük (DAĞITIK kilit — ADR-136 revize)

Overlap kilidinin otoritesi **PostgreSQL advisory lock**'tur (session-level `pg_try_advisory_lock`, anahtar
`(jobType, storeId)`; ayrılmış `connection_limit=1` bağlantı → acquire/unlock aynı session; crash'te bağlantı
kapanınca otomatik serbest → **stale lock yok**). Process-local in-memory guard yalnız ikincil hızlı-yoldur.
Granülerlik (jobType, storeId): farklı store'lar paralel; aynı store'da settlement & retention paralel; manuel
ile scheduled AYNI anahtar → biri dışlanır. Kilit alınamazsa **SKIPPED_LOCKED**; manuel uçta **409
JOB_ALREADY_RUNNING** (500 sızmaz).

**Çoklu-replica.** Her api-gateway replica'sı kendi timer'ını kurar; dağıtık kilit bunu güvenli kılar (yalnız
biri kazanır → duplicate DRAFT/çift-silme YOK). TD-054.3 tek-instance sınırı bu iki job için ARTIK GEÇERSİZ
(shipping worker'ları için açık kalır). Graceful shutdown timer'ı durdurur + ayrılmış lock bağlantısını kapatır.

**Görünürlük.** Her tur store başına TEK `QueueJobLog` satırı (queueName `commercial-automation`) yazar; ince
durum `payload.outcome`: STARTED→terminal (COMPLETED/PARTIAL_SUCCESS/FAILED/SKIPPED_LOCKED/DRY_RUN) +
trigger/startedAt/completedAt/durationMs/cutoff/sayımlar. Store-admin `/operations` paneli son çalışmayı
tenant-izole gösterir. Doğrulama: `docker compose logs api-gateway | grep -E "settlement scheduler|attribution retention"`.

## Recently Viewed & Product Recommendations (TODO-161B / ADR-137…143)

**Kapsam.** Görüntüleme geçmişi (`RecentlyViewedProduct`) sunucu-tarafı ve KVKK-uyumludur: HAM IP/UA
SAKLANMAZ; guest kimliği `visitorHash = HMAC(SESSION_SECRET, first-party commerce_os_vid)`. Similar Products
geçmişten BAĞIMSIZ açıklanabilir skordur; sponsored/organik ranking'e DOKUNMAZ.

### Uçlar (public/customer)
- `POST /public/stores/:slug/recently-viewed` — görüntüleme kaydı (bot/prefetch → `{recorded:false}`).
- `GET /public/stores/:slug/recently-viewed?limit=` — geçmiş (kimlik: `x-customer-session` VEYA `x-visitor-id`).
- `DELETE /public/stores/:slug/recently-viewed` — geçmişi temizle.
- `POST /public/stores/:slug/recently-viewed/merge` — guest→customer idempotent merge (her iki header gerekli).
- `GET /public/stores/:slug/products/:productId/similar?limit=` — benzer ürünler (kimlik gerekmez, bounded).

Vitrin bu uçlara BFF proxy'leri üzerinden erişir: `app/api/recently-viewed/route.ts`, `app/api/similar/route.ts`
(gateway URL sunucu-yalnız; visitor/customer cookie'leri header'a çevrilir; prefetch/purpose header'ları iletilir).

### Zamanlanmış retention worker'ı (`recently-viewed-retention`)
90-gün cutoff'unu store-scope batch DELETE eder (max 50/kimlik cap ise WRITE-TIME otoritedir — worker onu
uygulamaz). TODO-161A.1 SAF altyapısını reuse eder (advisory lock + `QueueJobLog`); domain AYRI.

Env: `RECENTLY_VIEWED_RETENTION_ENABLED` (false — açılmadan otomatik silme YOK), `_INTERVAL_SECONDS` (86400,
min 3600), `RECENTLY_VIEWED_RETENTION_DAYS` (90, min 1), `_BATCH_SIZE` (1000), `_MAX_DELETE_PER_RUN` (200000,
circuit breaker), `RECENTLY_VIEWED_MAX_PER_VISITOR` (50, write-time cap).

**Overlap & görünürlük.** Dağıtık PostgreSQL advisory lock (jobType `recently-viewed-retention`, granülerlik
(jobType,storeId)); kilitlenen tur SKIPPED_LOCKED. Her tur store başına TEK `QueueJobLog` satırı (queueName
`recently-viewed`; `payload.outcome` DRY_RUN/COMPLETED/PARTIAL_SUCCESS/SKIPPED_LOCKED). Doğrulama:
`docker compose logs api-gateway | grep -E "recently-viewed retention"`.

**KVKK / silme.** `RecentlyViewedProduct` Customer/Store/Product'a `onDelete: Cascade` → müşteri/mağaza/ürün
silinince otomatik temizlik; finansal OrderLine snapshot'ları ETKİLENMEZ. Kullanıcı geçmişini `DELETE` ucuyla
kendisi temizleyebilir (Hesabım > Görüntüleme Geçmişi).

### Zamanlanmış retention worker'ı (`recommendation-event-retention`) — TD-130 (ADR-148)
`RecommendationEvent` ham davranış-event'ini **180-gün** cutoff'uyla (createdAt < cutoff) store-scope batch DELETE
eder. Korunacak finansal kayıt YOK (yalnız davranış event'i). TODO-161A.1 SAF altyapısını reuse eder (advisory lock
+ `QueueJobLog`); domain AYRI (influencer/sponsored `RETENTION_TABLE_SPECS` allowlist'ine DOKUNMAZ).

Env: `RECOMMENDATION_EVENT_RETENTION_ENABLED` (false — açılmadan otomatik silme YOK), `_INTERVAL_SECONDS` (86400,
min 3600), `RECOMMENDATION_EVENT_RETENTION_DAYS` (180, min 30), `_BATCH_SIZE` (1000), `_MAX_DELETE_PER_RUN` (200000,
circuit breaker). Event ucu ayrıca: `RECOMMENDATION_EVENT_RATE_LIMIT_MAX` (240) / `_WINDOW_SECONDS` (60),
`RECOMMENDATION_IMPRESSION_DEDUPE_SECONDS` (1800), `RECOMMENDATION_CLICK_DEDUPE_SECONDS` (30).

**Overlap & görünürlük.** Dağıtık PostgreSQL advisory lock (jobType `recommendation-event-retention`, granülerlik
(jobType,storeId)); kilitlenen tur SKIPPED_LOCKED. Store başına TEK `QueueJobLog` satırı (queueName
`recommendation-events`). Manuel tetik/status için ayrı store-admin ucu YOKTUR (worker + dry-run/apply servis
seviyesinde); zamanlanmış tur env gate ile çalışır. Doğrulama:
`docker compose logs api-gateway | grep -E "recommendation-event retention"`.

**Dry-run doğrulaması (canlı).** Retention servisi DI-testable; production'da worker default KAPALI. Manuel dry-run
için worker `runOnce(false)` (apply=false) çağrısı yalnız aday SAYAR (silme YOK) ve store başına `QueueJobLog`
`payload.outcome=DRY_RUN` yazar. Apply (`runOnce(true)`) yalnız env gate açıkken veya bilinçli tetikte çalışır.

**KVKK / veri minimizasyonu.** `RecommendationEvent` ham IP/UA SAKLAMAZ (yalnız tuzlu HMAC `visitorHash`/
`sessionHash`); bot/prefetch event ÜRETMEZ. `onDelete: Cascade` yalnız Store'a bağlı (mağaza silinince temizlik).
Store-admin görünürlük: `/home/insights` (impression/click/CTR/add-to-cart + source/placement kırılımı; salt-okunur
funnel; büyük raporlama yok).

**Customer deletion / erasure (KVKK).** Platformda şu an **hard customer-deletion akışı YOKTUR** — müşteri yalnız
status ile soft-deactivate edilir (`CustomerStatus` ACTIVE/PASSIVE/BLOCKED/ARCHIVED; `deletedAt` yok, delete/anonymize
servisi yok). `RecommendationEvent.customerId` bilinçli olarak **FK'siz plain String**tir (analytics; SponsoredProduct
Event/AttributionClick deseni) → DB Cascade bu satırları KAPSAMAZ. Bu nedenle KVKK, üç katmanla karşılanır: (1) ham
PII saklamama (hash), (2) store-scope 180-gün retention purge, (3) store silinince Cascade. **İleride gerçek bir hard
customer-deletion / "verilerimi sil" akışı eklenirse**, o akış recommendation domainini `RecommendationEventData.
deleteForCustomer(storeId, customerId)` erasure primitifiyle temizlemelidir (tenant-scoped `deleteMany({where:{storeId,
customerId}})`; guest/diğer müşteri/diğer store event'lerine dokunmaz; finansal Order/OrderLine snapshot'ları ayrı
tablodadır ve `Order.customerId` zaten `SetNull`'dur). Aynı gereklilik FK'siz `SponsoredProductEvent`/`AttributionClick`
için de geçerlidir. `deleteForCustomer` bu faz kapsamında **testli+hazır**dır ama henüz bir akışa bağlı DEĞİLDİR
(dead-hook değil; erasure sözleşmesinin garantisi). Kanıt: `apps/api-gateway/test/recommendation-events-data.test.ts`.

## Customer Data Erasure Workflow — KVKK/GDPR (TD-131 / ADR-149…155)

**Amaç.** Store-admin üzerinden bir müşterinin kişisel verisini tenant-güvenli, audit'li ve GERİ ALINAMAZ
biçimde silmek/anonimleştirmek. Finansal/yasal kayıt korunur.

**İki ayrı aksiyon (KARIŞTIRMA).**
- **Hesabı Pasifleştir (DEACTIVATE):** `POST /stores/:storeId/customers/:customerId/deactivate` → status=PASSIVE +
  tüm oturum revoke. Veri KORUNUR, GERİ ALINABİLİR. Giriş engellenir (login `status===ACTIVE` ister).
- **Kişisel Verileri Sil (ERASE_PERSONAL_DATA):** GERİ ALINAMAZ. Önce dry-run, sonra apply.

**Prosedür (store-admin UI).**
1. Müşteri detayı → "Veri gizliliği / Silme" (Danger Zone) kartı → **Kişisel Verileri Sil**.
2. Danger modal açılır ve **dry-run** (`POST …/erasure/preview`, YAZMA YOK) çalışır: silinecek/anonimleşecek/
   korunacak sayıları + uyarılar (aktif oturum / açık sipariş / zaten silinmiş) gösterilir.
3. Operatör **neden** yazar ve onay ifadesini **birebir** yazar: `KİŞİSEL VERİLERİ SİL`.
4. "Kalıcı olarak sil" → `POST …/erasure/apply` (confirmation + reason). Sunucu: müşteri-izole advisory lock +
   tek transaction + kilit-altı ikinci okuma. Eşzamanlı ikinci apply → 409 `ERASURE_IN_PROGRESS`. Zaten silinmiş →
   409 `CUSTOMER_ALREADY_ERASED` (idempotent).
5. Sonrası: müşteri "Silinmiş" rozetiyle görünür; düzenlenemez; giriş yapamaz. Sipariş geçmişi finansal snapshot'la
   görünür (anonim). `GET …/erasure/status` erased/erasedAt/erasedByUserId/eraseReason döner.

**Sil / Anonimleştir / Koru.**
- **Sil:** session, credential, credential token, OTP, IBAN, iletişim tercihi, adres defteri, wishlist/listeler,
  kupon cüzdanı, görüntüleme geçmişi, "faydalı" oyları + FK'siz `RecommendationEvent` (deleteForCustomer).
- **Anonimleştir:** Customer (ad/e-posta→placeholder, telefon/doğum/cinsiyet→null, ERASED) · Order temas PII
  (customerEmail→placeholder, billingEmail→null) · OrderAddress (ad/telefon/adres satırları; şehir kaba korunur) ·
  CampaignRedemption.email.
- **Koru:** Order/OrderLine/PaymentAttempt/redemption **mali** alanları + Order **yasal fatura kimliği**
  (billingType/billingName/billingTaxId/billingCompanyName/billingTaxOffice/billingTaxNumber — asgari saklama; ADR-151).
  **ProductReview SİLİNMEZ** (yazar anonimleşir; helpfulCount recompute).
- **Dokunulmaz:** guest (`visitorHash`/`visitorIdHash`) event'leri + cross-store (başka mağaza) kayıtları.

**Migration.** `20260727160000_customer_erasure` (additive: `CustomerStatus.ERASED` + `erasedAt/erasedByUserId/
eraseReason`). Docker'da: `pnpm db:deploy` (veya host'ta `DATABASE_URL=… prisma migrate deploy`).

**Audit.** dry-run=`SYSTEM`, apply=`DELETE`, deactivate=`UPDATE` (`entityType=Customer`). metadata **PII TAŞIMAZ** —
yalnız mode/reason/sayaçlar/alan-adları. Ham e-posta/telefon/TCKN/IBAN ASLA audit'e yazılmaz.

**Bilinen sınır (hukuki).** Sistem, erasure sırasında finansal sipariş + ödeme kayıtlarını ve zorunlu billing
alanlarını KORUR. Ancak `billingTaxId` vb. yasal fatura alanlarının **kesin saklama süresi ve süre-sonu
anonimleştirme politikası uygulama kodunun tek başına verdiği hukuki bir karar DEĞİLDİR** — süre ve politika
**mali müşavir/hukuk onayıyla** belirlenmelidir. Mevzuat doğrulaması olmadan **otomatik süre-sonu purge
UYGULANMAZ**. Bu yüzden **TD-132 AÇIK kalır** (erasure anında bu alanlar bilinçli korunuyor).

## Ödeme webhook otantikliği (PB-1 / ADR-156/157/158)

**Güvenlik modeli.** Doğrulanmış ödeme webhook'u `POST /public/payments/webhooks/:webhookToken`. Kullanıcı auth
YOK; **kimlik = URL token'ı**, **yetki = HMAC imza**. Eski client-otoriteli `/payments/webhooks/:provider` ucu
(client `storeId/attemptId/status` ile siparişi PAID yapabiliyordu) **KALDIRILDI**.

**İmza sözleşmesi (sağlayıcı tarafında üretilir).**
- Header `x-payment-signature` = `hex(HMAC_SHA256(webhookSecret, "<timestamp>.<rawBody>"))`.
- Header `x-payment-timestamp` = unix saniye; **±300 sn** tolerans dışı reddedilir (replay).
- `rawBody` byte-aynen imzalanır (JSON re-serialize edilmez).
- Gövde (imza sonrası parse): `{ eventId, providerReference, status, amountMinor, currency, occurredAt? }` (strict).
  `status ∈ PENDING|REQUIRES_ACTION|AUTHORIZED|PAID|FAILED|CANCELLED|REFUNDED`.

**Davranış.** Bilinmeyen token / DISABLED config / secret'siz config → **404** (fail-closed, tenant sızmaz).
İmza yok/yanlış/eski-timestamp → **401** (DB'ye yazılmaz). Bilinmeyen `providerReference` → **200**
`WEBHOOK_REFERENCE_NOT_FOUND` (order değişmez). `amountMinor`/`currency` attempt snapshot'ıyla uyuşmazsa → **200**
`AMOUNT_MISMATCH`/`CURRENCY_MISMATCH` (order PAID OLMAZ, audit). Geçerli → monotonik geçiş + `(storeId,provider,
eventId)` idempotency. `storeId`/`orderId`/`amount` payload'dan **otorite değildir** (store token'dan, attempt
provider reference'tan).

**Provisioning (bugün elle; UI = TD-138).** Config'e webhook token+secret ata:
```bash
# secret üret (bir kez plain göster, DB'de sifreli): generatePaymentWebhookSecret() / rotate ucu (TD-138) gelince otomatik
# token üret: whk_<48 hex> (generatePaymentWebhookToken)
# PaymentProviderConfig.webhookToken (unique) + webhookSecretCipher = secretCipher.encrypt(secret)
```
Webhook URL = `<PUBLIC_BASE>/public/payments/webhooks/<webhookToken>`.

**Fail-closed / EX-1.** Bu faz PLATFORM HMAC şemasını kullanır; gerçek sağlayıcı (Stripe/iyzico/PayTR) **native
imza** doğrulaması **TD-137** ile eklenir. Native imza + sağlayıcı sözleşmesi (**EX-1**) tamamlanmadan gerçek
sağlayıcı webhook'u AÇILMAZ (secret'siz config → 404). MOCK ödeme webhook kullanmaz (`/public/pay/:token` confirm).

**Migration.** `20260727170000_payment_webhook_authenticity` (additive: `PaymentProviderConfig.webhookToken` unique +
`PaymentAttempt(storeId, providerReference)` index). `prisma migrate deploy` ile uygulanır.

## Influencer Campaign Lifecycle & Granular Analytics (2026-07-28, ADR-170…176)

- **Migration.** `20260728120000_influencer_campaign_lifecycle` (ADDITIVE): `InfluencerCampaignStatus`e DRAFT/ENDED/
  CANCELLED, `TrackingLinkStatus`e PAUSED/REVOKED enum değerleri; `InfluencerTrackingLink`e utmContent/utmTerm/customLabel/
  activatedAt/pausedAt/revokedAt kolonları. `ALTER TYPE ... ADD VALUE` PostgreSQL'de transaction dışı; Prisma ayrı
  ifadelerle uygular. Mevcut veriye DOKUNMAZ (RESET YOK); legacy ARCHIVED/INACTIVE korunur (uygulama ENDED/PAUSED'a
  normalize eder). Deploy: `prisma migrate deploy`.
- **Storefront route.** Yeni `/campaign-unavailable` sayfası (200 + `noindex,nofollow`) — durdurulmuş/bitmiş/iptal kampanya
  bağlantısı terminali. `/t/[token]` route handler gateway `available:false` dönünce buraya 307 yönlendirir. Bu sayfa
  attribution EVENT'i DEĞİLDİR. storefront değişince web REBUILD gerekir (Next dev COPY).
- **Redirect davranışı.** Tracking URL yalnız campaign ACTIVE + link ACTIVE + tarih penceresi + influencer ACTIVE + store
  ACTIVE + target ürün/kategori ACTIVE iken hedefe yönlendirir; aksi halde click/session/cookie YAZILMAZ. Kampanya durdurma
  (PAUSED/ENDED/CANCELLED) veya link REVOKED anında etkilidir (sunucu-otoriter, cache otoritesi yok).
- **Operatör aksiyonları.** Store-admin influencer detayında: kampanya "Analizi aç" → kampanya detay dashboard; link
  "Durdur/Etkinleştir" (PAUSED↔ACTIVE), "İptal et" (REVOKED, terminal — geri alınamaz, onay ister), "Analizi aç" → link
  detay. CANCELLED kampanya reactive edilemez (409). Gerçek tracking URL yalnız oluşturma/yenileme anında gösterilir
  (dashboard token göstermez).

## Influencer Analytics Demo Completion (2026-07-28, ADR-177…179)

- **Demo fixture:** `packages/db/scripts/influencer-demo-seed.mjs` (idempotent; DEMO_FIXTURE / MELEK-DEMO / INFDEMO-).
  `enterprise-demo` mağazasında influencer analytics demosu (kampanya/link/UTM/currency/zaman serisi). Çalıştırma +
  beklenen KPI + tracking URL + yaşam döngüsü gösterimi: `docs/runbooks/influencer-analytics-demo.md`. Demo bitene
  kadar KORUNUR; temizlik runbook §5.
- **Timezone:** günlük analytics gün sınırları `StoreSettings.timezone` (varsayılan Europe/Istanbul) ile bucketlanır;
  API+UI aynı sınır. Aralık bounded (max 366 gün, varsayılan 30); gelecek gün yok; veri olmayan gün sıfır (zero-fill).
- **Yeni migration YOK** (alanlar 20260728120000'de). `prisma migrate status` temiz olmalı.

## Theme Token Security — Typed Governance (H-1 / ADR-180, TD-134 CLOSED)

Tema token değerleri **serbest CSS değildir**: her token typed registry (`packages/theme/src/registry.ts`) üzerinden
doğrulanır ve tek güvenli serializer (`css.ts`) ile render edilir. İki kat savunma:

- **Save-time** (gateway): Theme Studio draft kaydet/publish/import token doğrulaması. Geçersiz → `THEME_TOKEN_UNKNOWN
  / THEME_TOKEN_INVALID_VALUE / THEME_TOKEN_TYPE_MISMATCH / THEME_TOKEN_UNSAFE_VALUE`; geçersiz draft publish → 409
  `THEME_PUBLISH_BLOCKED`. Yanıt ham payload/regex TAŞIMAZ (yalnız path/type/reason).
- **Render-time** (storefront + preview): serializer her değeri tipine göre doğrular; geçersiz/legacy token **atlanır**
  (ham değer `<style>`'a girmez; diğer geçerli tokenlar çalışır; sayfa kırılmaz). DB'deki legacy geçersiz kayıtlar bu
  katmanla güvenle sindirilir.

**Legacy tarama (salt-okuma, önerilen periyodik kontrol):**

```
# Tüm store'lar
node packages/db/scripts/security/scan-theme-tokens.mjs
# Tek store + tam JSON
node packages/db/scripts/security/scan-theme-tokens.mjs --store=<storeId> --json
```

Çıktı yalnız güvenli metadata (path/layer/type/reason + theme/version kimlikleri + status) — **ham token değeri
loglanmaz**. Etkilenen PUBLISHED tema render'da güvenle atlanır; düzeltmek için Theme Studio'da geçersiz alanları
düzeltip yeniden yayınlayın (publish geçersizken bloklanır). Script DB'yi **değiştirmez** (sessiz mutate YOK).

**Kalan:** Storefront CSP yok (inline `<style>`/`<script>` nonce/hash) → **TD-147** (MEDIUM, derinlemesine savunma;
H-1 için gerekli değil).
## Sponsorship Revenue-Share Currency Guard (H-2 / ADR-181…186, TD-133 CLOSED)

Sponsorship finansal kayıtlarında **farklı para birimleri tek toplamda birleştirilemez** (ADR-181). Gelir toplamları
YALNIZ agreement currency ile eşleşen `OrderSponsoredAttribution` satırlarından alınır → settlement/charge revenue
rakamları her zaman **tek para birimi**. Karışık-para dönem → **fail-closed** (draft/finalize/charge engellenir).

**Fail-closed hata kodları (409):**
- `AGREEMENT_CURRENCY_REQUIRED` — anlaşma currency'si eksik/geçersiz (ISO 4217 değil).
- `REVENUE_CURRENCY_MISMATCH` — dönemde birden fazla currency'de attribution var (güvenli özet: `expectedCurrency`,
  `foundCurrencies`, `mismatchedOrderCount` → `error.details`; ham finansal veri/PII YOK).
- `SETTLEMENT_CURRENCY_MISMATCH` — settlement.currency ≠ agreement.currency (finalize/charge recheck).

**Görünürlük.** Her mismatch tespiti `AuditLog` (action=SYSTEM, entityType=SponsorshipSettlement) satırı üretir:
`reason=REVENUE_CURRENCY_MISMATCH` + expected/found currency + uyuşmayan sayı + dönem + BOUNDED (max 20) orderId örneği
(PII yok). Store-admin **sponsorship dashboard** `currencyMismatch` özeti: uyuşmayan attribution/kampanya/settlement
sayısı + yabancı currency listesi + son tespit zamanı → operatör eksik/uyuşmayan finansal kapsamı görür. Anlaşma
detayında preview/finalize sırasında kontrollü uyarı kartı (beklenen/bulunan currency + uyuşmayan kayıt sayısı); üret/
kesinleştir butonu engellenir; teknik kod yerine TR/EN mesaj.

**Zamanlanmış settlement scheduler** karışık-para anlaşmayı fail-closed geçer (DRAFT üretmez; anlaşma-başına izole hata
QueueJobLog'a `REVENUE_CURRENCY_MISMATCH` olarak). Weekly/monthly/campaign-end job ve advisory-lock akışı değişmez.

**Salt-okuma denetim (periyodik önerilir):**

```
# Tüm store'lar
pnpm --filter @commerce-os/db db:scan-sponsorship-currency
# Tek store + tam JSON
node packages/db/scripts/security/scan-sponsorship-currency.mjs --store=<storeId> --json
```

Kontroller: agreement currency eksik · order/attribution↔agreement · multi-currency campaign · settlement↔agreement ·
charge↔agreement · payment↔charge · allocation↔charge. Çıktı yalnız sayılar + entity ID'leri + currency kodları
(müşteri/kişisel/tam ödeme verisi YOK); bulgu varsa exit 1. Script DB'yi **değiştirmez**.

**FX (kur dönüşümü) KAPSAM DIŞI (ADR-186).** Guard birleştirmeyi **reddeder**, dönüşüm yapmaz. Gerçek çok-para settlement
ihtiyacı doğarsa ayrı bir FX conversion engine yeteneğidir → **TD-148** (FUTURE CAPABILITY, teknik borç değil).

## Rezervasyon süre-aşımı süpürücü + orphan DRAFT temizliği (H-3 / ADR-187…193)

**Amaç.** Terk edilen anonim checkout'ların stoğu süresiz kilitlemesini engellemek; süresi dolmuş rezervasyonları
serbest bırakmak, süresi dolmuş ödenmemiş siparişleri ve eski orphan DRAFT'ları kontrollü kapatmak.

**Otomatik davranış (write/read yolu, worker'dan bağımsız — doğruluk yalnız scheduler'a bağlı değil):**
- `placeOrder` her rezervasyona `expiresAt = createdAt + RESERVATION_TTL_MINUTES` (varsayılan 15) yazar ve kilit
  altında o varyantın süresi dolmuş rezervasyonlarını bırakır (lazy-expiry) → yanlış oversell reddi olmaz.
- Storefront kullanılabilir stok read-time'da `onHand − reserved + expiredActiveReserved` ile hesaplanır →
  süresi dolmuş rezervasyon PLP/PDP/sepette stoğu azaltmaz (süpürücü çalışmadan önce bile).
- Ödeme PAID/AUTHORIZED → rezervasyon CONSUMED (stok commit); CANCELLED → release; PAYMENT_FAILED (retryable) bırakılmaz.

**Worker-owned zamanlama (ADR-194; süpürücü api-gateway'de DEĞİL).** Domain mantığı `@commerce-os/inventory`
paketinde; yürütme `apps/worker`. Periyodik expiry tetiği BullMQ Job Scheduler'da (Redis; sabit id
`inventory-reservation-expiry-schedule`, idempotent upsert → worker restart duplicate üretmez; gateway restart/deploy
takvimi etkilemez). Env (varsayılan KAPALI):
```
INVENTORY_RESERVATION_EXPIRY_ENABLED=true            # true → periyodik zamanlama upsert (worker'da)
INVENTORY_RESERVATION_EXPIRY_INTERVAL_SECONDS=300    # BullMQ every = *1000 (cron verilmezse)
INVENTORY_RESERVATION_EXPIRY_CRON=                   # opsiyonel; verilirse interval yerine
INVENTORY_RESERVATION_EXPIRY_BATCH_SIZE=500
INVENTORY_RESERVATION_EXPIRY_MAX_RELEASE_PER_RUN=100000   # circuit breaker
INVENTORY_RESERVATION_RECONCILE_BATCH_SIZE=500
INVENTORY_RESERVATION_RECONCILE_MAX_PER_RUN=100000
ORPHAN_DRAFT_MAX_AGE_MINUTES=1440                    # 24s
```
Worker consumer HER ZAMAN kayıtlı (manuel enqueue işlensin); periyodik zamanlama YALNIZ `..._ENABLED=true` iken.
(jobType, storeId) advisory lock + `FOR UPDATE SKIP LOCKED`. `QueueJobLog` (queue=`inventory-maintenance`,
job=`inventory-reservation-expiry` | `inventory-reservation-reconcile`): STARTED→terminal (COMPLETED/DRY_RUN/
PARTIAL_SUCCESS/CIRCUIT_BROKEN/FAILED) + kilit alınamazsa SKIPPED_LOCKED.

**Manuel tetik + görünürlük (store-admin, auth-gated; gateway enqueue eder, worker çalıştırır).**
- Görünürlük: `GET /stores/:storeId/inventory/reservations/status` → active/expired-aday/orphan-DRAFT sayacı, en eski
  aktif, son expiry + son reconcile job, reconciliation özeti.
- Reconciliation (salt-okunur): `GET /stores/:storeId/inventory/reservations/reconcile`.
- Süpürücü (expiry): `POST /stores/:storeId/inventory/reservations/expiry/run` → worker kuyruğuna enqueue (202 +
  jobId). **VARSAYILAN DRY-RUN**; uygulama için gövde `{"dryRun": false}`.
- **PAID+ACTIVE reconcile** (ADR-195): `POST /stores/:storeId/inventory/reservations/reconcile/run` → enqueue.
  VARSAYILAN DRY-RUN; apply için `{"dryRun": false}`. PAID/AUTHORIZED+ACTIVE'i güvenli CONSUMED'a alır (qty/line/
  inventory doğrulama; belirsiz → MANUAL_REVIEW, mutate etmez; `SALE_COMMIT` yalnız ACTIVE→CONSUMED geçişinde).

**Payment-vs-expiry yarışı.** Consume ve expiry ikisi de `InventoryItem` satırını `FOR UPDATE` kilitler → serialize.
PAID sipariş rezervasyonu expiry tarafından **release edilmez** (reconcile→consume). Expiry önce kazanır ve ardından
ödeme başarısı gelirse: sipariş PAID olur fakat stok otomatik düşülmez → `LATE_PAYMENT_AFTER_EXPIRY` order-event +
reconciliation uyarısı → **manuel inceleme** (fail-closed; oversell yaratılmaz).

**Baseline/doğrulama.** Migration `20260729120000` additive; backfill PAID/AUTHORIZED ACTIVE rezervasyonlara dokunmaz
(meşru tutulan → `expiresAt` NULL), yalnız UNPAID/PLACED açık kilitlenmeyi kısa grace ile quarantine eder.
Reconciliation `warningCount=0` → temiz.

## Authenticated money path & sponsored funnel smoke (H-4 / 2026-07-29)

**Amaç.** Gerçek para/sponsorluk akışlarını deployed stack'te doğrula (verification-only; kod değişikliği yok).

**Auth (fixture-session; yalnız smoke).** Kısa ömürlü `CustomerSession`:
```
TOKEN="smoke-h4-cust-$(openssl rand -hex 8)"
# tokenHash KONTEYNER İÇİNDE hesaplanır — SESSION_SECRET dışarı sızmaz, yalnız hash döner:
HASH=$(docker exec docker-api-gateway-1 node -e \
  'const{createHash}=require("crypto");process.stdout.write(createHash("sha256").update(process.argv[1]+"."+process.env.SESSION_SECRET).digest("hex"))' "$TOKEN")
# CustomerSession INSERT (TTL 10dk) → x-customer-session: $TOKEN ile çağır → smoke sonunda satırı SİL.
```
Secret/parola okunmaz/loglanmaz/commit edilmez. Store-admin/internal = `INTERNAL_API_TOKEN` (konteyner env; okunmaz).

**Canlı imzalı payment webhook regresyonu (deployed :4000).** İzole `smoke-h4-*` store + bilinen webhook secret
(dev-fallback `PAYMENT_ENCRYPTION_KEY` deterministik) ile HMAC imza `hex(HMAC_SHA256(secret, "<ts>.<rawBody>"))`,
header `x-payment-signature` + `x-payment-timestamp`. Beklenen: legacy route→404, unknown token→404 generic,
unsigned→401 `SIGNATURE_MISSING`, wrong-sig→401 `SIGNATURE_INVALID`, old-ts(>300s)→401 `TIMESTAMP_OUT_OF_RANGE`,
wrong-amount→`AMOUNT_MISMATCH` (no mutation), wrong-currency→`CURRENCY_MISMATCH` (no mutation), unknown-ref→
`WEBHOOK_REFERENCE_NOT_FOUND` (no mutation), valid→PAID `applied=true`, duplicate→`duplicate=true`, PAID sonrası
late FAILED→no rollback. Tüm izole satırlar smoke sonunda silinir (0 kalıntı).

**Veri bütünlüğü scan (salt-okunur).** `PAID+ACTIVE reservation`, `CANCELLED+ACTIVE`, duplicate `PaymentProviderEvent`,
duplicate settlement, charge/payment currency mismatch, orphan OrderLine, reservedCounterMismatch, reservedExceedsOnHand.

**Legacy PAID+ACTIVE reservation (beklenen durum, kod defekti değil).** H-3 backfill PAID/AUTHORIZED+ACTIVE'i
bilinçli korur (`expiresAt` NULL; "meşru tutulan"); consume-on-paid wiring'inden önce ödenmiş eski siparişler
PAID+ACTIVE kalır. **Güvenli çözüm smoke'un işi DEĞİL** (spec §15 salt-okuma); operatör isterse ADR-195 reconcile
apply ucuyla çözer: `POST /stores/:storeId/inventory/reservations/reconcile/run` gövde `{"dryRun": false}` (qty/line/
inventory doğrulama; belirsiz → MANUAL_REVIEW, mutate etmez). Bkz.
`docs/analysis/H-4-authenticated-money-sponsored-funnel-smoke.md`.

## TODO-162 — HomeDiscoveryEvent tablosu (2026-07-30, ADR-205)

Yeni ADDITIVE `HomeDiscoveryEvent` (migration `20260730120000`): eligibility-driven Home keşif section'larının
section-seviyesi funnel ölçümü. Yalnız RENDER EDİLEN section event üretir (eligibility=false → impression YOK);
bot/prefetch event yazmaz (satır hiç oluşmaz → `isBot` kolonu yok). Sponsored kartları AYRICA mevcut
`SponsoredProductEvent` token ölçümünü kullanır (bu tablo yalnız section funnel). Tenant isolation: `storeId`
her index'te; cross-store productId reddi. Sponsored kartların OTORİTATİF ölçümü yine token'dadır (çift-ölçüm değil).

### TD-151 — Discovery analytics ingest + retention (2026-07-30)

Public ingest ucu `POST /public/stores/:storeSlug/home/discovery-events` (`Cache-Control` yok; best-effort → 200).
Kimlik SUNUCU-türevi (customer session → visitorHash; KVKK HMAC). Doğrulama: eventType+sectionType+eligibilitySource
allowlist; sectionId gerçek yayınlanmış (enabled) section'a karşı; ürün store-sahipliği. Admin funnel özeti
`GET /stores/:storeId/home/discovery-events/summary` (platform-admin; store-scope; max 366 gün).

Env (ingest): `HOME_DISCOVERY_EVENT_RATE_LIMIT_MAX` (600) / `_WINDOW_SECONDS` (60), `HOME_DISCOVERY_IMPRESSION_DEDUPE_SECONDS`
(1800), `HOME_DISCOVERY_INTERACTION_DEDUPE_SECONDS` (30). Env (retention worker): `HOME_DISCOVERY_EVENT_RETENTION_ENABLED`
(false — açılmadan otomatik silme YOK), `_INTERVAL_SECONDS` (86400, min 3600), `_RETENTION_DAYS` (180, min 30),
`_BATCH_SIZE` (1000), `_MAX_DELETE_PER_RUN` (200000, circuit breaker). Retention ayrı jobType/queueName
(`home-discovery-event-retention` / `home-discovery-events`); TODO-161A.1 SAF altyapı reuse (advisory lock + QueueJobLog);
influencer/sponsored/recommendation `RETENTION_TABLE_SPECS` allowlist'ine DOKUNMAZ. Storefront emit BFF üzerinden
(`/api/discovery/event` → gateway); gateway URL sunucu-yalnız. ADD_TO_CART discovery yüzeyinde emit edilmez.

## Tenant Module & Capability — worker skip + plan editörü (TODO-163 Faz 3, ADR-214/215)

**Worker per-store capability skip (TD-153).** OPSİYONEL, store-scope'lu ZAMANLANMIŞ worker'lar (hepsi
env-gated, default KAPALI: `RECOMMENDATION_EVENT_RETENTION_ENABLED`, `RECENTLY_VIEWED_RETENTION_ENABLED`,
`HOME_DISCOVERY_EVENT_RETENTION_ENABLED`, `ATTRIBUTION_RETENTION_ENABLED`, `SETTLEMENT_SCHEDULER_ENABLED`,
`CAMPAIGN_RECONCILE_ENABLED`) her store için modül capability'sini kontrol eder. Modül KAPALIysa o store
için işlem YAPILMAZ ve **`SKIPPED_DISABLED`** yazılır: retention/settlement worker'ları `QueueJobLog`
`payload.outcome = "SKIPPED_DISABLED"` (status COMPLETED = HATA DEĞİL; `moduleKey` payload'da; retry yok;
`SKIPPED_LOCKED` ile simetrik); attribution retention PER-TABLO atlar (SponsoredProductEvent→
SPONSORED_PRODUCTS, AttributionClick→INFLUENCER_TRACKING); campaign reconcile (per-store lock/jobLog'u yok)
reindex emit'ini atlar + `expiredSkippedDisabled`/`storesSkippedDisabled` sayaçlarını loglar. Bir store'un
atlanması BATCH'i durdurmaz (diğer store'lar devam). **CORE worker'lar (shipment sync / barkod retry +
apps/worker inventory reservation · backup) capability ile ASLA kapanmaz** (gate enjekte edilmez). Gate
tek `createWorkerCapabilityGate(prisma)` (store-scoped bounded 30s TTL, fail-closed: DB hatası → non-core
kapalı/core açık, cache'lenmez; cross-store leak yok). Görünürlük: `QueueJobLog` `payload.outcome` filtrele.

**Plan → capability editörü (TD-154).** Platform-admin `/plans` ekranında her planın "Modüller" düğmesi
capability matrisini açar: opsiyonel modüller için durum seçimi (**required** = plan default açık ·
**optional** = registry baseline · **unavailable** = plan default kapalı). CORE modüller kilitli (kapatılamaz).
Canlı **preview** değişen modülleri + dependency nedeniyle kapananları + plana bağlı mağaza sayısını gösterir;
**apply** `Plan.metadata.modules`'ü MERGE eder (diğer metadata anahtarları korunur), audit üretir
(`{capabilities:{changedModules}}` — PII/secret yok) ve capability cache'ini temizler. **Effective çözüm sırası
KORUNUR: store override > plan default > registry baseline > dependency** — plan default'u değiştirmek mağaza
override'larını EZMEZ ve veri SİLMEZ. Uçlar: `GET/POST(preview)/PUT /admin/plans/:id/capabilities` (yalnız
platform-admin). Doğrulama sunucu-otoriter: core-unavailable / bilinmeyen anahtar / invalid-dependency → 400.

## Tenant Theme Architecture (TODO-164, ADR-216…224)

**Model.** Görsel kimlik store-scoped `Theme` + `ThemeVersion` (immutable snapshot; mağaza başına tek
PUBLISHED). TODO-164 additive alanlar: `Theme.themeKey/layoutPreset/themeApiVersion`, `ThemeVersion.config/
themeKey/layoutPreset/publishedBy`. Üç katman: **tokens** (renk/tipografi — `document`), **layout preset**
(slot→variant düzeni — `config.layoutPreset`), **custom package** (`config.themeKey` = registry key).

**Storefront çözümü (server-side, ALLOWLIST).** `GET /public/stores/:slug/theme` → `{css, colorScheme,
schemaVersion, themeKey, layoutPreset, slots}`. Sıra: (1) geçerli published custom/preset tema → (2) base
theme. THEME_STUDIO kapalı / published yok / **uyumsuz** / belge çözülemez → **base fallback** (globals.css
ile aynı; storefront ASLA kırılmaz). İç config/draft/audit SIZMAZ. Store-scoped bounded TTL cache (30s, max
500); **publish / assign / modül-değişimi** anında invalidate eder.

**Draft/publish/rollback.** Store admin Theme Studio'da layout preset seçer + token düzenler → draft (config
+ document). **Draft PRODUCTION'a yansımaz.** Publish: compatibility gate (uyumsuz → 409 THEME_INCOMPATIBLE;
mevcut published KORUNUR) → atomik → yeni draft snapshot. Rollback: hedef versiyonu yeni draft'a geri yükler
(publish ile yayına alınır); geçmiş revizyon SİLİNMEZ.

**Platform Admin "Tema Yönetimi".** Sol menüde AYRI sayfa (`/themes`) — fleet tablosu: tüm mağazalar +
aktif tema/layout preset/uyumluluk/Theme Studio; satırdan **Yönet** → tema atama + revision/rollback/uyarı
paneli. Uçlar: `GET /admin/theme-bindings` (fleet, store-scope'suz platform admin) + `GET/PUT
/admin/stores/:id/theme-binding` (per-store; platform-admin auth, THEME_STUDIO'dan bağımsız). Atama yeni
PUBLISHED versiyon üretir (immutable). Uyumsuz/bilinmeyen key → 409. (NOT: panel artık mağaza Düzenle
modalına gömülü DEĞİL — çok-mağazalı kontrol için kendi keşfedilebilir yüzeyinde.)
**Atama TAM temayı uygular:** layout preset + slot düzeni + temanın TOKEN paleti (renk/tipografi —
`resolveThemeDocumentForKey`, layout preset'in tokenPreset'inden). Yani atama yalnız düzeni değil GÖRÜNÜR
paleti de değiştirir; store admin'in Theme Studio'da ayarladığı token'ları ÜZERİNE YAZAR — önceki versiyon
ARCHIVED olduğundan **rollback ile geri alınabilir**, store admin sonra yeniden ince ayar yapabilir.

**Compatibility.** `themeApiVersion ≤ engine`, `commerce-os ≥ minimumCommerceVersion` (semver), bilinen
registry key, status ACTIVE, tokenSchemaVersion ≤ engine, slot variant allowlist. Uyumsuz PUBLISHED config →
storefront base fallback + Platform Admin warning (binding `compatible:false` + `issues`).

**Güvenlik.** H-1 korunur (typed token + customCss sanitize + render-time defense). Slot/variant allowlist;
custom package manifest strict server-side validate; client theme-key override YAPAMAZ (sunucu-otoriter);
cross-store izolasyon (storeId-scoped, cross-store 404); audit yalnız id (PII/secret yok).

**Worktree smoke (dev).** Kaynak image'a bake edilir (bind-mount yok) → değişikliği canlı görmek için
`infra/docker` compose'u WORKTREE'den build + `up -d api-gateway storefront-web`; migration ayrı
(`prisma migrate deploy`, DATABASE_URL=localhost:5432). Bkz. TD-158.

## Custom Theme Builder — smoke runbook (TODO-164A, enterprise-demo)

Ön koşul: tam stack ayakta (`infra/docker` compose WORKTREE'den build + `up -d api-gateway storefront-web
store-admin-web admin-web postgres redis`), `prisma migrate deploy` (yeni `20260730160000_custom_theme_builder`),
store-admin `NEXT_PUBLIC_STOREFRONT_URL` = storefront kökü (iframe önizleme için).

Yeni tema (store-admin → Tema Stüdyosu):
1. "Başlangıç noktası" = BASE_COMMERCE → ad ver → Oluştur.
2. Yapı: Header→CENTERED_BRAND, Product Card→EDITORIAL, PDP→GALLERY_FIRST, Hero→EDITORIAL_OVERLAY;
   liste kolonu=4, köşe ölçeği=rounded.
3. Stil: renk paleti + font preset değiştir.
4. Önizleme: "Gerçek vitrin" → desktop/tablet/mobile doğrula (iframe draft'ı gösterir).
Draft: Taslağı kaydet → production storefront DEĞİŞMEMELİ (yayın yok); iframe refresh → draft korunur.
Publish: Yayınla → `GET /public/stores/:slug/theme` yeni config döner (css + slots) → storefront GÖRÜNÜR
değişir; cache anında invalidate; başka store etkilenmez. Kritik kontrast düşükse `THEME_CONTRAST_FAILED` (409).
İkinci tema: FASHION_EDITORIAL'dan oluştur → farklı slot/token → publish → öncekinden BELİRGİN farklı.
Rollback: önceki versiyona geri yükle → Yayınla → görünüm geri döner.
Kopyala/Arşivle: Kopyala → yeni DRAFT kimlik (history yok); Arşivle → DRAFT arşivlenir, PUBLISHED 409.
Capability: THEME_STUDIO kapat → builder erişimi kapanır (ModuleGuard + 403), storefront base'e düşer, veri
korunur; re-enable → published tema geri gelir.
Tenant izolasyon: preview token yalnız kendi store+theme'ini açar; cross-store 401/base.

## TODO-165 — Fashion Vertical demo seed & smoke (enterprise-demo)

Fashion dikeyi yalnız `enterprise-demo`/`edm-store` için idempotent seed'lenir; `demo-store` ETKİLENMEZ.

```bash
# 1) Migration (additive; mevcut veri korunur)
DATABASE_URL=... pnpm --filter @commerce-os/db exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL=... pnpm --filter @commerce-os/db exec prisma migrate status --schema prisma/schema.prisma  # "up to date"

# 2) Fashion demo seed (idempotent; `fash-` prefix; edm-store scope guard; FASHION_VERTICAL=ENABLED)
DATABASE_URL=... node packages/db/scripts/fashion-demo-seed.mjs        # 3 kategori · 12 ürün · 155 varyant · 1 size chart
DATABASE_URL=... node packages/db/scripts/fashion-demo-seed.mjs --summary   # yalnız özet

# 3) Search read-model backfill (PLP fashion facetleri için ProductSearchDocument+ProductFacetValue)
pnpm --filter @commerce-os/search-service search:backfill --store edm-store   # (env: DATABASE_URL/REDIS_URL/INTERNAL_API_TOKEN/SESSION_SECRET)
```

- **Capability toggle:** `StoreModule(storeId=edm-store, moduleKey=FASHION_VERTICAL).state` = `ENABLED`/`DISABLED`.
  Gateway capability cache TTL ~30 sn → değişiklik ~30 sn içinde yansır (ya da servis restart). Kapalıyken public PDP
  `fashion=null`, `/public/stores/enterprise-demo/modules` → `FASHION_VERTICAL:false`; fashion admin uçları 403.
- **Smoke:** PDP `/{slug}` (renk swatch + beden + OOS disabled + beden tablosu), PLP `?category=moda-kadin-giyim`
  (renk/beden facet), guest checkout (`POST /public/stores/enterprise-demo/checkout`) → OrderLine fashion snapshot
  (selectedColor/selectedSize/sizeSystem/…) IMMUTABLE. Store-admin `/size-charts` + `/products/{id}` (10-adım wizard).

## TODO-165A — Brand & Fashion Taksonomi Governance: migration + bootstrap + reindex (ADR-253…258)

Brand + store-scoped fashion sözlükleri (ProductTaxonomyValue) + size-chart selector için 4 additive migration
+ 2 seviyeli (migration-time + runtime) bootstrap. Sıra ÖNEMLİ (her biri bir öncekine additive bağımlı).

```bash
# 1) Şema migration'ları (additive; mevcut veri korunur; sıra korunmalı)
DATABASE_URL=... pnpm --filter @commerce-os/db exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL=... pnpm --filter @commerce-os/db exec prisma migrate status --schema prisma/schema.prisma  # "up to date"
# Kapsanan migrationlar (bu sırayla):
#   20260801120000_add_brand_and_product_taxonomy            — Brand, ProductTaxonomyValue, AttributeOption.storeId/metadata
#                                                                + iki partial unique index (global/store)
#   20260801130000_backfill_product_brand                    — legacy Product.brand string'den Brand + Product.brandId backfill
#   20260801140000_backfill_fashion_taxonomy                 — FASHION_VERTICAL-enabled mağazalar için store-scoped
#                                                                AttributeOption + ProductTaxonomyValue backfill (migration-anı)
#   20260802120000_provision_platform_fashion_attribute_definitions — 11 PLATFORM fashion.* AttributeDefinition (idempotent,
#                                                                NOT-EXISTS) — HERHANGİ bir mağaza bootstrap edebilsin diye

# 2) Fashion demo seed (idempotent; edm-store scope; artık store-scoped governed model ile doğar)
DATABASE_URL=... node packages/db/scripts/fashion-demo-seed.mjs

# 3) ZORUNLU: Search read-model reindex — marka alanları (brandId/brandSlug/brandName) + taksonomi facet'leri
#    yalnız reindex SONRASI PLP'de görünür (seed/backfill kendisi search doc'u dokunmaz).
pnpm --filter @commerce-os/search-service search:backfill --store <storeId>   # tek mağaza
pnpm --filter @commerce-os/search-service search:backfill --all              # tüm mağazalar
# Kısayol (enterprise-demo dahil tüm demo mağazalar):
pnpm db:backfill-enterprise
```

- **Taksonomi bootstrap-on-enable (fail-closed):** `FASHION_VERTICAL` bir mağaza için DISABLED→ENABLED olunca
  gateway `ensureStoreTaxonomyDefaults(storeId)` çağırır — canonical fashion sözlükleri (sezon/koleksiyon/
  materyal/kalıp/…) store-scoped olarak oluşturulur. Bootstrap BAŞARISIZ olursa capability enable de başarısız
  olur (`TAXONOMY_BOOTSTRAP_FAILED`, compensating revert) — **"enabled ama sözlüksüz" durum asla sessizce
  oluşmaz**. Ek güvenlik ağı: taxonomy list/quick-create çağrıları da idempotent olarak aynı bootstrap'i tetikler
  (plan-seviyesi toplu enable gibi diğer enable yollarını self-heal eder — bkz. `docs/TECHNICAL_DEBT.md` TD-169).
  Re-run HER ZAMAN no-op'tur (mağaza-yönetilen değerler asla overwrite edilmez).
- **Kanonik güncelleme politikası:** kod-seviyesi registry'ye (`GOVERNED_TAXONOMY_CODES`) yeni bir kanonik değer
  eklenirse mevcut mağazalara sonraki bootstrap çağrısında (enable ya da lazy-list) ADDİTİF olarak ulaşır.
  Bir kanonik değerin **rename/kaldırılması hiçbir mağaza-yönetilen `ProductTaxonomyValue` satırını
  değiştirmez/silmez/arşivlemez** — governance başladıktan sonra o satır otoriterdir. Migration + runtime
  AYNI kod otoritesini (`taxonomy-map.ts` → `GOVERNED_TAXONOMY_CODES`) kullanır (parity-test korumalı) — yeni
  bir kanonik kod eklerken hem `canonical-attributes.ts` hem `taxonomy-map.ts` güncellenmeli.
- **Capability toggle:** `StoreModule(storeId, moduleKey=FASHION_VERTICAL).state`. Kapalıyken taksonomi/brand
  admin uçları (taksonomi `FASHION_VERTICAL`; Brand `CATALOG` — her zaman açık, kapanmaz) değişmeden erişilebilir/
  erişilemez kalır; mevcut veri korunur; tekrar açınca `ensureStoreTaxonomyDefaults` yeniden çalışır (no-op eğer
  zaten dolu).
- **Smoke:** storefront `/markalar` + `/markalar/[slug]` (brand facet), store-admin `/brands` (liste/create/ürün
  sayısı), `/product-dictionaries` (tip-sekme/usageCount/reorder), ürün formu Fashion Özellikleri (taxonomy
  select+quick-add) + Beden Tablosu adımı (searchable selector, raw ID yok). Detay + gerçek browser kanıtı:
  `docs/analysis/TODO-165A-product-data-governance.md` §8.

## TODO-165B — Katalog recovery runbook (kategori backfill + reindex, ADR-263)

Fashion kategorileri (`fash-cat-*`) storefront nav'da görünür ama boştu; ürünler eski `edm-cat-*` taksonomisine
bağlıydı. İdempotent seed-fix eski→fashion kategori eşlemesiyle ürünleri ikinci kategoriye de bağlar (eski
bağlantılar KORUNUR); ardından search read-model reindex edilir (`categoryIds/categorySlugs` snapshot'ları dolar).

**Sıra (enterprise-demo örneği):**

```bash
# 1) DB migration (slugLocked + categoryIds/categorySlugs + GIN index) — additive, immutable.
DATABASE_URL=... pnpm --filter @commerce-os/db db:deploy

# 2) Kategori assignment backfill — önce dry-run, sonra apply (idempotent; tekrar apply=0).
DATABASE_URL=... pnpm --filter @commerce-os/db db:backfill-fashion-categories -- --store=edm-store          # dry-run
DATABASE_URL=... pnpm --filter @commerce-os/db db:backfill-fashion-categories -- --store=edm-store --apply

# 3) Search read-model reindex (categoryIds/categorySlugs + fiyat/stok snapshot'ları tazelenir).
DATABASE_URL=... REDIS_URL=... INTERNAL_API_TOKEN=... SESSION_SECRET=... \
  pnpm --filter @commerce-os/search-service search:backfill --store edm-store
```

**Doğrulama (SQL):** `SELECT count(*) FROM "ProductSearchDocument" WHERE "storeId"='edm-store' AND status='ACTIVE'
AND "categorySlugs" && ARRAY['moda-ayakkabi']::text[];` → 0'dan büyük olmalı (recovery öncesi 0, sonrası 25).

**Not — normal akış:** Ürün/kategori assignment mutation'ları zaten reindex tetikler (yeni alanları doldurur).
Kategori/marka **rename** için store-seviyesi reindex otomatik tetiklenir (ADR-263). Full backfill YALNIZ recovery/
ilk-göç içindir; rutin gereksinim değildir. Backfill CLI config env ister (REDIS_URL/INTERNAL_API_TOKEN/SESSION_SECRET);
docker container'dan alınabilir (`docker exec <gw> printenv`).

## Final Enterprise UI Polish — Readiness Audit ops notları (2026-08-02)

Denetim sırasında doğrulanan ve operatörlerin bilmesi gereken durumlar (`main == origin/main == 83bcd8e`):

- **Deploy provenance:** Çalışan docker imajları merge commit'inden (2026-08-02) build edilmiş; host portları
  Storefront `:3000`, Platform Admin `:3001`, Store Admin `:3002`, API Gateway `:4000`.
- **Migration durumu (benign anomali):** `_prisma_migrations`'ta `20260724171728_add_sponsored_product_management`
  **iki kayıt** taşır — biri `rolled_back_at` dolu (tarihsel, `finished_at` NULL), biri başarılı. Prisma bunu
  UYGULANMIŞ sayar (tüm sponsored tabloları mevcut). `prisma migrate status` "1 rolled back" gösterebilir;
  **aksiyon gerekmez** — yeniden uygulama denemesi yok. Uygulanmış migration sayısı sağlıklı.
- **Sistem mağazası dışlama:** DB'de 3 mağaza var (demo-store, enterprise-demo, sistem `__theme-library__`);
  Platform Admin "Mağazalar" listesi/sayacı sistem mağazasını DIŞLAR (doğru → "Toplam mağaza 2").
- **Dashboard KPI düzeltmesi (TD-024):** Store Admin "Aktif ürün" sayısı artık gateway'e `status=ACTIVE`
  filtreli sayım çağrısıyla türetilir (ilk-sayfa filtre değil). `enterprise-demo` beklenen: Toplam 471 /
  Aktif 418 / Kategori 40 / Kritik stok 187. Doğrulama SQL:
  `SELECT status, count(*) FROM "Product" WHERE "storeId"='edm-store' GROUP BY status;`
- **Tek açık PROD BLOCKER:** PB-3 / TD-139 (offsite/otomatik backup depolama config'i) — altyapı, UI dışı.
- **Ana Sayfa yönetimi tek otorite (Final Polish §5):** Vitrin hero/slider'ının TEK yönetim yüzeyi "Ana Sayfa
  Deneyimi" (`/home`). Eski "Ana Sayfa" (`/hero`) ekranı kaldırıldı; route `/home`'a redirect eder (eski bookmark
  güvenli). `HeroSlide` tablosu + gateway `/hero-slides` ucu KORUNDU (veri silinmedi); yalnız store-admin yönetim
  yüzeyi + orphaned storefront reader + legacy BFF temizlendi.
- **UI worktree browser smoke:** docker MAIN'den çalışır; worktree değişikliklerini görmek için worktree'den
  `next dev --port 3100` + `STOREFRONT_DEMO_STORE_SLUG=enterprise-demo` (yoksa demo-store, ürün yok). `turbo build`
  ile `next dev` aynı app'te çakışır (`.next` clobber) — build sonrası dev'i `.next` silip yeniden başlat.
- **Platform Admin "Ayarlar" kaldırıldı (Final Polish §8):** İnert placeholder ekran nav'dan çıkarıldı; `/settings`
  route'u dashboard'a (`/`) redirect eder (eski bookmark güvenli). Gerçek platform ayarları geldiğinde route
  yeniden aktifleştirilebilir. Veri/işlev kaybı yok (ekran zaten disabled placeholder'dı).

## TODO-166 — Slug & Redirect Management (ADR-265)

Store-admin "SEO > Slug ve Yönlendirmeler" modülü. Mevcut motoru (SlugHistory/Redirect + SAF resolver)
yönetir; yeni motor kurmaz.

**Migration (additive, geriye-uyumlu):** `20260803120000_todo166_slug_redirect_admin`
- `SlugEntityType += BRAND`, yeni `RedirectOrigin` enum (AUTOMATIC/MANUAL), `Redirect.origin` (default AUTOMATIC)
  + `@@index([storeId, origin])`. Mevcut redirect satırları slug-değişiminden geldiği için AUTOMATIC varsayılanı doğru.
- Deploy: `pnpm --filter @commerce-os/db db:deploy` (docker imaj-içi migrate; host build gerekmez).

**Uçlar (hepsi store-scoped, `CATALOG` core-gate — always-on):**
- `GET/POST /stores/:storeId/seo/redirects` · `GET/PATCH/DELETE /stores/:storeId/seo/redirects/:id`
- `GET /stores/:storeId/seo/slugs` · `GET /stores/:storeId/seo/slugs/:entityType/:entityId`
- Public (değişmedi): `GET /public/stores/:slug/redirects` — storefront runtime bunu okur (60s TTL cache, TD-065).

**Davranış kuralları:**
- Otomatik redirect: SİLİNEMEZ / source-target-type düzenlenemez → yalnız aktif/pasif. Manuel: tam CRUD.
- Manuel doğrulama: source≠target, reserved/canonical-shadow, off-site (`//`,`://`) reddi, loop, canlı-entity-shadow,
  kaynak-tekilliği. Kaynak normalize edilir (query düşer); **hedef query'si korunur** (kategori `?category=`).
- Marka/ürün redirect'i path-tabanlı → runtime 301 tam çalışır. Kategori query-tabanlı → runtime 301 VERMEZ (TD-064).

**Smoke (worktree stack, enterprise-demo, paylaşımlı docker postgres):**
- Gateway :4100, store-admin :3100, storefront :3200 (host `next dev`, `API_GATEWAY_URL=http://localhost:4100`,
  `STORE_ADMIN_DEMO_STORE_SLUG=enterprise-demo`). Login: seed'lenmiş platform-admin hesabı (bkz. `packages/db/scripts/seed.mjs`).
- Ürün/marka slug PATCH → eski URL storefront'ta 301 (cache TTL ≤60s sonra). Kategori → 200 (PLP listelemesi, TD-064).

## TODO-167 Persistent Cart (Faz A) — operasyon notları (2026-08-03)

- **Migration (additive):** `20260803140000_todo167_persistent_cart` — CartStatus enum + Cart + CartLine +
  **partial unique** `Cart_active_customer_key ON (storeId,customerId) WHERE status='ACTIVE'`. Drop/backfill
  YOK (auth cart lazy oluşur; anon cart DB'ye girmez). `prisma migrate deploy` ile uygulanır.
- **Env (yeni; expiry sweep, hepsi default güvenli):** `CART_EXPIRY_SWEEP_ENABLED` (default **false** →
  no-op), `CART_EXPIRY_SWEEP_INTERVAL_SECONDS` (86400), `CART_EXPIRY_RETENTION_DAYS` (90, min 30),
  `CART_EXPIRY_SWEEP_BATCH_SIZE` (1000). Açıkça etkinleştirilmeden ASLA otomatik EXPIRE.
- **Sweep:** global (cross-store), advisory-locked, idempotent (conditional update); ACTIVE cart
  lastActivityAt < cutoff → EXPIRED. Hard-delete YOK (CONVERTED/MERGED/EXPIRED korunur; retention future).
- **Cross-device:** auth cart DB'de; mutation'lar `Cart.version` optimistic-concurrency (stale → 409
  CART_STALE, istemci güncel cart'ı gösterir).

## TODO-167 Persistent Cart — CLOSED & DEPLOYED (2026-08-03)

PR #165 merged (merge commit `0a602d2`). api-gateway + storefront-web rebuilt from main; migration
`20260803140000_todo167_persistent_cart` applied via `migrate deploy` (partial ACTIVE index verified live).
Post-deploy smoke 20/20 PASS (deployed gateway :4000): cart mechanics · CART_STALE concurrency · login merge ·
checkout DB-cart authority · convert-on-paid (settlement) · failed-payment→ACTIVE · DB invariants. Temp fixtures
FK-safe cleaned + inventory restored; enterprise-demo pristine (473 products / 9 orders unchanged). ADR-266
ACCEPTED. **TODO-168 (Cart Change Awareness) UNBLOCKED.** TD-174 open future; cart hard-delete/anonymization
future; cross-device Cart-Change acknowledgement = TODO-168 scope.

## TODO-168 Cart Change Awareness — CLOSED & DEPLOYED (2026-08-03)

PR #166 MERGED (merge `65c7ca1`). api-gateway + storefront-web `docker compose build` + `up -d --no-deps`
(store-admin/admin/worker/postgres/redis DOKUNULMADI, volume'lara dokunulmadı). Migration
`20260803150000_todo168_cart_change_awareness` → `migrate deploy` (prod commerce_os; "Database schema is up
to date"). Post-deploy smoke deployed gateway :4000'de prod-safe (anon changeContext ile DB mutasyonu YOK;
BLOCKING için demo-store stok geçici 0→25 geri alındı): INFO/WARN/409-CART_CHANGED/ack/back-in-stock/BLOCKING/
analytics-dedupe/auth-ack-401/storefront-200 PASS. Test analytics kayıtları silindi; enterprise-demo PRISTINE.

## TODO-168 Cart Change Awareness — operasyon notları (2026-08-03)

- **Yeni env YOK.** Değişiklik motoru cart okuma yolunda çalışır (ek servis yok). Analytics ingest
  (`POST /public/stores/:slug/cart-change-events`) best-effort: bot/prefetch elenir, IP-hash rate-limit
  (sabit 240/60s), her yol 200 (ölçüm hatası UX'i etkilemez). Meta imza anahtarı = mevcut
  `STOREFRONT_CART_SECRET` (ayrı anahtar yok).
- **Migration:** `20260803150000_todo168_cart_change_awareness` — additive (CartLine snapshot kolonları +
  `CartChangeAck` + `CartChangeEvent`); `migrate deploy` ile uygulanır, drop/backfill YOK. Mevcut cart'lar
  ilk güvenilir resolve'da baseline kazanır (sahte geçmiş yok).
- **Anon meta cookie** `commerce_os_cart_meta`: imzalı/versiyonlu/byte-bütçeli (<3800 B). Aşımda önce en
  eski INFO/senkron snapshot, sonra en eski ack budanır; WARN/BLOCKING snapshot korunur; **cart kalemleri
  asla düşürülmez**. Bozuk/eski cookie → fail-safe (baseline yeniden kurulur; birincil sepet bozulmaz).
- **Ack** cart line'ları mutasyona uğratmaz (version bump YOK) → cross-device DB'den görünür; yeni fiyat
  hareketi yeni fingerprint → panel tekrar gelir. `CartChangeEvent` `(storeId,dedupeKey)` idempotent;
  **retention worker = future** (tablo/ingest hazır, otomatik DELETE yok → default güvenli).
- **Checkout kodları:** WARN → `409 CART_CHANGED` (gövdede güncel change-enriched cart; storefront sepete
  yönlendirir, ham kod gösterilmez); BLOCKING → mevcut `409 CART_NOT_READY`.

## BUG-CART-002 smoke runbook — PDP availability / cart badge / line-selection

Worktree kodunu deployed stack'i bozmadan doğrulamak için AYRI portlarda yerel dev sunucuları + mevcut
Postgres (enterprise-demo seeded). Şema değişmedi → migration gerekmez.

```bash
# node_modules yoksa (worktree gotcha): pnpm install --prefer-offline && pnpm db:generate && pnpm build
# 1) worktree gateway :4100 (deployed :4000'e dokunma) — DB=localhost:5432
set -a && . ./.env.example && set +a
export API_GATEWAY_PORT=4100 SHIPMENT_SYNC_ENABLED=false MEDIA_STORAGE_DIR=/tmp/smoke-uploads MEDIA_PUBLIC_BASE_URL=''
pnpm --filter @commerce-os/api-gateway dev   # health: curl localhost:4100/health

# 2) worktree storefront :3100 → gateway :4100, enterprise-demo
set -a && . ./.env.example && set +a
export API_GATEWAY_URL=http://localhost:4100 STOREFRONT_DEMO_STORE_SLUG=enterprise-demo
(cd apps/storefront-web && ./node_modules/.bin/next dev --port 3100)
```

**Fail-open kanıtı (OLD :4000 vs NEW :4100):** aynı ürünün detay ucunda bir varyant OLD'da
`available:null,inStock:true` (bounded fail-open), NEW'de gerçek `available:N`. OOS örnek varyant bul:
`curl :4100/public/stores/enterprise-demo/products/<slug>` → `inStock:false` olan varyant.

**Kontrol listesi (§10):** (A) OOS varyant PDP'de disabled+üstü-çizili+aria "… — Tükendi", CTA "Tükendi";
add reddedilir, toast yok, badge değişmez. (B) stoklu add → badge refresh'siz artar + "Sepete eklendi".
(C) sepet: deselect → "0 ürün / Kargo — / ₺0,00 / checkout disabled", re-select geri döner; OOS satır
toplama girmez. Boyutlar 375/768/1024/1440.

## Finance Reports smoke runbook (ADR-268 · Finans > Raporlar)

**Amaç:** izole mağaza fixture'ıyla finansal raporların DB gerçeğiyle birebir uyuştuğunu doğrulamak.

**Fixture (izole store):** normal PAID · indirimli PAID · kargolu · ücretsiz-kargo · CANCELLED · UNPAID
siparişler; farklı ürün/kategori/marka; iki ödeme yöntemi (or. CARD + BANK_TRANSFER). Refund akışı VARSA
kısmi/tam refund; YOKSA yalnız iade adedi doğrulanır (tutar raporlanmaz). Siparişler PLACED (placedAt set) +
OrderLine KDV/maliyet snapshot'lı olmalı (kâr/KDV kapsamı için).

**Adımlar:** store-admin'e giriş → sol menü **Finans > Raporlar**. (1) **Satış Özeti:** KPI kartları (Toplam
gelir / Net ürün satışı / Brüt satış / İndirim / Kargo / KDV / Sipariş / Ödenen / Ort. sepet / Satılan adet /
İptal / İadeli adet / Brüt&Net kâr) fixture toplamıyla eşleşmeli; İadeli kart "İade tutarı altyapısı henüz yok"
ipucu; günlük çubuk grafik + günlük tablo; önceki-dönem rozetleri (▲/▼ + %; previous=0 → "yeni"). (2) **Dönem
filtresi** (bugün/son7/son30/buAy/geçenAy/buYıl/özel) + **para birimi** seçimi URL'de korunur (reload sonrası
kalır). (3) **Ürün Performansı / Kategori & Marka / Ödeme / İndirim** sekmeleri: satır toplamları fixture ile
uyumlu; kâr yalnız tam maliyet-kapsamlı satırda dolu. (4) **CSV indir** (her sekme): dosya UTF-8 BOM'lu, TR
Excel'de düzgün açılır, `=`/`+` ile başlayan metin nötrlenir. **Mutabakat:** özet Toplam gelir = günlük tablo
Σ = ürün kırılımı net ile tutarlı; CANCELLED satışa girmez; UNPAID tahsilata girmez.

**Boyutlar:** 375 / 768 / 1024 / 1440. **Temizlik:** smoke sonunda fixture store + siparişleri sil.

## Returns Management smoke runbook (ADR-269 · TODO-169)

**Amaç:** izole store/customer/order ile müşteri iade akışı + admin operasyonu + RefundIntent (PENDING, finansa
dokunmaz) doğrulaması. Servisler: worktree gateway (:4100) + storefront (:3100) + store-admin, `enterprise-demo`
env; DB'ye migration `20260804090000_todo169_returns_management_foundation` uygulanmış olmalı (`prisma migrate deploy`).

**Fixture (izole):** bir müşteri + DELIVERED bir sipariş (≥1 gönderi `ShipmentStatus.DELIVERED`, `deliveredAt`
set — manuel durum route'undan ilerletilebilir), çok satırlı; ayrıca (a) reddedilecek talep, (b) süresi geçmiş
sipariş (deliveredAt eski), (c) iptal edilecek talep, (d) replacement talebi için stoklu satır.

**Müşteri akışı:** Siparişlerim → DELIVERED sipariş → "Ürünleri iade et" → iade edilebilir tarih + kalan adet
görünür → bir ürün seç + adet → neden seç (kusurlu → açıklama ZORUNLU) → foto ekle → orijinal ödeme yöntemini seç
→ talep gönder → referans no + takip ekranı. İkinci kez aynı satır için kalan uygunluk DOĞRU düşmeli.

**Admin akışı:** `Siparişler > İadeler` liste → detay → incelemeye al → kısmi onay → (müşteri durumu görsün) →
(müşteri) tracking gir → teslim alındı → inceleme sonucu + restock kararı → RESTOCK_AS_SELLABLE'da stok idempotent
artar → refund pending → **RefundIntent PENDING oluşur, GERÇEK refund YAPILMAZ, finans raporu DEĞİŞMEZ**.

**Ek senaryolar:** reddedilen talep (zorunlu neden) · süresi geçmiş sipariş ("İade süresi doldu") · müşteri iptali
(yalnız onay öncesi) · replacement (stok/varyant mevcutsa). **Responsive:** 375 / 768 / 1024 / 1440. Smoke sonunda
fixture FK-güvenli temizlenir (RefundIntent → ReturnStatusHistory → ReturnAttachment+MediaAsset → ReturnItem →
ReturnRequest → ReturnNumberCounter; sonra order/customer/shipment).

**Tenant izolasyon kontrolü:** başka müşteri/başka store iade no → 404 (403 değil); attachment yalnız sahip/store
admin stream eder; public `/media/*/returns/*` → 404.

**TODO-169.1 Order-integration recovery smoke (2026-08-04):** izole 3-ürün DELIVERED sipariş (deliveredAt = now−2gün)
ile ek olarak doğrula — (a) **Siparişlerim** kartında iade son tarihi (`… tarihine kadar iade edilebilir`) + teslim
rozeti KORUNUR; (b) bir ürün için iade oluştur → kart AYRI iade rozeti gösterir (`1 ürün için iade talebi` →
onay sonrası `1 ürün iade onaylandı`) + "İade durumunu görüntüle"; (c) **sipariş detayı**nda `İadeler` bölümü;
(d) admin iade detayında ürün **görseli** (boş değil; yoksa monogram); (e) admin onayı → RefundIntent PENDING →
müşteri + admin sipariş özetinde **pending finansal etki** ("beklenen net" / "Para iadesi bekleniyor · Henüz
tahsilattan düşülmedi") görünür ama **gerçekleşen iade `—`** ve Financial Reporting revenue DEĞİŞMEZ; (f) sihirbaz
özet CTA'sı **320/375/1024**'te taşmaz (tam-genişlik `İade talebini gönder` + `Geri`); (g) review paneli açıkken
iade CTA action-bar'da yer değiştirmez. Ortak `returns/projection.ts` tek otorite (customer list/detail + admin
order detail + eligibility; customer list fail-open). Not: worktree smoke için gateway ayrı portta (`:4100`) docker
postgres'e bağlanır ve media docker volume'undan kopyalanır; fixture (SMOKE- önekli customer/order + geçici platform
session) FK-güvenli temizlenir. **Responsive:** 320 / 375 / 768 / 1024 / 1440.

## Pre-Refund UX Recovery smoke runbook (ADR-270) — 2026-08-04

Worktree stack (deployed :3000/:3002/:4000 dokunulmadan shifted portlar; shared postgres :5432 enterprise-demo):

```bash
# Gateway :4100 — bilinen SESSION_SECRET (session forge için), postgres :5432
set -a; . /tmp/smoke.env; set +a   # DATABASE_URL :5432, SESSION_SECRET=..., API_GATEWAY_PORT=4100, SHIPMENT_SYNC_ENABLED=false
pnpm --filter @commerce-os/api-gateway exec tsx src/main.ts    # curl :4100/health
# Storefront :3100 → :4100
API_GATEWAY_URL=http://localhost:4100 STOREFRONT_DEMO_STORE_SLUG=enterprise-demo \
  pnpm --filter @commerce-os/storefront-web exec next dev --port 3100
# Store-admin :3202 → :4100
API_GATEWAY_URL=http://localhost:4100 STORE_ADMIN_DEMO_STORE_SLUG=enterprise-demo SESSION_SECRET=<same> \
  pnpm --filter @commerce-os/store-admin-web exec next dev --port 3202
```

- **Auth (forge):** `PlatformSession`/`CustomerSession` satırı: `tokenHash = sha256("${token}.${SESSION_SECRET}")`;
  cookie `commerce_os_store_admin_session` (Bearer) / `commerce_os_customer_session` (`x-customer-session`).
  **TUZAK:** storefront login redirect'i customer cookie'sini **httpOnly** boş cookie ile temizler → `document.cookie`
  ile forge EDİLEMEZ; gerçek login gerekir (`CustomerCredential` upsert + UI login). `ON CONFLICT (customerId)`
  upsert mevcut seed credential'ının hash'ini ezer (bkz. TD-UX-6) → smoke sonrası `pnpm db:reseed-enterprise`.
- **Doğrulanan (PASS):** pending-work endpoint (reviews 3/returns actionable 1); CTA → `/account/returns/R000001`;
  order-detail `#returns` focus = `returns-heading`; sidebar rozet 3/1 erişilebilir ad; approve review → badge
  3→2; approve return → `AWAITING_SHIPMENT` (append-only history); customer tracking → `RETURN_SHIPPED`
  (`shippedAt` server-side); duplicate 409; foreign 401/404; admin "Müşteri tarafından gönderildi";
  "Teslim alındı"→`RECEIVED`+`receivedAt`; responsive 375/768/1024/1440 taşmasız.
- **Temizlik:** reviews→PENDING, iade R000001→APPROVED, forge session + smoke history sil, server'ları kapat.

### Browser-smoke credential güvenliği (KALICI KURAL — TD-UX-6)

Bir browser smoke **MEVCUT (gerçek/seed) bir müşterinin parolasını DEĞİŞTİREMEZ**. Zorunlu desen:

- **İzole `smk_` fixture müşteri** oluştur; login smoke'unu O müşteri ile yap — gerçek/seed müşteriye dokunma.
- Credential yazan her yardımcı önce `assertSmokeCredentialTarget({customerId,email})` çağırır
  (`packages/db/scripts/smoke-credential-safety.ts`) → hedef `smk_`/`smoke-`/`rev-`/`test-` öneki değilse
  **fail-closed** atar (gerçek credential ASLA ezilemez).
- Zorunlu ise `withSmokeCredential(deps, target, hash, body)`: mutasyon öncesi **snapshot**, `try/finally`'de
  **birebir restore** (yoksa oluşturduğu fixture credential'ı siler). Body hata atsa da finally çalışır; restore
  hatası yayılır → **cleanup başarısız = smoke başarısız**.
- Fixture teardown FK-güvenli (bağımlılık sırasıyla): `CustomerSession`/`CustomerCredential` →
  `ReturnStatusHistory`/`RefundIntent` → `ReturnItem`/`ReturnAttachment` → `ReturnRequest` → `Order` → `Customer`.
- **TUZAK (yaşandı):** `CustomerCredential.upsert({ where: { customerId } })` mevcut satırı `ON CONFLICT` ile
  UPDATE eder → gerçek müşterinin hash'ini ezer. `smk_` müşteri + guard bunu yapısal olarak imkânsız kılar.

Guard birim testleri: `packages/db/test/smoke-credential-safety.test.ts` (7 test; gerçek (non-smoke) bir kimlik
fail-closed reddedilir, body-hata-restore, snapshot-yoksa-sil).

## Unified Session Policy (ADR-271) — env & runbook

Oturum ömrü ARTIK `SESSION_TTL_SECONDS`/`CUSTOMER_SESSION_TTL_SECONDS` OTORİTESİNDE DEĞİL; tek policy kaynağından
(`packages/config/src/session-policy.ts` → `resolveSessionPolicy`) türer. Aşağıdaki env'ler yalnız varsayılanı
override eder (hepsi opsiyonel/TD-036 toleranslı; boş → varsayılan). **SUNUCU-otoriter; istemci gönderemez.**

| Env | Varsayılan | Anlam |
|---|---|---|
| `SESSION_IDLE_TIMEOUT_SECONDS` | 1800 (30 dk) | remember-off idle penceresi |
| `SESSION_ABSOLUTE_EXPIRY_SECONDS` | 28800 (8 saat) | remember-off mutlak tavan |
| `SESSION_REMEMBER_IDLE_TIMEOUT_SECONDS` | 604800 (7 g) | remember-on idle penceresi |
| `SESSION_REMEMBER_ABSOLUTE_EXPIRY_SECONDS` | 2592000 (30 g) | remember-on mutlak tavan |
| `SESSION_WARNING_LEAD_SECONDS` | 300 (5 dk) | idle bitimine kaç sn kala uyarı |
| `SESSION_ACTIVITY_THROTTLE_SECONDS` | 300 (5 dk) | `lastActivityAt` DB yazma throttle. **S3:** 0/negatif reddedilir; **production'da min 30 sn** (aksi `loadConfig` fail-fast). <30 yalnız dev/test. |

**Cookie güvenliği (S5).** `ADMIN_COOKIE_SECURE` (Platform + Store Admin session & CSRF) ve `STOREFRONT_COOKIE_SECURE`
(müşteri cookie) ortak güvenli parser'dan geçer: **unset/boş → production'da `Secure=true`** (default); `"true"`→true;
`"false"`/geçersiz **production'da fail-fast** (insecure cookie üretilemez) — dev/test'te `"false"` kabul edilir.
`ADMIN_COOKIE_SAME_SITE` (`strict`/`lax`; default `lax`). Session ve CSRF cookie AYNI policy'yi kullanır; set/clear
seçenekleri eşleşir. Yani prod'da bu env'leri **unset bırakmak güvenlidir** (otomatik Secure); yalnız local http
smoke için `NODE_ENV=development` (Secure=false).

**Migration:** `20260804160000_adr271_unified_session_policy` — additive (`lastActivityAt`, `absoluteExpiresAt?`,
`rememberMe`, `rotatedFromSessionId` her iki oturum tablosuna), `IF NOT EXISTS` ile replay-safe, mevcut satırları
backfill eder (`absoluteExpiresAt=expiresAt`, `lastActivityAt=updatedAt`, `rememberMe=false`). Deploy sırasında
`prisma migrate deploy` yeterli; ADR-271-öncesi süreçlerle aynı DB'de çakışmaz (yeni kolonlar default/nullable).

**⚠️ ZORUNLU deploy sırası — migrate-before-app (ADR-271 §8 hardening).** ADR-271 migration'ları (temel
`20260804160000` + follow-up hardening `20260804170000_adr271_returns_session_hardening`) **uygulama boot'undan ÖNCE**
uygulanmalı. **old-app/new-schema GÜVENLİDİR** (tüm değişiklikler additive; eski app yeni kolonları görmezden gelir);
**new-app/old-schema DESTEKLENMEZ** (yeni app `policyVersion`/hardening kolonlarını bekler). Sıra: önce
`prisma migrate deploy`, sonra yeni imajları recreate et. Follow-up migration `20260804170000` **fast-default**
kullanır (`ADD COLUMN … DEFAULT` + `SET DEFAULT` → tablo rewrite/koşulsuz UPDATE YOK, kilit riski minimal). **Ancak**
temel §7 migration'ının backfill'i (`UPDATE … SET lastActivityAt/rememberMe`) koşulsuz full-table `UPDATE`'tir ve
büyük `PlatformSession`/`CustomerSession` tablosunda kilit yapabilir → **düşük trafik / maintenance penceresinde
deploy edin** (TD-185). M1 `policyVersion` cutover sayesinde deploy anında mevcut uzun oturumlar 30 dk'ya
idle-collapse OLMAZ (legacy=absolute-only, ilk aktivitede native'e terfi).

**Gerçek-DB testleri:** `returns-lifecycle.integration.test.ts` ve `session-legacy.integration.test.ts`
`commerce_os_test` veritabanına `DATABASE_URL` set edilerek koşar (R1–R5/P1-P2 ve legacy policy invariant'ları);
CI'da (DB yok) otomatik SKIP edilir. Örn. `DATABASE_URL=postgres://…/commerce_os_test pnpm --filter
@commerce-os/api-gateway test`.

**Oturum smoke (test-clock override — gerçek 30 dk BEKLEME YOK):** worktree gateway'i küçültülmüş pencerelerle
başlat, ör.:
```
SESSION_IDLE_TIMEOUT_SECONDS=45 SESSION_WARNING_LEAD_SECONDS=25 SESSION_ABSOLUTE_EXPIRY_SECONDS=120 \
SESSION_ACTIVITY_THROTTLE_SECONDS=5 CUSTOMER_OTP_DEV_CODE=424242 API_GATEWAY_PORT=4100 \
pnpm --filter @commerce-os/api-gateway dev
```
Next app'leri `API_GATEWAY_URL=http://localhost:4100` ile ayrı portlarda (3100/3101/3102) koştur; login
(remember-me kapalı) → ~20 sn hareketsiz → warning modal + geri sayım → "Oturumu uzat"/idle-expiry → login +
"Oturumunuz sona erdi..." mesajı; ikinci sekmede logout senkronu. Platform admin: `platform-admin@example.local`
/ `local-admin-password`.

**Güvenlik notu:** session token yalnız httpOnly cookie'dedir (JS/localStorage'da YOK). Çok-sekme senkron
localStorage anahtarı `*_session_sync` yalnız mesaj tipi (`logout`/`expired`/`extended`) taşır, ASLA token.

## TODO-170 Refund Ledger & Payment Reversal (ADR-272) — operasyon notları (2026-08-05)

**⚠️ ZORUNLU deploy sırası — migrate-before-app.** Additive migration
`20260805100000_todo170_refund_ledger_payment_reversal` (yeni `OrderRefund`/`OrderRefundEvent` tabloları + enum'lar
+ `RefundIntentStatus ADD VALUE 'CONSUMED'`) **uygulama boot'undan ÖNCE** `prisma migrate deploy` ile uygulanır.
old-app/new-schema GÜVENLİ (tümü additive; eski app yeni tabloları/enum değerini görmezden gelir);
new-app/old-schema DESTEKLENMEZ (yeni app `OrderRefund` + `CONSUMED` bekler). drop/rename YOK; PENDING intent'lerden
**otomatik OrderRefund üretilmez**; **sahte başarılı refund backfill EDİLMEZ** (fresh replay + mevcut DB upgrade aynı
sonucu verir).

```
DATABASE_URL=... pnpm --filter @commerce-os/db exec prisma migrate deploy --schema prisma/schema.prisma
```

**Gözlemlenebilirlik / metrikler (yapılandırılmış audit + event ledger).** Para hareketi `OrderRefund` +
append-only `OrderRefundEvent` (type: REQUESTED/PROVIDER_SUBMITTED/PROCESSING/SUCCEEDED/FAILED/CANCELLED/RETRY/
MANUAL_COMPLETED/RECONCILED/STATUS_QUERIED/DUPLICATE_CALLBACK) ile denetlenebilir. Türetilebilir metrikler
(store-scoped): refund requested (event REQUESTED), succeeded/failed (SUCCEEDED/FAILED), manual refund count
(MANUAL_COMPLETED), duplicate idempotency/callback (DUPLICATE_CALLBACK), reconciliation mismatch (STATUS_QUERIED
metadata.unknown). Admin aksiyonları ayrıca `AuditLog`'a yazılır (CREATE/UPDATE + `metadata.action=refund.*`).
**PII/secret güvenliği:** token, provider secret, banka detayı, maskelenmemiş PAN **ASLA loglanmaz**; müşteri
yüzeyinde ham provider hata kodu gösterilmez (yalnız admin, kontrollü).

**Yetki:** refund başlat/yenile/tekrar/iptal → store platform admin; **manuel iade tamamlama → SUPER_ADMIN**
(ayrı güçlü yetki; banka/reference + açıklama zorunlu). Cross-store 404.

**Refund smoke runbook (MOCK).** İzole store/customer/PAID-MOCK-order/return(REFUND_PENDING)/RefundIntent(PENDING)
fixture; admin "Para iadesini başlat" → OrderRefund PROCESSING→SUCCEEDED → ReturnRequest COMPLETED → müşteri "Para
iadesi tamamlandı" → order paymentStatus REFUNDED/PARTIALLY_REFUNDED → Finance net düşüş (`refundAmountsSupported=true`).
MOCK senaryoları `PaymentAttempt.scenario` konvansiyonuyla kontrol edilir (MOCK-only): `refund_failure` (FAILED+retry),
`refund_async`/`refund_timeout` (PROCESSING→refresh reconcile), `refund_duplicate` (DUPLICATE_CALLBACK). Manuel akış
için MANUAL/offline (banka havalesi) attempt → "Manuel iade tamamlandı" (SUPER_ADMIN). Fixture temizliği: `store.delete`
cascade. Gerçek-DB integration testi: `DATABASE_URL=…/commerce_os_test pnpm --filter @commerce-os/api-gateway exec
vitest run test/refunds-ledger.integration.test.ts` (16 test; CI'da DB yoksa SKIP).

## Return Decision Flow Simplification — Faz 1 (2026-08-06) — operasyon notları (IMPLEMENTED / NOT SHIPPED)

**Durum:** kod tamamlandı, tüm review temiz, 2396 test yeşil. **Commit/push/PR/merge/deploy YOK** — bu
bölüm bir sonraki deploy turu için hazırlık notudur, henüz canlıya YANSIMADI. **Migration YOK** (K2 —
`reviewStartedAt` kolonu yerine append-only history event).

**Davranış değişikliği (deploy edildiğinde):**
- Admin artık `REFUND_PENDING`/`COMPLETED` durumundaki bir iadeyi "Kapat" ile refund'suz kapatamaz —
  `POST /stores/:storeId/returns/:returnId/transition {targetStatus:"CLOSED"}` bu iki kaynak durumdan
  ADMIN aktörüne **409 `REFUND_UNSETTLED`** döner ("Bu iade, para iadesi tamamlanmadan kapatılamaz.
  'İadeyi yap' ile iadeyi tamamlayın."). `REPLACEMENT_PENDING → CLOSED` admin arşivleme yolu AÇIK kalır
  (replacement bu fazda refund invariant'ına tabi değil).
- Refund artık **REFUND_PENDING'te manuel/retry refund panelinden** yürütülür (Store-Admin iade detayı,
  ADR-272 refund paneli — başlat/durumu yenile/tekrar dene/manuel tamamla/iptal) veya inceleme ekranındaki
  tek "İadeyi yap" aksiyonuyla (kabul edilen kalem/adet üzerinden, `POST
  /stores/:storeId/returns/:returnId/inspect-decision`) otomatik tetiklenir.
- `COMPLETED` terminaldir; yeni return'ler artık `CLOSED` ÜRETMEZ (yalnız SUCCEEDED `OrderRefund` refund
  çözümünü tamamlar → return `COMPLETED`). Legacy `CLOSED` kayıtlar (bu revizyondan önce üretilmiş)
  DOKUNULMADAN okunur kalır — geriye dönük veri düzeltmesi YOK.
- Admin `REQUESTED` durumunda artık doğrudan Onayla/Reddet görür ("İncelemeye al" ara adımı kaldırıldı);
  ilk gerçek karar anında idempotent `RETURN_REVIEW_STARTED` history izi otomatik yazılır (ek admin aksiyonu
  gerekmez, UI'da görünmez — yalnız audit/`ReturnStatusHistory`).
- Sipariş detayı Ücret Özeti'nde, `succeededRefundMinor > 0` olan siparişlerde "Gerçekleşen iade (−)" ve
  "İade sonrası net tahsilat" satırları görünür (kaynak: `GET
  /stores/:storeId/orders/:orderId/refund-context`, daha önce yazılmış ama tüketilmiyordu).

**Deploy sırası:** migration YOK → sıradan kod deploy'u (api-gateway + store-admin-web). Geriye dönük
uyumlu: eski client yeni `REFUND_UNSETTLED` kodunu tanımasa da HTTP 409 olarak görür (var olan hata
işleme yolu genel 409 mesajına düşer). `RETURN_REVIEW_STARTED` event'i mevcut `ReturnStatusHistory`
şemasına (kolon eklemeden) yazıldığından eski/yeni app aynı satırları okuyabilir.

**Smoke (izole çok-kalemli fixture, deploy sonrası doğrulanacak):** REQUESTED doğrudan Onayla/Reddet ·
approve→otomatik AWAITING_SHIPMENT · inspection'da bir quantity accept + bir quantity reject → "İadeyi
yap" → COMPLETED · `REFUND_PENDING`'de "Kapat" butonu YOK (backend 409 doğrulanır) · order summary'de
refund satırları · Financial Reporting net düşüş değişmedi (`refundAmountsSupported=true` zaten korunur).
Detay + tam plan: `docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md` §9 + `docs/analysis/RETURNS-FLOW-PHASE1-PLAN.md`
Gate 5.
