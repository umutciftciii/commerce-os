import { z } from "zod";

import { optionalBooleanEnv, optionalEnv, optionalNumberEnv, optionalUrlEnv } from "./env.js";
import {
  DEFAULT_SESSION_POLICY,
  assertActivityThrottleSeconds,
  type SessionPolicy,
} from "./session-policy.js";

export {
  emptyToUndefined,
  optionalBooleanEnv,
  optionalEnv,
  optionalNumberEnv,
  optionalUrlEnv,
} from "./env.js";

// ADR-271 — Unified Session Policy (saf modul) tekrar disa aktarilir; gateway ve
// Next BFF ayni tek kaynagi kullanir.
export * from "./session-policy.js";

// ADR-289 (TODO-177) — Ürün Desteği topic-bazlı platform SLA politikası (saf modul).
export * from "./ticket-sla-policy.js";

// TODO-178 — Store→Platform Request domain policy (saf modul; platform-owned).
export * from "./platform-request-sla-policy.js";
export * from "./platform-request-taxonomy.js";

export const envSchema = z.object({
  // --- Opsiyonel (varsayilanli) temel ayarlar -------------------------------
  // TD-036: bunlarin hepsi opsiyoneldir (default var). env_file'da `KEY=` bos
  // birakilirsa varsayilana duser, config yuklemesi cokmez.
  APP_ENV: optionalEnv(
    z.enum(["development", "test", "staging", "production"]).default("development"),
  ),
  SERVICE_NAME: optionalEnv(z.string().min(1).default("commerce-os")),
  LOG_LEVEL: optionalEnv(z.enum(["debug", "info", "warn", "error"]).default("info")),

  // --- ZORUNLU degerler (strict — eksik/gecersizse yuksek sesle fail) -------
  // TD-036: BU alanlar bilerek bos-string toleransi ALMAZ. Boot bu degerler
  // olmadan devam etmemelidir.
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(12),
  SESSION_SECRET: z.string().min(24),

  // --- Opsiyonel (varsayilanli) sayi/isim ayarlari --------------------------
  SESSION_TTL_SECONDS: optionalNumberEnv(z.coerce.number().int().positive().default(60 * 60 * 8)),
  PASSWORD_HASH_PEPPER: z.string().optional().default(""),
  ADMIN_AUTH_COOKIE_NAME: optionalEnv(z.string().min(1).default("commerce_os_admin_session")),
  // TODO-B (ADR-271) — Store-admin tenant TRUST BOUNDARY. Bu tek-magaza deployment'inda
  // store-auth login tenant context'i YALNIZCA sunucu-tarafi bu deployment config'inden
  // cozulur; hicbir istemci header'i/govde alani tenant SECEMEZ. Tanimsiz/bos ise
  // resolveStoreAdminTenantContext null doner ve TUM store-auth login'ler fail-closed 401
  // olur (bilerek). Ileride host/subdomain resolver eklenebilir (tenant-resolver abstraction).
  STORE_ADMIN_STORE_SLUG: optionalEnv(z.string().min(1).optional()),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(60),
  ),
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: optionalNumberEnv(
    z.coerce.number().int().positive().default(5),
  ),
  API_GATEWAY_PORT: optionalNumberEnv(z.coerce.number().int().positive().default(3000)),
  WORKER_CONCURRENCY: optionalNumberEnv(z.coerce.number().int().positive().default(5)),
  // F3B.3: Storefront musteri oturum/OTP ayarlari. Oturum TTL'i admin'den uzun
  // (alisveris devamliligi). OTP kisa omurlu + denemesi sinirli + resend cooldown.
  CUSTOMER_SESSION_TTL_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  ),
  // ── ADR-271 (Unified Session Policy) — iki-kapili omur pencereleri. ────────────
  // SESSION_TTL_SECONDS / CUSTOMER_SESSION_TTL_SECONDS ARTIK OTORITE DEGIL; oturum
  // omru asagidaki policy'den turer (resolveSessionPolicy). Bu env'ler yalniz
  // varsayilani override eder (or. izole smoke'ta gercek 30 dk beklememek icin
  // pencereler kucultulur — SUNUCU-otoriter; istemci gonderemez). Hepsi TD-036
  // toleransli (bos → varsayilan). Alt sinirlar guvenlik tabani.
  // "Beni hatirla" KAPALI:
  SESSION_IDLE_TIMEOUT_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(DEFAULT_SESSION_POLICY.rememberOff.idleTimeoutSeconds),
  ),
  SESSION_ABSOLUTE_EXPIRY_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(DEFAULT_SESSION_POLICY.rememberOff.absoluteExpirySeconds),
  ),
  // "Beni hatirla" ACIK:
  SESSION_REMEMBER_IDLE_TIMEOUT_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(DEFAULT_SESSION_POLICY.rememberOn.idleTimeoutSeconds),
  ),
  SESSION_REMEMBER_ABSOLUTE_EXPIRY_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(DEFAULT_SESSION_POLICY.rememberOn.absoluteExpirySeconds),
  ),
  // idle bitimine kac saniye kala uyari; DB throttle penceresi.
  SESSION_WARNING_LEAD_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(DEFAULT_SESSION_POLICY.warningLeadSeconds),
  ),
  // S3 — 0/negatif REDDEDİLİR (footgun); production alt sınırı (≥30) loadConfig'te fail-fast.
  SESSION_ACTIVITY_THROTTLE_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(DEFAULT_SESSION_POLICY.activityThrottleSeconds),
  ),
  CUSTOMER_OTP_TTL_SECONDS: optionalNumberEnv(z.coerce.number().int().positive().default(300)),
  CUSTOMER_OTP_MAX_ATTEMPTS: optionalNumberEnv(z.coerce.number().int().positive().default(5)),
  CUSTOMER_OTP_RESEND_COOLDOWN_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(60),
  ),
  // F3B.3: Gercek SMS/e-posta saglayici YOK; OTP teslimat dev/mock. Bu deger
  // SET ise (yalnizca development/test'te etkili) OTP dogrulamada bu sabit kod da
  // kabul edilir; boylece izole smoke gercek kod sizdirmadan akisi tamamlar.
  // Plain OTP loglara/response'a ASLA yazilmaz; bu yalniz dev/test bypass'idir.
  // TD-036: bos string → undefined (bypass yok); GECERSIZ non-empty kod → hata.
  CUSTOMER_OTP_DEV_CODE: optionalEnv(z.string().regex(/^[0-9]{6}$/).optional()),
  // TODO-087: Admin tetikli aktivasyon/parola-sifirlama token'inin omru. Kisa
  // tutulur (varsayilan 24 saat); link tek seferlik ve hash olarak saklanir.
  CUSTOMER_CREDENTIAL_TOKEN_TTL_SECONDS: optionalNumberEnv(
    z.coerce.number().int().positive().default(60 * 60 * 24),
  ),
  // F3B.2: Payment provider credential'larini AES-256-GCM ile sifrelemek icin
  // 32 byte'lik anahtar (base64 veya hex). Yoksa development/test'te guvensiz
  // dev fallback kullanilir (yuksek sesli uyari); staging/production'da eksikse
  // odeme sifreleme islemi hata verir (bkz. apps/api-gateway/src/payments/encryption.ts).
  // TD-036: secret oldugu icin sema dokunulmadi; downstream `key.trim().length`
  // ile bos degeri zaten "yok" sayar.
  PAYMENT_ENCRYPTION_KEY: z.string().optional(),
  // F3B.2: Gercek provider sandbox/live HTTP cagrilarini acar. Varsayilan KAPALI;
  // bu fazda canli/sandbox HTTP YAPILMAZ (provider adapter'lari request/response
  // mapping'i uretir ama transport kapaliyken cagri SANDBOX_HTTP_DISABLED doner).
  // Sozlesme/test credential sonrasi true yapilarak ayni adapter aktive edilir.
  PAYMENT_SANDBOX_HTTP_ENABLED: optionalBooleanEnv(false),
  // F3C.1: Shipping provider credential'larini AES-256-GCM ile sifrelemek icin
  // 32 byte'lik anahtar (base64 veya hex). Payment'tan AYRI domain anahtaridir;
  // PAYMENT_ENCRYPTION_KEY'e fallback YOKTUR. Anahtar yoksa HICBIR ortamda
  // (development/test/staging/production) guvensiz fallback kullanilmaz; shipping
  // credential save/test/decrypt gerektiren tum islemler CONFIG_MISSING doner
  // (bkz. apps/api-gateway/src/shipping/encryption.ts).
  SHIPPING_ENCRYPTION_KEY: z.string().optional(),
  // F3C.1: Gercek kargo saglayici sandbox/live HTTP cagrilarini acar. Varsayilan
  // KAPALI; bu fazda canli/sandbox HTTP YAPILMAZ (adapter request mapping uretir
  // ama transport kapaliyken cagri SHIPPING_HTTP_DISABLED doner).
  SHIPPING_SANDBOX_HTTP_ENABLED: optionalBooleanEnv(false),
  // F3C.1: DHL eCommerce destructive operasyon guard'lari + Geliver etiket satin
  // alma guard'i. Hepsi varsayilan KAPALI. Canli createOrder/createbarcode/
  // acceptOffer ancak ilgili flag true + providerConfig.allow* true + request
  // explicitConfirm true uclusu saglandiginda calisir; aksi halde 409 doner.
  // F3C.1 — DHL eCommerce TEST/LIVE base URL ayrimi (ADR/DECISIONS kaydina bkz.).
  // TEST mode TEST_BASE_URL kullanir; YOKSA TEST_BASE_URL_MISSING doner ve CANLI
  // host'a fallback YAPMAZ. LIVE mode LIVE_BASE_URL kullanir. Adapter, OpenAPI
  // path'lerini (/mngapi/api/...) base URL'ye EKLER; base URL'ye path eklenmez.
  // TD-036: opsiyonel URL — bos string → undefined (TEST_BASE_URL_MISSING akisi
  // korunur); bos OLMAYAN gecersiz URL → yuksek sesle hata.
  DHL_ECOMMERCE_TEST_BASE_URL: optionalUrlEnv(),
  DHL_ECOMMERCE_LIVE_BASE_URL: optionalUrlEnv({ default: "https://api.mngkargo.com.tr" }),
  // DHL test/live isteklerinde zorunlu IBM API Connect surum header'i (x-api-version).
  // TD-036: bos string → undefined (header gonderilmez), oncesinde "" sessizce sizabiliyordu.
  DHL_ECOMMERCE_API_VERSION: optionalEnv(z.string().min(1).optional()),
  // F3C.3 — Saglayici HTTP cagri timeout'u (ms). MNG sandbox createRecipient/createOrder/
  // createbarcode/getcities cagrilari runtime'da ~15s surebildigi icin default 60s; eski
  // sabit 15s sinirda abort/timeout uretiyordu. Test/dev'de override edilebilir.
  DHL_ECOMMERCE_HTTP_TIMEOUT_MS: optionalNumberEnv(z.coerce.number().int().positive().default(60000)),
  // TODO-128 — Kargo saglayici webhook'larinin ULASILDIGI public taban URL. Store-admin
  // panelde saglayiciya yapistirilacak tam webhook URL'si (/public/shipping/webhooks/:token)
  // bu tabandan uretilir. Tanimsizsa panel URL uretmez ve uyari gosterir. Secret DEGILDIR;
  // yalniz erisim adresidir (token yol parcasi ayrica gizli + HMAC her istekte zorunlu).
  // TD-036: opsiyonel URL helper'i; bos string → undefined (aksi halde url() bos
  // degeri reddedip config yuklemesini cokertirdi — DHL_TEST_BASE_URL sinifi).
  PUBLIC_WEBHOOK_BASE_URL: optionalUrlEnv(),
  // TODO-159F (ADR-099) — Müşteri ödeme sayfasının (/pay/:token) ULAŞILDIĞI public
  // storefront taban URL'i. Admin "Ödeme Bağlantısı Oluştur" aksiyonunda kopyalanan/
  // e-postalanan MUTLAK link bu tabandan üretilir. Tanımsızsa API göreli yol döner
  // (/pay/:token) ve admin panelde tam adres için tabanı tanımlama uyarısı görünür.
  // Secret DEĞİLDİR; token yol parçası opaque + hash'li saklanır. Boş string → undefined.
  STOREFRONT_PUBLIC_BASE_URL: optionalUrlEnv(),
  // F3C.1 — Plus Command / createRecipient destructive guard'i. Varsayilan KAPALI.
  // Canli createRecipient yalniz bu flag true + providerConfig.allowRecipientCreate true
  // + request explicitConfirm true uclusu saglandiginda calisir; aksi halde
  // RECIPIENT_CREATE_DISABLED (409). Bu turda canli/sandbox createRecipient YOK.
  DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE: optionalBooleanEnv(false),
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: optionalBooleanEnv(false),
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: optionalBooleanEnv(false),
  GELIVER_ALLOW_LABEL_PURCHASE: optionalBooleanEnv(false),
  // F3C.3 (ADR-045) — DHL kargo iptali (PUT barcodecmdapi/cancelshipment) destructive
  // guard'i. Varsayilan KAPALI. Canli cancel yalniz bu flag true + providerConfig
  // (allowOrderCreate kapisi) + request explicitConfirm true uclusu saglandiginda calisir;
  // aksi halde CANCEL_DISABLED (409). Fiziksel teslim yapildiysa saglayici reddedebilir.
  DHL_ECOMMERCE_ALLOW_CANCEL: optionalBooleanEnv(false),
  // TODO-129 — Zamanlanmis shipment sync worker'i (provider-agnostic). Varsayilan KAPALI;
  // acilinca api-gateway sureci icinde guvenli araliklarla uygun gonderileri saglayiciyla
  // senkronlar (bkz. apps/api-gateway/src/shipping/sync-worker.ts). Manuel sync-all ucu
  // ayni cekirdegi kullanir ve worker kapaliyken de calisir. Tum degerler env_file'daki
  // `KEY=` bos-string haline TOLERANSLIDIR (TD-036 / optionalEnv):
  // bos deger undefined'a normalize edilir ve varsayilana duser; config yuklemesi COKMEZ.
  SHIPMENT_SYNC_ENABLED: optionalBooleanEnv(false),
  // Tur araligi (saniye). Muhafazakar varsayilan 300s; alt sinir 30s (saglayiciyi bogmamak icin).
  SHIPMENT_SYNC_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(30).default(300)),
  // Tur basina en fazla kac gonderi senkronlanir.
  SHIPMENT_SYNC_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(500).default(25)),
  // Bir gonderi en erken bu sure sonra YENIDEN senkronlanir (lastSyncAt esasli).
  SHIPMENT_SYNC_STALE_AFTER_MINUTES: optionalNumberEnv(z.coerce.number().int().positive().default(15)),
  // Ardisik hata esigi: syncAttempts bu degere ulasan gonderiyi WORKER secmez
  // (manuel sync-all calismaya devam eder; basarili sync sayaci sifirlar).
  SHIPMENT_SYNC_MAX_ATTEMPTS: optionalNumberEnv(z.coerce.number().int().positive().default(10)),
  // TODO-123 — Barkod retry/backoff worker'i (provider-agnostic). Varsayilan KAPALI;
  // acilinca api-gateway sureci icinde guvenli araliklarla, TRANSIENT (retryable) barkod
  // hatasi olan gonderileri saglayiciyla YENIDEN barkod olusturmaya calisir (bkz.
  // apps/api-gateway/src/shipping/barcode-retry-worker.ts). DATA_FIX (varis/adres eslemesi)
  // ve TERMINAL hatalar OTOMATIK denenmez; admin duzeltmesi (TODO-124/139) bekler. Manuel
  // "Barkod/Etiket Olustur" worker kapaliyken de calisir ve backoff'u bypass eder. Tum
  // degerler env_file'daki `KEY=` bos-string haline TOLERANSLIDIR (TD-036 / optionalEnv).
  BARCODE_RETRY_ENABLED: optionalBooleanEnv(false),
  // Tur araligi (saniye). Muhafazakar varsayilan 300s; alt sinir 30s (saglayiciyi bogmamak icin).
  BARCODE_RETRY_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(30).default(300)),
  // Tur basina en fazla kac gonderi denenir (kucuk tutuldu; retry pahali/gurultulu olmasin).
  BARCODE_RETRY_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(500).default(10)),
  // Ussel backoff tabani (dakika): stale * 2^(attempt-1), 6 saatle sinirli.
  BARCODE_RETRY_STALE_AFTER_MINUTES: optionalNumberEnv(z.coerce.number().int().positive().default(15)),
  // Ardisik transient hata esigi: barcodeRetryCount bu degere ulasinca WORKER secmez
  // (barcodeRetryBlockedReason=MAX_ATTEMPTS); manuel retry calismaya devam eder.
  BARCODE_RETRY_MAX_ATTEMPTS: optionalNumberEnv(z.coerce.number().int().positive().default(5)),
  // TODO-155.2 — Kampanya rozeti reconciliation sweep worker'i. Varsayilan KAPALI; acilinca api-gateway
  // sureci icinde dusuk frekansla (a) suresi gecmis kampanya snapshot'li urunleri (b) araligi yeni ACILAN
  // kampanyalari tespit edip search read-model reindex job'u enqueue eder (event kacirsa bile kendini onarir).
  // Read-time bastirma zaten stale badge'i GIZLER; bu sweep snapshot'i eninde sonunda TEMIZLER. Idempotent
  // (reindex idempotent). Tum degerler `KEY=` bos-string haline TOLERANSLIDIR (TD-036 / optionalEnv).
  CAMPAIGN_RECONCILE_ENABLED: optionalBooleanEnv(false),
  // Tur araligi (saniye). Muhafazakar varsayilan 3600s (saatlik); alt sinir 60s. Kampanya penceresi
  // gunler/saatler olcegindedir → sik tarama gereksiz.
  CAMPAIGN_RECONCILE_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(60).default(3600)),
  // Tur basina, store basina en fazla kac suresi-gecmis snapshot urunu requeue edilir (bounded).
  CAMPAIGN_RECONCILE_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(1000).default(200)),
  // ── TODO-161A.1 (TD-125) — Otomatik settlement zamanlayici (sponsorship). ────────────────────
  // Sponsorship anlasmalarinin (ACTIVE/COMPLETED, settlementPeriod WEEKLY/MONTHLY/CAMPAIGN_END)
  // KAPANMIS donemleri icin OTOMATIK **DRAFT** settlement uretir. Otomatik finalize YOK. Fiyat
  // matematigi previewSettlement (SAF billing-core) uzerinden — bolunmez. Idempotent (unique donem
  // + mevcut settlement varsa atlanir). Overlap: reconcile-worker deseni (setTimeout zinciri +
  // in-process running guard). Tum degerler `KEY=` bos-string toleransli (TD-036).
  SETTLEMENT_SCHEDULER_ENABLED: optionalBooleanEnv(false),
  // Tur araligi (saniye). Muhafazakar varsayilan 3600s (saatlik); alt sinir 60s. Kapanmis donem
  // sinirlari gunler olcegindedir → sik tarama gereksiz ama saatlik yakalama gecikmeyi sinirlar.
  SETTLEMENT_SCHEDULER_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(60).default(3600)),
  // Tur basina en fazla kac anlasma islenir (bounded; anlasma-basina hata izolasyonu ile).
  SETTLEMENT_SCHEDULER_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(2000).default(500)),
  // Settlement donem sinirlari (weekly/monthly) icin store timezone COZULEMEZSE (StoreSettings satiri
  // yok / bos) kullanilan varsayilan IANA timezone. Otorite once StoreSettings.timezone'dur.
  COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE: optionalEnv(z.string().min(1).default("Europe/Istanbul")),
  // ── TODO-161A.1 (TD-121 + TD-113) — Attribution ham event retention/purge. ───────────────────
  // Suresi gecmis HAM funnel/click event'lerini (SponsoredProductEvent + AttributionClick) store
  // scope'unda batch DELETE eder. Finans snapshot'lari (OrderAttribution/OrderSponsoredAttribution/
  // iade defterleri/settlement/charge/payment) ASLA silinmez. Dry-run VARSAYILAN; apply explicit.
  ATTRIBUTION_RETENTION_ENABLED: optionalBooleanEnv(false),
  // Zamanlanmis retention turu araligi (saniye). Varsayilan gunluk (86400s); alt sinir saatlik (3600s).
  ATTRIBUTION_RETENTION_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(3600).default(86400)),
  // DELETE batch buyuklugu (tek statement bounded tutulur; take → deleteMany(id in) donguleri).
  ATTRIBUTION_RETENTION_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(10000).default(1000)),
  // Sponsored funnel event ham saklama gunu. ADR-133; varsayilan 180, alt sinir 30 (yanlislikla yakin
  // veriyi budamayi engelleyen guvenlik tabani). Cutoff SUNUCU otoritesidir; istemci gonderemez.
  SPONSORED_EVENT_RETENTION_DAYS: optionalNumberEnv(z.coerce.number().int().min(30).default(180)),
  // Influencer click ham saklama gunu (ADR-106 karari 180). Alt sinir 30. Cutoff sunucu otoritesi.
  INFLUENCER_CLICK_RETENTION_DAYS: optionalNumberEnv(z.coerce.number().int().min(30).default(180)),
  // Circuit breaker: tek turda bir tablodan silinebilecek maksimum aday satir. Asilirsa APPLY reddedilir
  // (dry-run her zaman raporlar) → kontrolsuz kutlesel silme onlenir. Varsayilan 200000.
  ATTRIBUTION_RETENTION_MAX_DELETE_PER_RUN: optionalNumberEnv(z.coerce.number().int().positive().default(200000)),
  // ── TODO-161B (ADR-137/139) — Recently Viewed & Product Recommendations. ─────────────────────
  // Kimlik (customer/visitor) basina saklanan en fazla goruntuleme kaydi. Write yolunda upsert sonrasi
  // fazlalik (en eski) silinir → tablo her zaman bounded. Cap bu deger ILE otoritedir (ADR-139).
  RECENTLY_VIEWED_MAX_PER_VISITOR: optionalNumberEnv(z.coerce.number().int().positive().max(500).default(50)),
  // Zamanlanmis Recently Viewed retention worker'i. false (varsayilan) → env gate: acikca
  // etkinlestirilmeden ASLA otomatik DELETE. Cutoff SUNUCU config'idir; istemci gonderemez.
  RECENTLY_VIEWED_RETENTION_ENABLED: optionalBooleanEnv(false),
  // Retention turu araligi (saniye). Varsayilan gunluk (86400s); alt sinir saatlik (3600s).
  RECENTLY_VIEWED_RETENTION_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(3600).default(86400)),
  // Goruntuleme kaydi saklama gunu (ADR-139 = 90). Alt sinir 1 (guvenlik tabani). lastViewedAt < cutoff budanir.
  RECENTLY_VIEWED_RETENTION_DAYS: optionalNumberEnv(z.coerce.number().int().min(1).default(90)),
  // DELETE batch buyuklugu (take → deleteMany(id in); her statement bounded).
  RECENTLY_VIEWED_RETENTION_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(10000).default(1000)),
  // Circuit breaker: tek turda bir store'dan silinebilecek maksimum aday satir. Asilirsa APPLY reddedilir.
  RECENTLY_VIEWED_RETENTION_MAX_DELETE_PER_RUN: optionalNumberEnv(z.coerce.number().int().positive().default(200000)),
  // ── TD-130 (ADR-145…148) — Recommendation Measurement (event domain). ─────────────────────────
  // Event kayit ucu rate limit (IP-hash kayan pencere): pencere basina azami istek. DoS/enumeration yavaslatma.
  RECOMMENDATION_EVENT_RATE_LIMIT_MAX: optionalNumberEnv(z.coerce.number().int().positive().default(240)),
  RECOMMENDATION_EVENT_RATE_LIMIT_WINDOW_SECONDS: optionalNumberEnv(z.coerce.number().int().positive().default(60)),
  // Impression dedupe penceresi (saniye): ayni kimlik+urun+source+placement icin bu sure icinde tekrar
  // impression YENI satir ACMAZ (ADR-147). Varsayilan 30 dk (1800s).
  RECOMMENDATION_IMPRESSION_DEDUPE_SECONDS: optionalNumberEnv(z.coerce.number().int().min(0).default(1800)),
  // Click dedupe penceresi (saniye): impression'dan KISA (cift-tiklama/re-fire guard). Varsayilan 30s.
  RECOMMENDATION_CLICK_DEDUPE_SECONDS: optionalNumberEnv(z.coerce.number().int().min(0).default(30)),
  // Zamanlanmis Recommendation event retention worker'i (AYRI domain; sponsored/influencer allowlist'ine
  // dokunmaz). false (varsayilan) → env gate: acikca etkinlestirilmeden ASLA otomatik DELETE.
  RECOMMENDATION_EVENT_RETENTION_ENABLED: optionalBooleanEnv(false),
  RECOMMENDATION_EVENT_RETENTION_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(3600).default(86400)),
  // Ham davranis-event saklama gunu (ADR-148 = 180). Alt sinir 30 (guvenlik tabani). createdAt < cutoff budanir.
  RECOMMENDATION_EVENT_RETENTION_DAYS: optionalNumberEnv(z.coerce.number().int().min(30).default(180)),
  RECOMMENDATION_EVENT_RETENTION_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(10000).default(1000)),
  RECOMMENDATION_EVENT_RETENTION_MAX_DELETE_PER_RUN: optionalNumberEnv(z.coerce.number().int().positive().default(200000)),
  // ── TODO-167 (ADR-266) — Persistent Cart expiry sweep (AYRI domain; default OFF). env gate:
  // acikca etkinlestirilmeden ASLA otomatik EXPIRE. lastActivityAt < cutoff olan ACTIVE cart → EXPIRED
  // (hard-delete YOK; CONVERTED/MERGED/EXPIRED korunur — retention/anonymization future).
  CART_EXPIRY_SWEEP_ENABLED: optionalBooleanEnv(false),
  CART_EXPIRY_SWEEP_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(3600).default(86400)),
  // Inaktivite esigi (gun; ADR-266 = 90). Alt sinir 30 (guvenlik tabani).
  CART_EXPIRY_RETENTION_DAYS: optionalNumberEnv(z.coerce.number().int().min(30).default(90)),
  CART_EXPIRY_SWEEP_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(10000).default(1000)),
  // ── TODO-174B (ADR-284) — Store Credit lot expiry sweep (housekeeping/materialization; default OFF).
  // KRİTİK: available bakiye ZATEN expiresAt>now filtresiyle doğru hesaplanır; bu worker finansal
  // doğruluk için DEĞİL, yalnız süresi dolmuş lot'ları EXPIRED işaretleyip EXPIRE ledger entry ("Süresi
  // doldu") yazmak içindir. env gate: açıkça etkinleştirilmeden ASLA otomatik materialization (production'da
  // zorlanmaz/default-open değildir). Diğer worker'larla birebir governance.
  CREDIT_EXPIRY_SWEEP_ENABLED: optionalBooleanEnv(false),
  CREDIT_EXPIRY_SWEEP_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(3600).default(86400)),
  CREDIT_EXPIRY_SWEEP_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(10000).default(200)),
  // ── TODO-162 (ADR-205) — Home Discovery section-analytics (event domain). ─────────────────────
  // Discovery event kayit ucu rate limit (IP-hash kayan pencere): pencere basina azami istek. Section
  // impression'lari yogun oldugundan recommendation'dan biraz yuksek varsayilan (funnel gurultusu).
  HOME_DISCOVERY_EVENT_RATE_LIMIT_MAX: optionalNumberEnv(z.coerce.number().int().positive().default(600)),
  HOME_DISCOVERY_EVENT_RATE_LIMIT_WINDOW_SECONDS: optionalNumberEnv(z.coerce.number().int().positive().default(60)),
  // Impression dedupe penceresi (saniye): ayni kimlik+section(+urun) icin bu sure icinde tekrar
  // SECTION/CARD_IMPRESSION YENI satir ACMAZ. Varsayilan 30 dk (1800s).
  HOME_DISCOVERY_IMPRESSION_DEDUPE_SECONDS: optionalNumberEnv(z.coerce.number().int().min(0).default(1800)),
  // Etkilesim (PRODUCT_CLICK/CTA_CLICK) dedupe penceresi (saniye): impression'dan KISA (cift-tetik guard).
  HOME_DISCOVERY_INTERACTION_DEDUPE_SECONDS: optionalNumberEnv(z.coerce.number().int().min(0).default(30)),
  // Zamanlanmis Discovery event retention worker'i (AYRI domain/jobType; sponsored/influencer/recommendation
  // allowlist'ine dokunmaz). false (varsayilan) → env gate: acikca etkinlestirilmeden ASLA otomatik DELETE.
  HOME_DISCOVERY_EVENT_RETENTION_ENABLED: optionalBooleanEnv(false),
  HOME_DISCOVERY_EVENT_RETENTION_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(3600).default(86400)),
  // Ham davranis-event saklama gunu (recommendation ile simetrik = 180). Alt sinir 30. createdAt < cutoff budanir.
  HOME_DISCOVERY_EVENT_RETENTION_DAYS: optionalNumberEnv(z.coerce.number().int().min(30).default(180)),
  HOME_DISCOVERY_EVENT_RETENTION_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(10000).default(1000)),
  HOME_DISCOVERY_EVENT_RETENTION_MAX_DELETE_PER_RUN: optionalNumberEnv(z.coerce.number().int().positive().default(200000)),
  // ADR-065 — Site-geneli gorsel yonetimi (Faz 1). "storage key sakla, URL turet":
  // DB'ye tam URL yazilmaz; public URL runtime'da MEDIA_PUBLIC_BASE_URL + storageKey
  // ile uretilir (resolveMediaUrl). Bos/absent ise gorseller /media/{key} goreli yolla
  // sunulur (ayni origin, @fastify/static); ileride CDN kokune isaret eden bir taban
  // verilince ayni storageKey CDN'den servis edilir — migration/veri degisikligi YOK.
  // TD-036: opsiyonel URL; bos string → undefined (url() bos degeri reddetmez).
  MEDIA_PUBLIC_BASE_URL: optionalUrlEnv(),
  // Yuklenen gorsellerin diske yazildigi taban dizin (Docker'da media-data named
  // volume'una mount edilir; @fastify/static de bu kokten servis eder). Varsayilan
  // /app/uploads; bos-string TOLERANSLIDIR (TD-036 / optionalEnv → default'a duser).
  MEDIA_STORAGE_DIR: optionalEnv(z.string().min(1).default("/app/uploads")),
  // Tek gorsel icin izin verilen azami ham yukleme boyutu (byte). Varsayilan 5 MiB
  // (5*1024*1024). @fastify/multipart limiti + route guard bunu esas alir; asimda 413.
  MEDIA_MAX_UPLOAD_BYTES: optionalNumberEnv(z.coerce.number().int().positive().default(5_242_880)),
  // ADR-071 (Faz 2C-2) — Combination Engine önizleme güvenlik limiti. Bir ürünün varyant EKSEN
  // reçetesinden üretilecek Cartesian kombinasyon sayısı bu değeri aşarsa motor materialize ETMEDEN
  // PREVIEW_LIMIT_EXCEEDED döndürür (bellek/CPU patlaması engellenir). Magic number DEĞİL: config'ten
  // gelir. Muhafazakâr varsayılan 1000 (ör. 3 eksen × ~10 option tipik senaryoyu rahat kapsar; 5
  // eksen × yüksek option pratik-dışı kombinasyonu erken reddeder). Alt sınır 1 (pozitif). TD-036 /
  // optionalNumberEnv: env_file'da `KEY=` boş bırakılırsa varsayılana düşer, config yüklemesi çökmez.
  MAX_PREVIEW_COMBINATIONS: optionalNumberEnv(z.coerce.number().int().positive().default(1000)),
  // ── H-3 (ADR-187…192) — Rezervasyon TTL + süre-aşımı süpürücü + orphan DRAFT temizliği. ──────
  // Checkout rezervasyonu (placeOrder) varsayılan ömrü (dk). SUNUCU-otoriter; client gönderemez.
  // Varsayılan 15; alt sınır 5 (yanlışlıkla agresif expiry engeli), üst sınır 1440 (24s).
  RESERVATION_TTL_MINUTES: optionalNumberEnv(z.coerce.number().int().min(5).max(1440).default(15)),
  // Ödeme oturumu (PAYMENT_PENDING) açılınca TEK kontrollü TTL yenileme penceresi (dk). Sağlayıcı
  // timeout'una uyumlu. Varsayılan 30; alt 5, üst 1440. Sayfa yenileme UZATMAZ.
  RESERVATION_PAYMENT_WINDOW_MINUTES: optionalNumberEnv(z.coerce.number().int().min(5).max(1440).default(30)),
  // Bir rezervasyonun createdAt'ten itibaren MUTLAK üst ömrü (dk). Yenileme bunu aşamaz (maks toplam
  // süre cap). Varsayılan 120; alt 15, üst 10080 (7 gün).
  RESERVATION_MAX_MINUTES: optionalNumberEnv(z.coerce.number().int().min(15).max(10080).default(120)),
  // Zamanlanmış rezervasyon süre-aşımı süpürücü. Periyodik tetik apps/worker'da (BullMQ Job Scheduler);
  // api-gateway runtime'ında ÇALIŞMAZ. false (varsayılan) → periyodik zamanlama KURULMAZ (manuel enqueue
  // yine işlenir); açıkça etkinleştirilmeden ASLA otomatik expiry/cancel.
  INVENTORY_RESERVATION_EXPIRY_ENABLED: optionalBooleanEnv(false),
  // Süpürücü tur aralığı (saniye). Varsayılan 300 (5 dk); alt sınır 60. TTL kısa olduğundan sık tarama.
  // BullMQ Job Scheduler `every` = bu değer * 1000 (cron verilmezse).
  INVENTORY_RESERVATION_EXPIRY_INTERVAL_SECONDS: optionalNumberEnv(z.coerce.number().int().min(60).default(300)),
  // Opsiyonel cron ifadesi (verilirse interval yerine kullanılır). Boş → interval. TD-036 toleranslı.
  INVENTORY_RESERVATION_EXPIRY_CRON: optionalEnv(z.string().min(1).optional()),
  // Tur başına, store başına en fazla kaç expired rezervasyon işlenir (bounded batch).
  INVENTORY_RESERVATION_EXPIRY_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(5000).default(500)),
  // Circuit breaker: tek turda store başına bırakılabilecek maksimum rezervasyon. Aşılırsa APPLY
  // reddedilir (dry-run her zaman raporlar) → kontrolsüz kütlesel expiry engellenir. Varsayılan 100000.
  INVENTORY_RESERVATION_EXPIRY_MAX_RELEASE_PER_RUN: optionalNumberEnv(z.coerce.number().int().positive().default(100000)),
  // PAID/AUTHORIZED + ACTIVE reconcile (manuel/operasyonel; zamanlanmaz). Bounded batch + circuit breaker.
  INVENTORY_RESERVATION_RECONCILE_BATCH_SIZE: optionalNumberEnv(z.coerce.number().int().positive().max(5000).default(500)),
  INVENTORY_RESERVATION_RECONCILE_MAX_PER_RUN: optionalNumberEnv(z.coerce.number().int().positive().default(100000)),
  // Orphan DRAFT yaş eşiği (dk): ödeme attempt'i olmayan DRAFT sipariş bu yaştan eskiyse süpürücü
  // kontrollü terminale (CANCELLED) alır. Varsayılan 1440 (24s); alt sınır 30 (aktif checkout'u koru).
  ORPHAN_DRAFT_MAX_AGE_MINUTES: optionalNumberEnv(z.coerce.number().int().min(30).default(1440)),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * TD-036 (ADR-057) — Config dogrulama hatasi. Yalniz env anahtar adi + Zod
 * mesajini icerir; env DEGERLERI ASLA basilmaz (secret sizintisi olmasin).
 */
