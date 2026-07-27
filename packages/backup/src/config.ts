/**
 * PB-2/PB-3 — Backup yapılandırması (env → BackupConfig) + fail-closed kuralları.
 *
 * Tüm env boş-string toleranslıdır (TD-036 ilkesi: `KEY=` → undefined → default). Secret'lar (DB URL,
 * storage secret, encryption key) parse edilir ama ASLA loglanmaz. `packages/config` zod şeması web bundle'a
 * girer; backup env'i yalnız api-gateway + CLI'da kullanıldığından burada bağımsız/hafif parse edilir.
 */
import path from "node:path";
import { assertEncryptionUsable } from "./crypto.js";
import { createDirectPgToolRunner, createDockerPgToolRunner, type PgToolRunner } from "./pg.js";
import { createS3StorageAdapter, type S3AdapterConfig } from "./storage/s3.js";
import { createLocalStorageAdapter } from "./storage/local.js";
import type { StorageAdapter } from "./storage/types.js";

function str(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key];
  if (v === undefined || v === null) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function bool(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const v = str(env, key);
  if (v === undefined) return def;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`${key}: 'true'/'false' bekleniyor (ya da boş bırakın).`);
}

function int(env: NodeJS.ProcessEnv, key: string, def: number, min: number): number {
  const v = str(env, key);
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${key}: tam sayı bekleniyor.`);
  return Math.max(min, n);
}

export interface BackupStorageConfig extends S3AdapterConfig {
  prefix: string;
}

export interface BackupConfig {
  environment: string;
  appEnv: string;
  isProduction: boolean;
  databaseUrl?: string;
  /** pg_dump'ın bağlanacağı KAYNAK DB (varsayılan databaseUrl). Ayrı verilebilir: read-replica'dan backup ya
   *  da prisma (jobLog) URL'i pg araçlarından farklı ağ adresinde olduğunda (ör. host vs container-network). */
  sourceDatabaseUrl?: string;
  pg: { mode: "direct" | "docker"; image: string; network?: string; binDir?: string; format: "custom" | "plain" };
  localDir: string;
  encryptionKey?: string;
  /** Envelope + manifest'te taşınan key kimliği (rotation için; key DEĞERİ değil). */
  encryptionKeyId: string;
  storage: BackupStorageConfig | null;
  retention: { daily: number; weekly: number; monthly: number; minKeep: number };
  requireOffsiteInProduction: boolean;
  scheduler: {
    enabled: boolean;
    intervalSeconds: number;
    verifyAfter: boolean;
    verifyTargetUrl?: string;
    /** Backup sonrası retention APPLY (siler); false → dry-run (varsayılan güvenli). */
    retentionApplyAfterBackup: boolean;
    /** Worker BullMQ scheduler cron (verilirse intervalSeconds yerine cron kullanılır). */
    cron?: string;
  };
  /** Health/readiness hedefleri (spec §11) — garanti değil, hedef. */
  rpoTargetHours: number;
  rtoTargetHours: number;
  /** Bu yaştan eski restore-verification "eski" sayılır → production health DEGRADED (spec §8/§9). */
  restoreVerificationMaxAgeHours: number;
}

export function loadBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  const appEnv = str(env, "APP_ENV") ?? "development";
  const environment = str(env, "DATABASE_BACKUP_ENVIRONMENT") ?? appEnv;
  const isProduction = appEnv === "production";

  const mode = (str(env, "DATABASE_BACKUP_PG_MODE") ?? "direct") as "direct" | "docker";
  if (mode !== "direct" && mode !== "docker") {
    throw new Error("DATABASE_BACKUP_PG_MODE: 'direct' ya da 'docker' olmalı.");
  }
  const format = (str(env, "DATABASE_BACKUP_FORMAT") ?? "custom") as "custom" | "plain";
  if (format !== "custom" && format !== "plain") {
    throw new Error("DATABASE_BACKUP_FORMAT: 'custom' ya da 'plain' olmalı.");
  }

  const bucket = str(env, "DATABASE_BACKUP_S3_BUCKET");
  const accessKeyId = str(env, "DATABASE_BACKUP_S3_ACCESS_KEY_ID");
  const secretAccessKey = str(env, "DATABASE_BACKUP_S3_SECRET_ACCESS_KEY");
  const endpoint = str(env, "DATABASE_BACKUP_S3_ENDPOINT");
  let storage: BackupStorageConfig | null = null;
  if (bucket && accessKeyId && secretAccessKey) {
    storage = {
      bucket,
      accessKeyId,
      secretAccessKey,
      endpoint,
      region: str(env, "DATABASE_BACKUP_S3_REGION") ?? "us-east-1",
      prefix: str(env, "DATABASE_BACKUP_S3_PREFIX") ?? "",
      forcePathStyle: bool(env, "DATABASE_BACKUP_S3_FORCE_PATH_STYLE", endpoint ? true : false),
      allowInsecureEndpoint: bool(env, "DATABASE_BACKUP_S3_ALLOW_INSECURE", false),
      isProduction,
      maxAttempts: int(env, "DATABASE_BACKUP_S3_MAX_ATTEMPTS", 3, 1),
      connectionTimeoutMs: int(env, "DATABASE_BACKUP_S3_CONNECT_TIMEOUT_MS", 10_000, 100),
      requestTimeoutMs: int(env, "DATABASE_BACKUP_S3_REQUEST_TIMEOUT_MS", 120_000, 100),
    };
  }

  return {
    environment,
    appEnv,
    isProduction,
    databaseUrl: str(env, "DATABASE_URL"),
    sourceDatabaseUrl: str(env, "DATABASE_BACKUP_SOURCE_URL") ?? str(env, "DATABASE_URL"),
    pg: {
      mode,
      image: str(env, "DATABASE_BACKUP_PG_IMAGE") ?? "postgres:16-alpine",
      network: str(env, "DATABASE_BACKUP_PG_NETWORK"),
      binDir: str(env, "DATABASE_BACKUP_PG_BIN_DIR"),
      format,
    },
    localDir: str(env, "DATABASE_BACKUP_LOCAL_DIR") ?? path.join(process.cwd(), "infra/backups"),
    encryptionKey: str(env, "DATABASE_BACKUP_ENCRYPTION_KEY"),
    encryptionKeyId: str(env, "DATABASE_BACKUP_ENCRYPTION_KEY_ID") ?? "default",
    storage,
    retention: {
      daily: int(env, "DATABASE_BACKUP_RETENTION_DAILY", 14, 1),
      weekly: int(env, "DATABASE_BACKUP_RETENTION_WEEKLY", 8, 0),
      monthly: int(env, "DATABASE_BACKUP_RETENTION_MONTHLY", 12, 0),
      minKeep: int(env, "DATABASE_BACKUP_RETENTION_MIN_KEEP", 3, 1),
    },
    requireOffsiteInProduction: bool(env, "DATABASE_BACKUP_REQUIRE_OFFSITE_IN_PRODUCTION", isProduction),
    scheduler: {
      enabled: bool(env, "DATABASE_BACKUP_ENABLED", false),
      intervalSeconds: int(env, "DATABASE_BACKUP_INTERVAL_SECONDS", 86400, 3600),
      verifyAfter: bool(env, "DATABASE_BACKUP_VERIFY_AFTER", false),
      verifyTargetUrl: str(env, "DATABASE_BACKUP_VERIFY_TARGET_URL"),
      retentionApplyAfterBackup: bool(env, "DATABASE_BACKUP_RETENTION_APPLY_AFTER_BACKUP", false),
      cron: str(env, "DATABASE_BACKUP_CRON"),
    },
    rpoTargetHours: int(env, "DATABASE_BACKUP_RPO_TARGET_HOURS", 24, 1),
    rtoTargetHours: int(env, "DATABASE_BACKUP_RTO_TARGET_HOURS", 4, 1),
    restoreVerificationMaxAgeHours: int(env, "DATABASE_BACKUP_VERIFICATION_MAX_AGE_HOURS", 336, 1),
  };
}

export interface BackupConfigError {
  code: "DATABASE_URL_MISSING" | "ENCRYPTION_KEY_MISSING" | "OFFSITE_REQUIRED";
  message: string;
}

/**
 * Backup'ın FİİLEN alınabilir olduğunu doğrular (fail-closed). Sorun listesi döndürür; boşsa runnable.
 *  - DATABASE_URL zorunlu.
 *  - Encryption anahtarı zorunlu ve geçerli (yoksa şifresiz backup ÜRETİLMEZ).
 *  - Production'da offsite storage zorunlu (yalnız-local production backup başarısız sayılır).
 */
export function checkBackupRunnable(cfg: BackupConfig): BackupConfigError[] {
  const errors: BackupConfigError[] = [];
  if (!cfg.databaseUrl) {
    errors.push({ code: "DATABASE_URL_MISSING", message: "DATABASE_URL tanımlı değil — backup alınamaz." });
  }
  try {
    assertEncryptionUsable(cfg.encryptionKey);
  } catch {
    errors.push({
      code: "ENCRYPTION_KEY_MISSING",
      message: "DATABASE_BACKUP_ENCRYPTION_KEY tanımlı/geçerli değil — şifresiz backup üretilmez (fail-closed).",
    });
  }
  if (cfg.requireOffsiteInProduction && !cfg.storage) {
    errors.push({
      code: "OFFSITE_REQUIRED",
      message: "Production backup offsite storage gerektirir — yalnız-local backup başarılı sayılmaz.",
    });
  }
  return errors;
}

export function resolvePgRunner(cfg: BackupConfig): PgToolRunner {
  return cfg.pg.mode === "docker"
    ? createDockerPgToolRunner({ image: cfg.pg.image, network: cfg.pg.network })
    : createDirectPgToolRunner(cfg.pg.binDir);
}

/** Offsite storage adapter (yoksa null). `localFallback` verilirse storage yokken local adapter döner. */
export function resolveStorageAdapter(
  cfg: BackupConfig,
  opts: { localFallbackDir?: string } = {},
): StorageAdapter | null {
  if (cfg.storage) return createS3StorageAdapter(cfg.storage);
  if (opts.localFallbackDir) return createLocalStorageAdapter(opts.localFallbackDir);
  return null;
}
