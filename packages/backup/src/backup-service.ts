/**
 * PB-2/PB-3 — Backup orkestrasyonu.
 *
 * AKIŞ (spec §3-§6, §12):
 *   dump(pg_dump) → zero-byte guard → encrypt(AES-256-GCM) → checksum(sha256) → manifest(secret'siz)
 *   → atomik rename(.part→final) → offsite upload → remote HEAD/checksum doğrula → COMPLETED.
 *
 * Kurallar:
 *  - Yarım dosya final adıyla görünmez: önce `.part`, başarıda atomik rename.
 *  - Upload tamamlanıp remote HEAD (boyut + sha256 metadata) doğrulanmadan job COMPLETED olmaz.
 *  - Temp/ham dump `finally`'de temizlenir; final artefaktlar localDir'de kalır (local tier).
 *  - Fail-closed: encryption anahtarı yoksa ya da production'da offsite yoksa üretim REDDEDİLİR.
 *  - Secret ASLA loglanmaz; hata mesajları çağıran katmanda redakte edilir.
 */
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "@commerce-os/logger";
import { sha256File, formatChecksumFile } from "./checksum.js";
import { checkBackupRunnable, type BackupConfig } from "./config.js";
import { encryptFile, ENCRYPTION_METHOD, ENVELOPE_VERSION } from "./crypto.js";
import { buildManifest, assertManifestHasNoSecrets, type BackupManifest } from "./manifest.js";
import { signManifest } from "./manifest-integrity.js";
import { buildArtifactNames, buildObjectKey } from "./naming.js";
import { parsePgConnection, type PgToolRunner } from "./pg.js";
import type { StorageAdapter } from "./storage/types.js";

export class BackupError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

export interface BackupServiceDeps {
  cfg: BackupConfig;
  pg: PgToolRunner;
  storage: StorageAdapter | null;
  logger: Logger;
  now: () => Date;
  appCommitSha?: string | null;
  migrationInfo?: { count: number; latest: string | null };
}

export interface BackupResult {
  outcome: "COMPLETED" | "DRY_RUN";
  base: string;
  environment: string;
  dumpObjectKey: string | null;
  checksumSha256: string | null;
  encryptedSize: number | null;
  postgresVersion: string;
  migration: { count: number; latest: string | null };
  durationMs: number;
  timings: { dumpMs: number; encryptMs: number; uploadMs: number };
  localPaths: { dump: string; checksum: string; manifest: string } | null;
  remoteVerified: boolean;
  storageDescribe: string | null;
  manifest: BackupManifest | null;
}