export class ConfigValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `Gecersiz ortam degiskeni yapilandirmasi:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

/**
 * ADR-271 — Cozumlenmis oturum politikasi. Varsayilanlar DEFAULT_SESSION_POLICY;
 * SESSION_* env'leri override eder (izole smoke'ta kucuk pencereler). Gateway ve
 * BFF ayni cozumleyiciyi kullanir → tek kaynak, uc uygulama ortak.
 */
export function resolveSessionPolicy(config: Partial<AppConfig>): SessionPolicy {
  // Eksik alanlar (kismi/fake config) DEFAULT_SESSION_POLICY'ye duser. Prod'da
  // zod default'lari zaten degerleri doldurur; bu fallback yalniz partial config
  // (or. bazi route testleri) icin guvenlik agidir → NaN pencere olusmaz.
  const d = DEFAULT_SESSION_POLICY;
  return {
    rememberOff: {
      idleTimeoutSeconds: config.SESSION_IDLE_TIMEOUT_SECONDS ?? d.rememberOff.idleTimeoutSeconds,
      absoluteExpirySeconds:
        config.SESSION_ABSOLUTE_EXPIRY_SECONDS ?? d.rememberOff.absoluteExpirySeconds,
    },
    rememberOn: {
      idleTimeoutSeconds:
        config.SESSION_REMEMBER_IDLE_TIMEOUT_SECONDS ?? d.rememberOn.idleTimeoutSeconds,
      absoluteExpirySeconds:
        config.SESSION_REMEMBER_ABSOLUTE_EXPIRY_SECONDS ?? d.rememberOn.absoluteExpirySeconds,
    },
    warningLeadSeconds: config.SESSION_WARNING_LEAD_SECONDS ?? d.warningLeadSeconds,
    activityThrottleSeconds: config.SESSION_ACTIVITY_THROTTLE_SECONDS ?? d.activityThrottleSeconds,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Yalniz anahtar + mesaj; env DEGERI hicbir zaman loglanmaz/basilmaz.
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(kok)";
      return `${key}: ${issue.message}`;
    });
    throw new ConfigValidationError(issues);
  }
  // S3 — activity throttle production alt sınırı (config parser fail-fast; test override sızamaz).
  try {
    assertActivityThrottleSeconds(
      result.data.SESSION_ACTIVITY_THROTTLE_SECONDS,
      env.NODE_ENV === "production",
    );
  } catch (error) {
    throw new ConfigValidationError([
      `SESSION_ACTIVITY_THROTTLE_SECONDS: ${error instanceof Error ? error.message : "invalid"}`,
    ]);
  }
  return result.data;
}
