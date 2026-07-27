/**
 * PB-2/PB-3 — `db:verify-restore` CLI. İzole hedefe gerçek restore + bütünlük doğrulaması.
 * Kullanım:
 *   node dist/cli/verify.js --target-url <isolated-url> (--file <path>|--object-key <key>) \
 *     --confirm-destructive [--manifest <path>] [--expected-migration-latest <name>] [--json]
 *
 * Hedef MUTLAKA izole olmalı (production/mevcut DB guard'ları aktiftir). Fixture-özel kontroller smoke
 * script'inde yapılır; bu CLI genel doğrulamayı (tablolar + migration + integrity) çalıştırır.
 */
import { readFile } from "node:fs/promises";
import { createLogger } from "@commerce-os/logger";
import { loadBackupConfig, resolvePgRunner, resolveStorageAdapter } from "../config.js";
import { runRestoreVerification } from "../verify-service.js";
import { verifyAndParseManifest, assertManifestEnvironment } from "../manifest-integrity.js";
import { redactError } from "../redaction.js";
import { parseArgs } from "./args.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger("db-verify-restore");
  const cfg = loadBackupConfig(process.env);

  const targetUrl = args.get("target-url");
  if (!targetUrl) {
    process.stderr.write("[verify] --target-url zorunlu (izole hedef).\n");
    process.exit(2);
    return;
  }
  const encryptionKey = args.get("encryption-key") ?? cfg.encryptionKey;
  if (!encryptionKey) {
    process.stderr.write("[verify] Encryption anahtarı yok.\n");
    process.exit(2);
    return;
  }

  let expectedChecksum = args.get("expected-checksum");
  let expectedMigrationLatest = args.get("expected-migration-latest");
  if (args.get("manifest")) {
    // Manifest HMAC ile doğrulanır (kurcalanma → reddedilir); ortam guard'ı (cross-environment engeli).
    const manifest = verifyAndParseManifest(await readFile(args.get("manifest")!, "utf8"), encryptionKey);
    const expectedEnv = args.get("expected-environment");
    if (expectedEnv) assertManifestEnvironment(manifest, expectedEnv);
    expectedChecksum ??= manifest.dump.checksumSha256;
    expectedMigrationLatest ??= manifest.migration.latest ?? undefined;
  }

  const pg = resolvePgRunner(cfg);
  const storage = args.get("object-key") ? resolveStorageAdapter(cfg) : null;

  try {
    const report = await runRestoreVerification(
      { pg, storage, logger, now: () => new Date() },
      {
        restore: {
          file: args.get("file"),
          objectKey: args.get("object-key"),
          expectedChecksum,
          encryptionKey,
          targetUrl,
          format: (args.get("format") as "custom" | "plain") ?? cfg.pg.format,
          guard: {
            confirmDestructive: args.bool("confirm-destructive"),
            allowProductionTarget: args.bool("allow-production-target"),
            confirmProductionRestore: args.bool("confirm-production-restore"),
            allowRestoreOverCurrent: args.bool("allow-restore-over-current"),
            currentDatabaseUrl: cfg.databaseUrl,
          },
        },
        expectedMigrationLatest: expectedMigrationLatest ?? undefined,
      },
    );
    if (args.bool("json")) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(
        `[verify] ${report.ok ? "OK" : "FAIL"} tables=${report.tables.length} ` +
          `migrations=${report.migrations.count} failures=${report.failures.length} ` +
          `restoreMs=${report.restoreDurationMs}\n`,
      );
      for (const f of report.failures) process.stderr.write(`  - ${f}\n`);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    const safe = redactError(error, [cfg.databaseUrl, encryptionKey, cfg.storage?.secretAccessKey, targetUrl]);
    process.stderr.write(`[verify] ERROR ${safe.message}\n`);
    process.exit(1);
  }
}

void main();
