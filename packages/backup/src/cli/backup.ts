/**
 * PB-2/PB-3 — `db:backup:run` CLI. Gerçek pg_dump + encrypt + (offsite) upload + remote HEAD doğrulama.
 * Kullanım:  node dist/cli/backup.js [--dry-run] [--json]
 */
import path from "node:path";
import { createLogger } from "@commerce-os/logger";
import { loadBackupConfig, resolvePgRunner, resolveStorageAdapter } from "../config.js";
import { readMigrationInfo } from "../migration-info.js";
import { runBackup, BackupError } from "../backup-service.js";
import { redactError } from "../redaction.js";
import { parseArgs } from "./args.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger("db-backup");
  const cfg = loadBackupConfig(process.env);
  const pg = resolvePgRunner(cfg);
  const storage = resolveStorageAdapter(cfg);
  const migrationsDir =
    process.env.DATABASE_BACKUP_MIGRATIONS_DIR ?? path.join(process.cwd(), "packages/db/prisma/migrations");

  try {
    const result = await runBackup(
      {
        cfg,
        pg,
        storage,
        logger,
        now: () => new Date(),
        appCommitSha: process.env.GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? null,
        migrationInfo: await readMigrationInfo(migrationsDir),
      },
      { dryRun: args.bool("dry-run") },
    );
    if (args.bool("json")) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(
        `[backup] ${result.outcome} base=${result.base} size=${result.encryptedSize ?? "-"} ` +
          `offsite=${result.storageDescribe ?? "NONE"} remoteVerified=${result.remoteVerified} ` +
          `durationMs=${result.durationMs}\n`,
      );
    }
  } catch (error) {
    const safe = redactError(error, [cfg.databaseUrl, cfg.encryptionKey, cfg.storage?.secretAccessKey]);
    const code = error instanceof BackupError ? error.code : "ERROR";
    process.stderr.write(`[backup] FAILED code=${code} ${safe.message}\n`);
    process.exit(1);
  }
}

void main();
