import { z } from "zod";

export const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  SERVICE_NAME: z.string().min(1).default("commerce-os"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(12),
  SESSION_SECRET: z.string().min(24),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 8),
  PASSWORD_HASH_PEPPER: z.string().optional().default(""),
  ADMIN_AUTH_COOKIE_NAME: z.string().min(1).default("commerce_os_admin_session"),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  API_GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // F3B.3: Storefront musteri oturum/OTP ayarlari. Oturum TTL'i admin'den uzun
  // (alisveris devamliligi). OTP kisa omurlu + denemesi sinirli + resend cooldown.
  CUSTOMER_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  CUSTOMER_OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CUSTOMER_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  CUSTOMER_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  // F3B.3: Gercek SMS/e-posta saglayici YOK; OTP teslimat dev/mock. Bu deger
  // SET ise (yalnizca development/test'te etkili) OTP dogrulamada bu sabit kod da
  // kabul edilir; boylece izole smoke gercek kod sizdirmadan akisi tamamlar.
  // Plain OTP loglara/response'a ASLA yazilmaz; bu yalniz dev/test bypass'idir.
  CUSTOMER_OTP_DEV_CODE: z.string().regex(/^[0-9]{6}$/).optional(),
  // TODO-087: Admin tetikli aktivasyon/parola-sifirlama token'inin omru. Kisa
  // tutulur (varsayilan 24 saat); link tek seferlik ve hash olarak saklanir.
  CUSTOMER_CREDENTIAL_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  // F3B.2: Payment provider credential'larini AES-256-GCM ile sifrelemek icin
  // 32 byte'lik anahtar (base64 veya hex). Yoksa development/test'te guvensiz
  // dev fallback kullanilir (yuksek sesli uyari); staging/production'da eksikse
  // odeme sifreleme islemi hata verir (bkz. apps/api-gateway/src/payments/encryption.ts).
  PAYMENT_ENCRYPTION_KEY: z.string().optional(),
  // F3B.2: Gercek provider sandbox/live HTTP cagrilarini acar. Varsayilan KAPALI;
  // bu fazda canli/sandbox HTTP YAPILMAZ (provider adapter'lari request/response
  // mapping'i uretir ama transport kapaliyken cagri SANDBOX_HTTP_DISABLED doner).
  // Sozlesme/test credential sonrasi true yapilarak ayni adapter aktive edilir.
  PAYMENT_SANDBOX_HTTP_ENABLED: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
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
  SHIPPING_SANDBOX_HTTP_ENABLED: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
  // F3C.1: DHL eCommerce destructive operasyon guard'lari + Geliver etiket satin
  // alma guard'i. Hepsi varsayilan KAPALI. Canli createOrder/createbarcode/
  // acceptOffer ancak ilgili flag true + providerConfig.allow* true + request
  // explicitConfirm true uclusu saglandiginda calisir; aksi halde 409 doner.
  // F3C.1 — DHL eCommerce TEST/LIVE base URL ayrimi (ADR/DECISIONS kaydina bkz.).
  // TEST mode TEST_BASE_URL kullanir; YOKSA TEST_BASE_URL_MISSING doner ve CANLI
  // host'a fallback YAPMAZ. LIVE mode LIVE_BASE_URL kullanir. Adapter, OpenAPI
  // path'lerini (/mngapi/api/...) base URL'ye EKLER; base URL'ye path eklenmez.
  DHL_ECOMMERCE_TEST_BASE_URL: z.string().url().optional(),
  DHL_ECOMMERCE_LIVE_BASE_URL: z.string().url().optional().default("https://api.mngkargo.com.tr"),
  // DHL test/live isteklerinde zorunlu IBM API Connect surum header'i (x-api-version).
  DHL_ECOMMERCE_API_VERSION: z.string().optional(),
  // F3C.3 — Saglayici HTTP cagri timeout'u (ms). MNG sandbox createRecipient/createOrder/
  // createbarcode/getcities cagrilari runtime'da ~15s surebildigi icin default 60s; eski
  // sabit 15s sinirda abort/timeout uretiyordu. Test/dev'de override edilebilir.
  DHL_ECOMMERCE_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  // TODO-128 — Kargo saglayici webhook'larinin ULASILDIGI public taban URL. Store-admin
  // panelde saglayiciya yapistirilacak tam webhook URL'si (/public/shipping/webhooks/:token)
  // bu tabandan uretilir. Tanimsizsa panel URL uretmez ve uyari gosterir. Secret DEGILDIR;
  // yalniz erisim adresidir (token yol parcasi ayrica gizli + HMAC her istekte zorunlu).
  // BOS string (env_file'da `KEY=`) undefined'a normalize edilir; aksi halde url()
  // validasyonu bos degeri reddedip config yuklemesini cokertirdi (DHL_TEST_BASE_URL sinifi).
  PUBLIC_WEBHOOK_BASE_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  // F3C.1 — Plus Command / createRecipient destructive guard'i. Varsayilan KAPALI.
  // Canli createRecipient yalniz bu flag true + providerConfig.allowRecipientCreate true
  // + request explicitConfirm true uclusu saglandiginda calisir; aksi halde
  // RECIPIENT_CREATE_DISABLED (409). Bu turda canli/sandbox createRecipient YOK.
  DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
  GELIVER_ALLOW_LABEL_PURCHASE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
  // F3C.3 (ADR-045) — DHL kargo iptali (PUT barcodecmdapi/cancelshipment) destructive
  // guard'i. Varsayilan KAPALI. Canli cancel yalniz bu flag true + providerConfig
  // (allowOrderCreate kapisi) + request explicitConfirm true uclusu saglandiginda calisir;
  // aksi halde CANCEL_DISABLED (409). Fiziksel teslim yapildiysa saglayici reddedebilir.
  DHL_ECOMMERCE_ALLOW_CANCEL: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === "true"),
  // TODO-129 — Zamanlanmis shipment sync worker'i (provider-agnostic). Varsayilan KAPALI;
  // acilinca api-gateway sureci icinde guvenli araliklarla uygun gonderileri saglayiciyla
  // senkronlar (bkz. apps/api-gateway/src/shipping/sync-worker.ts). Manuel sync-all ucu
  // ayni cekirdegi kullanir ve worker kapaliyken de calisir. Tum degerler env_file'daki
  // `KEY=` bos-string haline TOLERANSLIDIR (PR #15 / PUBLIC_WEBHOOK_BASE_URL deseni):
  // bos deger undefined'a normalize edilir ve varsayilana duser; config yuklemesi COKMEZ.
  SHIPMENT_SYNC_ENABLED: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .default(false)
      .transform((value) => value === true || value === "true"),
  ),
  // Tur araligi (saniye). Muhafazakar varsayilan 300s; alt sinir 30s (saglayiciyi bogmamak icin).
  SHIPMENT_SYNC_INTERVAL_SECONDS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(30).default(300),
  ),
  // Tur basina en fazla kac gonderi senkronlanir.
  SHIPMENT_SYNC_BATCH_SIZE: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().max(500).default(25),
  ),
  // Bir gonderi en erken bu sure sonra YENIDEN senkronlanir (lastSyncAt esasli).
  SHIPMENT_SYNC_STALE_AFTER_MINUTES: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().default(15),
  ),
  // Ardisik hata esigi: syncAttempts bu degere ulasan gonderiyi WORKER secmez
  // (manuel sync-all calismaya devam eder; basarili sync sayaci sifirlar).
  SHIPMENT_SYNC_MAX_ATTEMPTS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().default(10),
  ),
  // TODO-123 — Barkod retry/backoff worker'i (provider-agnostic). Varsayilan KAPALI;
  // acilinca api-gateway sureci icinde guvenli araliklarla, TRANSIENT (retryable) barkod
  // hatasi olan gonderileri saglayiciyla YENIDEN barkod olusturmaya calisir (bkz.
  // apps/api-gateway/src/shipping/barcode-retry-worker.ts). DATA_FIX (varis/adres eslemesi)
  // ve TERMINAL hatalar OTOMATIK denenmez; admin duzeltmesi (TODO-124/139) bekler. Manuel
  // "Barkod/Etiket Olustur" worker kapaliyken de calisir ve backoff'u bypass eder. Tum
  // degerler env_file'daki `KEY=` bos-string haline TOLERANSLIDIR (PR #15 deseni).
  BARCODE_RETRY_ENABLED: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .default(false)
      .transform((value) => value === true || value === "true"),
  ),
  // Tur araligi (saniye). Muhafazakar varsayilan 300s; alt sinir 30s (saglayiciyi bogmamak icin).
  BARCODE_RETRY_INTERVAL_SECONDS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(30).default(300),
  ),
  // Tur basina en fazla kac gonderi denenir (kucuk tutuldu; retry pahali/gurultulu olmasin).
  BARCODE_RETRY_BATCH_SIZE: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().max(500).default(10),
  ),
  // Ussel backoff tabani (dakika): stale * 2^(attempt-1), 6 saatle sinirli.
  BARCODE_RETRY_STALE_AFTER_MINUTES: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().default(15),
  ),
  // Ardisik transient hata esigi: barcodeRetryCount bu degere ulasinca WORKER secmez
  // (barcodeRetryBlockedReason=MAX_ATTEMPTS); manuel retry calismaya devam eder.
  BARCODE_RETRY_MAX_ATTEMPTS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().default(5),
  ),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
