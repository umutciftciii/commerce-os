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
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
