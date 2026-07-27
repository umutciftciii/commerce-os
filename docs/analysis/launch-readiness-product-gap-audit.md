# Launch Readiness & Product Gap Audit

- **Tarih:** 2026-07-27
- **Kapsam:** Production launch öncesi gerçek eksik/risk envanteri (yalnız analiz — kod/migration/UI değişikliği YOK).
- **Yöntem:** `main` HEAD `03042f3` üzerinde 6 paralel salt-okunur kod keşfi + docs↔kod tutarlılık çapraz-kontrolü.
  Load-bearing her iddia doküman metnine değil **merge edilmiş koda** karşı doğrulandı.
- **Not (git durumu):** Bu tur öncesi kalan worktree/branch cleanup güvenli tamamlandı —
  `operations-ui-smoke-test-3fa4a9` worktree'si `git worktree remove` ile kaldırıldı, merge edilmiş
  `claude/operations-ui-smoke-test-3fa4a9` branch'i `git branch -d` ile silindi, `main == origin/main == 03042f3`
  doğrulandı. Bu görevde commit/push/PR/merge/deploy YAPILMADI.

---

## 1. Launch readiness özeti

Commerce OS'un **çekirdek ticaret motoru production-kalite**: gerçek scrypt hash'li session'lar (customer +
platform), sunucu-otoriter sepet/fiyat/kupon, store-scoped tenant izolasyonu, CSRF, hash'li credential/OTP/token,
tek-warehouse için `SELECT … FOR UPDATE` oversell kilidi, monotonik ödeme durum makinesi, additive-only migration
disiplini + ADR-108 seed guard'ları, PII-suz audit, dağıtık advisory-lock'lu ticari/retention job'ları. Bu
katmanlar denetimde **"handled"** çıktı ve çoğu, gerçek 2026-07-23 veri-kaybı olayına (TD-116) tepki olarak
sertleştirilmiş.

Ancak platform **gerçek para tahsil eden bir mağaza için henüz hazır değil**. Launch'ı bloklayan iki küme var:

1. **Ödeme otantikliği** — webhook imza doğrulaması placeholder; sipariş PAID geçişi `signatureValid`'e
   gate'lenmiyor ve store client'ın gönderdiği `body.storeId`'den çözülüyor. Gerçek bir ödeme sağlayıcısı
   açılmadan kapatılmalı.
2. **Felaket kurtarma** — backup gerçek (`pg_dump`) ama **manuel/tek-host/zamanlanmamış/offsite-siz**; ve
   backup'ı geri yükleyen **test edilmiş bir restore yolu YOK** (`db:restore-enterprise` yalnız demo dataset'i
   yeniden seed'liyor, gerçek sipariş/müşteri verisini kurtarmaz).

