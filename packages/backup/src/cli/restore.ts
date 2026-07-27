/**
 * PB-2/PB-3 — `db:restore` CLI. GERÇEK restore (demo re-seed DEĞİL).
 * Kullanım:
 *   node dist/cli/restore.js --target-url <url> (--file <path> | --object-key <key>) \
 *     --confirm-destructive [--expected-checksum <hex>] [--format custom|plain] \
 *     [--allow-production-target --confirm-production-restore] [--allow-restore-over-current] \
 *     [--no-reset] [--json]
 *
 * Varsayılan olarak mevcut/production DB'nin üzerine restore YAPMAZ (guard'lar). Parola/URL loglanmaz.
 */
import { readFile } from "node:fs/promises";
import { createLogger } from "@commerce-os/logger";
import { loadBackupConfig, resolvePgRunner, resolveStorageAdapter } from "../config.js";
import { runRestore, RestoreError } from "../restore-service.js";
import { RestoreGuardError } from "../guards.js";
import { verifyAndParseManifest, assertManifestEnvironment } from "../manifest-integrity.js";
import { redactError } from "../redaction.js";
import { parseArgs } from "./args.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger("db-restore");
  const cfg = loadBackupConfig(process.env);

  const targetUrl = args.get("target-url");
  if (!targetUrl) {
    process.stderr.write("[restore] --target-url zorunlu.\n");
    process.exit(2);
    return;
  }
  const encryptionKey = args.get("encryption-key") ?? cfg.encryptionKey;
  if (!encryptionKey) {
    process.stderr.write("[restore] Encryption anahtarı yok (--encryption-key ya da DATABASE_BACKUP_ENCRYPTION_KEY).\n");
    process.exit(2);
    return;
  }

  // Manifest verilirse HMAC ile doğrulanır (kurcalanma → reddedilir) + ortam guard'ı + checksum türetilir.
  let expectedChecksum = args.get("expected-checksum");
  if (args.get("manifest")) {
    const manifest = verifyAndParseManifest(await readFile(args.get("manifest")!, "utf8"), encryptionKey);
    const expectedEnv = args.get("expected-environment");
    if (expectedEnv) assertManifestEnvironment(manifest, expectedEnv);
    expectedChecksum ??= manifest.dump.checksumSha256;
  }

  const pg = resolvePgRunner(cfg);
  const storage = args.get("object-key") ? resolveStorageAdapter(cfg) : null;
  const allowlist = args.get("allowlist-hosts")?.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const result = await runRestore(
      { pg, storage, logger, now: () => new Date() },
      {
        file: args.get("file"),
        objectKey: args.get("object-key"),
        expectedChecksum,
        encryptionKey,
        targetUrl,
        format: (args.get("format") as "custom" | "plain") ?? cfg.pg.format,
        resetTarget: !args.bool("no-reset"),
        guard: {
          confirmDestructive: args.bool("confirm-destructive"),
          allowProductionTarget: args.bool("allow-production-target"),
          confirmProductionRestore: args.bool("confirm-production-restore"),
          allowRestoreOverCurrent: args.bool("allow-restore-over-current"),
          allowlistHosts: allowlist,
          currentDatabaseUrl: cfg.databaseUrl,
        },
      },
    );
    if (args.bool("json")) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(
        `[restore] OK targetHost=${result.targetHost} restoreMs=${result.timings.restoreMs} durationMs=${result.durationMs}\n`,
      );
    }
  } catch (error) {
    const safe = redactError(error, [cfg.databaseUrl, encryptionKey, cfg.storage?.secretAccessKey, targetUrl]);
    const code =
      error instanceof RestoreError || error instanceof RestoreGuardError ? error.code : "ERROR";
    process.stderr.write(`[restore] FAILED code=${code} ${safe.message}\n`);
    process.exit(1);
  }
}

void main();
