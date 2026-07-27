/**
 * PB-2/PB-3 — `db:backup:retention` CLI. GFS retention (varsayılan dry-run; --apply ile siler).
 * Kullanım:  node dist/cli/retention.js [--apply] [--include-local] [--json]
 */
import { createLogger } from "@commerce-os/logger";
import { loadBackupConfig, resolveStorageAdapter } from "../config.js";
import { createLocalStorageAdapter } from "../storage/local.js";
import { runRetention } from "../retention-service.js";
import { redactError } from "../redaction.js";
import { parseArgs } from "./args.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger("db-backup-retention");
  const cfg = loadBackupConfig(process.env);

  // Birincil envanter: offsite (varsa), yoksa local dizin.
  const offsite = resolveStorageAdapter(cfg, { localFallbackDir: cfg.localDir });
  if (!offsite) {
    process.stderr.write("[retention] Ne offsite ne local dizin çözülebildi.\n");
    process.exit(2);
    return;
  }
  const prefix = cfg.storage?.prefix ?? "";
  const includeLocal = args.bool("include-local") && cfg.storage !== null;

  try {
    const report = await runRetention({
      offsite,
      prefix,
      policy: cfg.retention,
      dryRun: !args.bool("apply"),
      local: includeLocal ? { adapter: createLocalStorageAdapter(cfg.localDir), prefix: "" } : undefined,
      logger,
    });
    if (args.bool("json")) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(
        `[retention] ${report.dryRun ? "DRY-RUN" : "APPLIED"} total=${report.offsite.total} ` +
          `retained=${report.offsite.retained.length} purge=${report.offsite.purged.length} ` +
          `incomplete=${report.offsite.incomplete.length}` +
          (report.parity ? ` parityDrift=${report.parity.onlyLocal.length + report.parity.onlyRemote.length}` : "") +
          `\n`,
      );
    }
  } catch (error) {
    const safe = redactError(error, [cfg.databaseUrl, cfg.storage?.secretAccessKey]);
    process.stderr.write(`[retention] ERROR ${safe.message}\n`);
    process.exit(1);
  }
}

void main();