Bunların yanında iki HIGH güvenlik/finans boşluğu (tema token XSS sink'i, revenue-share currency guard eksikliği)
ve bir dizi verification/hardening borcu var. **Gerçek merchant onboarding** için ürün/varyant toplu import'un
olmayışı (TD-117) go-to-market segmentine bağlı bir dış karardır.

**Sonuç:** Demo/pilot (MOCK ödeme, tek mağaza, güvenilir operatör) için hazıra yakın. Gerçek para + gerçek
merchant verisi + çok-operatör için önce PROD BLOCKER kümesi + HIGH güvenlik/finans kalemleri kapatılmalı.

---

## 2. PROD BLOCKER listesi

### PB-1 — Ödeme webhook'u imza doğrulamadan siparişi PAID yapıyor (client-supplied storeId + bilinen attemptId)
- **Kanıt:** `apps/api-gateway/src/server.ts:9069-9169` — `POST /payments/webhooks/:provider` auth'suz, feature-flag'siz;
  store `body.storeId`'den çözülüyor (`:9078`); `result.signatureValid` yalnız metadata'ya yazılıyor (`:9102`)
  ama sipariş geçişi (`recordPaymentAttemptOutcome … orderPaymentStatus:"PAID"`, `:9119-9146`) buna
  **gate'lenmiyor**. Credentials `webhookSecret: null` (`:9092`); `verifyWebhookSignature(){ return true }`
  (`apps/api-gateway/src/payments/adapters/contracts/stripe.ts:146-149`). `attemptId` müşteriye payment-state
  yanıtında dönüyor (`server.ts:8896-8899`) → müşteri **kendi** siparişini bedavaya PAID işaretleyebilir.
  Monotonik guard (`:9116`) yalnız PAID sonrası geri-çevirmeyi engeller, PAID'e sahte ilerlemeyi DEĞİL.
- **Bugünkü sınır:** canlı charge bu fazda kapalı (MOCK-only public pay); yine de endpoint public ve her
  sağlayıcı için outcome uygular. In-code placeholder olarak işaretli (`server.ts:9087`, TODO-071/TODO-159F).
- **Gerekli:** `signatureValid` zorunlu kılınmalı + store, `body.storeId` yerine **doğrulanmış attempt**'ten
  türetilmeli. Gerçek ödeme sağlayıcısı (bkz. EX-1) açılmadan ÖNCE. **Class: PROD BLOCKER (gerçek-ödeme kapısı).**

### PB-2 — Test edilmiş DB restore yolu YOK (gerçek işlem verisi kurtarılamaz)
- **Kanıt:** `package.json:30` — `db:restore-enterprise` = `db:backup && db:seed-enterprise &&
  db:backfill-enterprise && db:verify-enterprise` → **demo kataloğunu yeniden üretir**, `.sql.gz` dump'ını
  okumaz/geri yüklemez. `infra/scripts/` altında `*restore*` script'i yok. Bir `db:backup` artefaktını geri
  yüklemek dokümante edilmemiş, test edilmemiş manuel `gunzip … | psql` gerektirir. Tarihte tek "restore"
  demo re-seed'di; gerçek işlem verisi kalıcı kayboldu çünkü dump yoktu (TD-116-c). `pg_restore --list`
  (`docs/OPERATIONS.md:688-690`) yalnız TOC listeler — restore tatbikatı değil. **Class: PROD BLOCKER (DR).**

### PB-3 — Backup manuel / tek-host / zamanlanmamış / offsite-siz
- **Kanıt:** `infra/scripts/db-backup.zsh:22` gerçek `docker exec … pg_dump … | gzip > infra/backups/…` üretir
  (çalışır), ama yalnız **elle** (`docs/OPERATIONS.md:651`), cron/zamanlanmış backup yok, çıktı Postgres
  container'ıyla **aynı yerel diskte** (offsite/S3 yok, rotasyon/şifreleme yok). Host kaybı hem DB'yi hem
  backup'ı kaybettirir. **Class: PROD BLOCKER (DR).** PB-2 ile birlikte tek "felaket kurtarma" kümesidir.

> **Not:** PB-1 gerçek-ödeme kapısına bağlıdır (bugün MOCK ile sınırlı). PB-2/PB-3 ise **ilk gerçek merchant
> verisi girdiği andan itibaren** blokerdir — pilot dahil.

---

## 3. HIGH öncelikli işler (launch öncesi)

### H-1 — Tema token değerleri sanitize edilmeden `<style dangerouslySetInnerHTML>`'e enjekte ediliyor (stored-XSS / render-break)
- **Kanıt:** token değerleri yalnız `z.string().min(1)` (`packages/theme/src/schema.ts:40-45` `zConcrete`;
  CSS-value allowlist/escape YOK); `generateCssVariables` yalnız anahtar adını kebab-case'e çevirir, değeri ham
  bırakır → `${name}: ${value};` (`packages/theme/src/css.ts:107-120`); public uç CSS'i döndürür
  (`server.ts:5145-5159`); storefront birebir enjekte eder (`apps/storefront-web/app/layout.tsx:96`
  `dangerouslySetInnerHTML`). Yalnız serbest `customCss` sanitize edilir (`packages/theme/src/custom-css.ts:35`,
  `theme/routes.ts:139-144`) — token değerleri bu yolu bypass eder. `#fff</style><script>…` gibi bir değer
  `<style>`'dan kaçar → public storefront'ta stored XSS; masum `;`/`}` tüm stylesheet'i bozar.
- **Bugünkü sınır:** tema düzenleme yalnız platform-admin gate'li (store-user auth yok, TD-019) → bugün güvenilir
  admin gerektirir. Ama sink **kalıcı**; merchant-facing tema editörü açılmadan önce (CSS-value allowlist/escape)
  düzeltilmeli. **Class: HIGH (store-user tema editörü öncesi PROD BLOCKER).**

### H-2 — Sponsorship REVENUE_SHARE'de currency-mismatch guard yok → toplamlar sessizce bozulabilir
- **Kanıt:** `collectBillableMetrics` (`apps/api-gateway/src/sponsorship/data.ts:738-822`) dönemin
  `OrderSponsoredAttribution.netRevenueMinor`'unu her satırın `currency`'sini **yoksayarak** toplar;
  `previewSettlement` (`:1563-1626`) `currency: agreement.currency` damgalar (kontrol yok). `isSameCurrency`
  yalnız payment↔charge (`:2047`), advance↔agreement (`:2183`), advance↔charge (`:2237`), agreement-update
  (`:1336`) yollarında uygulanır — **revenue-share↔orders yolunda DEĞİL**. Order currency variant-başına
  (`server.ts:2311-2312`), `Store`'da currency alanı yok (`schema.prisma:768`). ADR-127'nin öngördüğü
  `assertSameCurrency` helper'ı kodda **yok** (grep 0 sonuç).
- **Gerçeklik:** Bugün her şey TRY ise latent. Karışık-para-birimli variant + REVENUE_SHARE anlaşma birlikte
  olduğunda net gelir toplamı yanlış tahakkuk üretir (finansal-doğruluk). TD-124 bunu "gelecek FX dönüşümü"
  gibi kaydeder ama aynı-currency **enforcement**'ı bir invariant sanır — kod uygulamıyor.
  **Class: HIGH (yanlış-sınıflanmış finans guard'ı; bkz. §7).**

### H-3 — Rezervasyon süre-aşımı / terk-edilmiş sipariş süpürücüsü + orphan DRAFT temizliği yok (TD-033)
- **Kanıt:** rezervasyon yalnız `placeOrder`'da yaratılır (`server.ts:4464`), yalnız `cancelOrder`'da bırakılır;
  zamanlanmış expiry job yok (`apps/worker/src` grep: `expiry|abandoned|reservation` = 0). Anonim checkout
  ödemeden **önce** stok rezerve eder (`status:"PLACED"`, `paymentStatus:UNPAID`); başarısız `placeOrder` orphan
  DRAFT bırakır (`server.ts:5980-5983`, temizlik yok). Oversell **engelli** (kilit doğru) ama terk edilen anonim
  checkout'lar stoku süresiz kilitler. **Class: HIGH (stok kilitlenmesi).**

### H-4 — Ödeme/recovery/checkout zinciri deploy + auth'lu runtime smoke KANITI olmadan DONE
- **Kanıt:** `docs/PHASE_LOG.md` F3B.2 payments/recovery için tekrar "commit/push/PR/merge/deploy YAPILMADI" +
  auth'lu piksel-smoke "bu ortamda yapılamaz (SESSION_SECRET forge engeli)" kaydeder (`~1165,1191,3603-3649`).
  Para-yolu (checkout → attempt → webhook → PAID → fulfillment) deployed stack'te uçtan uca doğrulanmadı.
  Kardeş **Sponsored Products (TODO-161)** funnel'ı da aynı durumda (TD-122: impression→click→order→refund
  canlı smoke edilmedi). **Class: HIGH (para-yolu verification boşluğu).** Not: TD-127'nin fixture-session
  tekniği bu engeli aşılabilir kıldı → deploy öncesi enterprise-demo'da uygulanmalı.

---

## 4. MEDIUM işler (launch sonrası yakın dönem)

| # | Bulgu | Kanıt | Not |
|---|---|---|---|
| M-1 | Login rate-limit in-process `Map` → çok-replika bypass | `server.ts:1548-1590`, `customers/index.ts:1519-1540` | TD-015 "eksik" idi; artık VAR ama in-memory → Redis/dağıtık gerekir |
| M-2 | Dev seed bilinen-parolalı SUPER_ADMIN, APP_ENV guard yok | `packages/db/scripts/seed.ts:6-25` | prod DB'ye `pnpm db:seed` → repo'da parolası açık admin; non-dev'de reddetmeli |
| M-3 | Migration'lar elle uygulanıyor, deploy'da gate'li/otomatik değil | `package.json:19-20`, `node.Dockerfile:45-46` | kod, şemadan önce canlı olabilir → migrate-on-release adımı gerekli |
| M-4 | Shipping sync + barcode-retry worker'ları yalnız in-process kilit | `shipping/sync-worker.ts:66` | ≥2 replika → çift-sync/duplicate provider çağrısı (`OPERATIONS.md:849`) |
| M-5 | Search enqueue fire-and-forget → Redis kesintisinde bayat, yalnız manuel backfill | `search-index/emitter.ts:30-40`, `services/search-service/src/cli/backfill.ts` | otomatik reconciliation süpürücüsü yok; checkout fiyat/stok canlı tablodan → sipariş yanlışlığı YOK |
| M-6 | Kategori runtime redirect kapalı (TD-064) | `storefront-web/lib/seo/redirect-runtime.ts:13-16` | yeniden-adlandırılmış kategori eski URL'i 301 vermez; ADR-080 dedicated route'a bağlı |
| M-7 | Payment-link e-posta = 501 / disabled buton (mail altyapısı platform-genelinde yok) | `payments/recovery-routes.ts:503`, `notification.ts:58`, `order-payment-actions.tsx:174-215` | dürüst disabled; "copy link" çalışır. Altyapı = FUTURE (EX/FC-3) |
| M-8 | admin-web Settings sayfası tamamen inert placeholder | `apps/admin-web/app/(app)/settings/page.tsx:17-26` | yalnız platform-admin görür; i18n "read-only placeholder" |
| M-9 | tsvector pseudo-diff — gelecekteki migration yazarları için foot-gun | `OPERATIONS.md:710-713` | `searchVector` GENERATED+GIN her migrate edilmiş DB'de "drift" gösterir; bozulma değil ama yanlış silme riski |
| M-10 | Sponsorship/Ops smoke yalnız local-dev/fixture; cross-store canlı test edilmedi | TD-126/TD-127 | 25-adım finans akışı gerçek auth'lu BFF'ten tıklandı; deployed stack + ikinci-mağaza re-run önerilir |

---

## 5. External decision gerekenler

- **EX-1 — Canlı ödeme sağlayıcısı entegrasyonu (TD-034).** MOCK dışındaki sağlayıcılar (IYZICO/STRIPE/PAYTR)
  scaffold-hazır ama transport default kapalı; public pay non-MOCK'u `PAYMENT_PROVIDER_NOT_CONFIGURED` ile
  reddeder. Gerçek sağlayıcı sözleşmesine bağlı. PB-1 (webhook imza) bu kapının parçası olarak kapatılmalı.
- **EX-2 — Yasal-saklama süre-sonu retention purge (TD-132).** Erasure `Order.billingTaxId/…` yasal fatura
  kimliğini asgari-saklama gereği KORUR (VUK md.253 ~5 yıl; ADR-151). Süre-sonu otomatik silme/anonimleştirme
  **mali müşavir/hukuk onayı** olmadan yazılamaz — süre uygulama kodunun veremeyeceği hukuki bir karardır.
  **Yalnız EXTERNAL DECISION olarak kalır; product blocker değildir** (erasure kişisel/davranışsal veriyi zaten
  tam siler; bu yalnız uzun-vadeli yasal-kimlik yaşam döngüsü boşluğudur).
- **EX-3 — Ürün/varyant toplu import launch-kapısı (TD-117).** Net-new/greenfield merchant için kabul edilebilir;
  mevcut kataloğu olan **migration merchant** için pratik bloker. Hangi segmentle launch edileceği GTM kararıdır
  (bkz. FC-1).

---

## 6. Final polish'e bırakılanlar

| # | Bulgu | Kanıt | Not |
|---|---|---|---|
| FP-1 | ERASED müşteri ekranında hâlâ ACTIVE/PASSIVE/BLOCKED editable Select + Kaydet | `store-admin-web/app/(app)/customers/[id]/page.tsx:509-531` | sunucu 409 `CUSTOMER_ALREADY_ERASED` ile reddeder (`customers/index.ts:1023,2265`); yalnız kozmetik. **FINAL POLISH** |
| FP-2 | `JOB_ALREADY_RUNNING` store-admin i18n sözlüğünde yok → genel "beklenmeyen hata" | `commercial-automation/routes.ts:113,155`; `messages.ts:22`; tr/en `storeAdmin.ts` = 0 eşleme | 409 doğru bloklar, ham kod sızmaz; özel "zaten çalışıyor" kopyası eklenebilir. **FINAL POLISH** |
| FP-3 | Öneri/son-görüntülenen kartlarında rating yıldızları render olmuyor | `similar-products.tsx:70`, `recently-viewed-rail.tsx:78`, `view-history-section.tsx:89` — `RatingProvider` sarmıyor | summaries taşınmıyor; sahte veri yok. **FINAL POLISH** |
| FP-4 | Self-service parola değişimi diğer session'ları revoke etmiyor | `customers/index.ts:1909-1926` | admin reset revoke-all yapar; best-practice olarak diğer oturumlar kesilmeli. **FINAL POLISH** |
| FP-5 | Internal-token karşılaştırması constant-time değil | `server.ts:2481-2488` (`!==`) | diğer yerler `timingSafeEqual` kullanır; yüksek-entropili secret'ta düşük risk. **FINAL POLISH** |
| FP-6 | Shipping detay "Müşteri bildirimi gönder" disabled coming-soon | `shipping/shipments/[id]/page.tsx:512-515` | backend yok → dürüst pasif + not. **FINAL POLISH** |

---

## 7. Yanlış sınıflandırılmış teknik borçlar

- **TD-124 → aslında iki ayrı şey.** (a) çoklu-para-birimi FX dönüşümü = doğru şekilde FUTURE CAPABILITY.
  (b) REVENUE_SHARE aynı-currency **enforcement**'ı: TD-124 bunu "mağaza siparişleriyle aynı olmalı" bir
  invariant gibi kaydeder ama kod uygulamıyor (H-2). Bu bir **eksik finans-doğruluk guard'ı** → gelecek
  yetenek değil, HIGH boşluk. (Ayrı `TD-133` olarak açılmalı.)
- **Tema token XSS sink'i (H-1) hiçbir yerde borç olarak izlenmiyor.** Zod `.passthrough()` + değer-sanitize
  eksikliği bilinen bir "passthrough tuzağı" olarak anılıyor ama güvenlik sink'i olarak kayıtlı değil →
  yeni **TD-134** açılmalı.
- **Rezervasyon expiry (TD-033) altında "FUTURE" tonuyla duruyor** ama anonim checkout ödeme-öncesi rezervasyon
  + expiry-yok kombinasyonu launch'ta gerçek stok-kilitlenmesi üretir → HIGH (H-3) olarak ele alınmalı.
- **Not (doğru sınıflananlar):** TD-117 (import) greenfield capability olarak etiketli — teknik borç değil,
  eksik yetenek; doğru. TD-119/120/123 (sponsored budget/placement/merge) ADR-091 ile bilinçli MVP-dışı
  FUTURE CAPABILITY; doğru. Yeni yetenekleri teknik borç gibi göstermekten kaçınıldı.

---

## 8. Kapatılabilecek / güncellenecek bayat kayıtlar

- **ROADMAP.md + TODO.md tail: TODO-161B, TD-129/130, TD-131 "KOD TAMAM (commit YOK)" gösteriyor — üçü de
  MERGED.** `a223beb`/`8e2e804` (PR #130), `1ea9f19`/`c7817d0` (PR #131), `cd48c87`/`f184b89` (PR #132) hepsi
  `main` HEAD ancestor'ı; migration'ları (`20260727130000/150000/160000`) ve `apps/api-gateway/src/customer-erasure`,
  `recommendation-events`, `recently-viewed` dizinleri main'de mevcut. → Statüler **DONE / MERGED + DEPLOYED**
  olarak güncellendi.
- **TODO-159G "commit/PR/deploy YAPILMADI"** — seed-koruma (`f9834c9`) + recovery (`cb0fe74`) main log'unda;
  guard'lar + `db:backup`/`db:restore-enterprise` script'leri repo'da. → Kayıt güncellenmeli (recovery+önleme
  merged; kalan yalnız TD-116-b imaj-rebuild notu).
- **TD-015 "auth rate limit … eksik"** — artık platform login + customer login/OTP için VAR (in-process).
  → "kısmen çözüldü; kalan = dağıtık limiter" olarak güncellendi (M-1).
- **TD-034 webhook imza** — "sonraki faz" notu, PB-1 ile somut risk (geçiş `signatureValid`'e gate'lenmiyor)
  olarak netleştirildi.

---

## 9. Önerilen geliştirme sırası

**Aşama A — Pilot/demo kapısı (MOCK ödeme, tek mağaza, güvenilir operatör):**
1. PB-2 + PB-3: gerçek off-host zamanlanmış backup + **dokümante & tatbik edilmiş** `pg_restore` runbook'u
   (herhangi bir gerçek merchant verisi girmeden önce).
2. H-1: tema token değer allowlist/escape (güvenlik sink'i — platform-admin gate'li olsa bile).
3. Bayat kayıt temizliği (§8) — durum netliği.

**Aşama B — Gerçek para kapısı:**
4. EX-1 sağlayıcı seçimi + PB-1: webhook HMAC imza zorunlu + store'u doğrulanmış attempt'ten türet (aynı iş
   paketi). Ardından H-4: deployed stack'te auth'lu para-yolu smoke (fixture-session tekniği).
5. H-3: rezervasyon expiry job + orphan DRAFT auto-cancel (single-tx create+place).
6. M-1 (dağıtık rate-limit), M-2 (seed env guard), M-3 (migrate-on-release gate).

**Aşama C — Ölçek & çok-operatör:**
7. TD-019 store-user auth + per-store roller (H-1'in kalıcı kapanışı).
8. M-4 (worker dağıtık kilit), M-5 (search reconciliation süpürücü), M-10 (deployed cross-store smoke).
9. FUTURE CAPABILITY kümesi (FC-1 import, FC-2 warehouse rezervasyon, FC-3 mail altyapısı, sponsored budget/
   placement/merge) ürün kararına göre.

**Sürekli:** H-2 (revenue-share currency guard) — çoklu-para-birimli variant tanıtılmadan önce zorunlu;
FINAL POLISH kalemleri (§6) UI/design polish fazında.

---

## 10. Güncellenen dosyalar

- `docs/analysis/launch-readiness-product-gap-audit.md` (bu doküman — yeni)
- `docs/ROADMAP.md` — bayat "commit YOK" statüleri düzeltildi (§8) + "Launch Readiness" bölümü eklendi
- `docs/TODO.md` — bayat kayıtlar güncellendi + launch-öncesi iş kalemleri (PB/H/M) eklendi
- `docs/TECHNICAL_DEBT.md` — TD-133 (revenue-share currency guard), TD-134 (tema token XSS sink),
  TD-135 (DR: backup/restore), TD-136 (rezervasyon expiry HIGH) eklendi; TD-015/TD-033/TD-034/TD-124
  durumları netleştirildi

---

### Ek: FUTURE CAPABILITY kümesi (ürün kararına bağlı, launch-blocker değil)

| # | Yetenek | Kayıt |
|---|---|---|
| FC-1 | Ürün/varyant toplu/CSV import (SKU motoru import-hazır) | TD-117 (launch-kapısı = EX-3 GTM) |
| FC-2 | Warehouse-aware rezervasyonun checkout'a bağlanması | TD-047 (bugün tek-aggregate authority) |
| FC-3 | Transactional e-posta/SMS/notification altyapısı (notification-service stub) | M-7 kök nedeni |
| FC-4 | Sponsored budget/CPC/CPM/bidding + günlük limit + fatura | TD-119 (ADR-091 MVP-dışı) |
| FC-5 | Sponsor↔Influencer birleştirme (tek ticari kimlik) | TD-123 |
| FC-6 | Ek sponsored placement (PDP/Cart/Checkout upsell) | TD-120 kalan |
| FC-7 | Kısmi-iade net gelir düzeltmesi (PARTIALLY_REFUNDED yok) | TD-114 (dormant-ama-destekli) |
| FC-8 | Distinct store-user auth + granular per-store roller | TD-019 (güvenilmeyen operatör onboarding'i öncesi) |
