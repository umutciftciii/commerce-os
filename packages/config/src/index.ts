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
  API_GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