export async function runBackup(
  deps: BackupServiceDeps,
  opts: { dryRun?: boolean } = {},
): Promise<BackupResult> {
  const { cfg, pg, storage, logger, now } = deps;
  const startedAt = now();

  // Fail-closed config doğrulaması (dry-run dahil — yanlış yapılandırma erken yakalanır).
  const errors = checkBackupRunnable(cfg);
  if (errors.length > 0) {
    throw new BackupError(errors[0]!.code, errors.map((e) => e.message).join(" | "));
  }
  // pg_dump KAYNAĞI ayrı verilebilir (replica / host-vs-container adres); jobLog prisma URL'inden bağımsız.
  const conn = parsePgConnection(cfg.sourceDatabaseUrl ?? cfg.databaseUrl!);
  const names = buildArtifactNames(cfg.environment, startedAt);
  const migration = deps.migrationInfo ?? { count: 0, latest: null };

  const postgresVersion = await pg.serverVersion(conn);

  if (opts.dryRun) {
    logger.info("backup dry-run", {
      environment: cfg.environment,
      base: names.base,
      offsite: storage ? storage.describe : "NONE",
      postgresVersion,
    });
    return {
      outcome: "DRY_RUN",
      base: names.base,
      environment: cfg.environment,
      dumpObjectKey: storage ? buildObjectKey(cfg.storage?.prefix ?? "", names.dump) : null,
      checksumSha256: null,
      encryptedSize: null,
      postgresVersion,
      migration,
      durationMs: now().getTime() - startedAt.getTime(),
      timings: { dumpMs: 0, encryptMs: 0, uploadMs: 0 },
      localPaths: null,
      remoteVerified: false,
      storageDescribe: storage ? storage.describe : null,
      manifest: null,
    };
  }

  await mkdir(cfg.localDir, { recursive: true });
  const rawPath = path.join(cfg.localDir, `${names.base}.dump.raw.part`);
  const encPartPath = path.join(cfg.localDir, `${names.dump}.part`);
  const encPath = path.join(cfg.localDir, names.dump);
  const checksumPath = path.join(cfg.localDir, names.checksum);
  const manifestPath = path.join(cfg.localDir, names.manifest);

  const timings = { dumpMs: 0, encryptMs: 0, uploadMs: 0 };
  try {
    // 1) dump → ham temp
    let t = now().getTime();
    await pg.dump(conn, rawPath, cfg.pg.format);
    timings.dumpMs = now().getTime() - t;

    // 2) zero-byte guard
    const rawStat = await stat(rawPath).catch(() => null);
    if (!rawStat || rawStat.size === 0) {
      throw new BackupError("EMPTY_DUMP", "pg_dump boş/oluşmadı (0 byte) — backup reddedildi.");
    }

    // 3) encrypt → .part (atomik rename için); envelope version+keyId taşır
    t = now().getTime();
    await encryptFile({ key: cfg.encryptionKey, keyId: cfg.encryptionKeyId, sourcePath: rawPath, destPath: encPartPath });
    timings.encryptMs = now().getTime() - t;

    // 4) checksum (şifreli artefakt üzerinden)
    const checksum = await sha256File(encPartPath);
    const encStat = await stat(encPartPath);

    // 5) atomik rename (.part → final) — yarım dosya asla final adıyla görünmez
    await rename(encPartPath, encPath);
    await writeFile(checksumPath, formatChecksumFile(checksum, names.dump), { mode: 0o600 });

    // 6) manifest (secret'siz)
    const completedAt = now();
    const objectKey = storage ? buildObjectKey(cfg.storage?.prefix ?? "", names.dump) : names.dump;
    const manifest = buildManifest({
      base: names.base,
      environment: cfg.environment,
      status: "COMPLETED",
      createdAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      postgresVersion,
      appCommitSha: deps.appCommitSha ?? null,
      migration,
      dump: { format: cfg.pg.format, objectKey, encryptedSize: encStat.size, checksumSha256: checksum },
      encryption: { method: ENCRYPTION_METHOD, envelopeVersion: ENVELOPE_VERSION, keyId: cfg.encryptionKeyId },
      storage: { kind: storage ? storage.kind : "local", describe: storage ? storage.describe : `local://${cfg.localDir}` },
    });
    // Manifest HMAC ile imzalanır (kurcalanma → restore/verify reddeder). Key DEĞERİ manifestte YOK.
    const manifestJson = signManifest(manifest, cfg.encryptionKey);
    assertManifestHasNoSecrets(manifestJson);
    await writeFile(manifestPath, manifestJson, { mode: 0o600 });

    // 7) offsite upload + remote HEAD/checksum doğrulama
    let remoteVerified = false;
    if (storage) {
      t = now().getTime();
      await storage.putFile(objectKey, encPath, { sha256: checksum, contentType: "application/octet-stream" });
      await storage.putFile(buildObjectKey(cfg.storage?.prefix ?? "", names.checksum), checksumPath, { contentType: "text/plain" });
      await storage.putFile(buildObjectKey(cfg.storage?.prefix ?? "", names.manifest), manifestPath, { contentType: "application/json" });
      timings.uploadMs = now().getTime() - t;

      const head = await storage.head(objectKey);
      if (!head) throw new BackupError("REMOTE_MISSING", "Upload sonrası remote obje bulunamadı (HEAD null).");
      if (head.size !== encStat.size) {
        throw new BackupError("REMOTE_SIZE_MISMATCH", `Remote boyut uyuşmuyor (local=${encStat.size}, remote=${head.size}).`);
      }
      if (head.sha256 && head.sha256.toLowerCase() !== checksum.toLowerCase()) {
        throw new BackupError("REMOTE_CHECKSUM_MISMATCH", "Remote sha256 metadata local checksum ile uyuşmuyor.");
      }
      remoteVerified = true;
    }

    logger.info("backup completed", {
      environment: cfg.environment,
      base: names.base,
      encryptedSize: encStat.size,
      offsite: storage ? storage.describe : "NONE",
      remoteVerified,
      dumpMs: timings.dumpMs,
      uploadMs: timings.uploadMs,
    });

    return {
      outcome: "COMPLETED",
      base: names.base,
      environment: cfg.environment,
      dumpObjectKey: objectKey,
      checksumSha256: checksum,
      encryptedSize: encStat.size,
      postgresVersion,
      migration,
      durationMs: now().getTime() - startedAt.getTime(),
      timings,
      localPaths: { dump: encPath, checksum: checksumPath, manifest: manifestPath },
      remoteVerified,
      storageDescribe: storage ? storage.describe : null,
      manifest,
    };
  } finally {
    // Ham dump + yarım .part her zaman temizlenir (temp cleanup; final artefaktlar kalır).
    await rm(rawPath, { force: true }).catch(() => {});
    await rm(encPartPath, { force: true }).catch(() => {});
  }
}
