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
