import { z } from "zod";

import { optionalBooleanEnv, optionalEnv, optionalNumberEnv, optionalUrlEnv } from "./env.js";

export {
  emptyToUndefined,
  optionalBooleanEnv,
  optionalEnv,
  optionalNumberEnv,
  optionalUrlEnv,
} from "./env.js";

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
  return result.data;
}
