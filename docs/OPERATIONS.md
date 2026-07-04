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
