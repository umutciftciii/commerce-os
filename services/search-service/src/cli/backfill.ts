/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search read-model backfill/rebuild CLI.
 *
 * Kullanım:
 *   pnpm --filter @commerce-os/search-service search:backfill --store <storeId> [--batch-size 200]
 *   pnpm --filter @commerce-os/search-service search:backfill --all [--batch-size 200]
 *   ... --dry-run     → yalnız kaç ürün taranacağını raporlar, YAZMAZ.
 *
 * Güvenlik/garanti:
 *  - PER-ÜRÜN ATOMİK upsert → rebuild yarıda kesilse bile read-model asla boş/bozuk kalmaz (truncate
 *    YOK; işlenmemiş ürünler PRIOR dokümanıyla geçerli kalır). Alias/blue-green GEREKMEZ (sade çözüm).
 *  - RESUMABLE + idempotent (id-cursor; tekrar çalıştırma güvenli).
 *  - Katalog belleğe YÜKLENMEZ; transaction katalog boyu açık tutulmaz (chunk başına tx).
 *  - store-scoped (tenant isolation); --all mağazaları TEK TEK dolaşır.
 */

import { prisma } from "@commerce-os/db";
import { loadConfig } from "@commerce-os/config";
import { createLogger } from "@commerce-os/logger";
import { createDefaultSearchProvider } from "../index.js";

interface CliArgs {
  storeIds: string[];
  all: boolean;
  batchSize: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { storeIds: [], all: false, batchSize: 200, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") args.all = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--store") {
      const value = argv[++i];
      if (value) args.storeIds.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (arg === "--batch-size") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) args.batchSize = Math.floor(value);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
  const args = parseArgs(process.argv.slice(2));

  if (!args.all && args.storeIds.length === 0) {
    logger.error("backfill: --store <id> veya --all gerekli");
    process.exitCode = 1;
    return;
  }

  const storeIds = args.all
    ? (await prisma.store.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((s) => s.id)
    : args.storeIds;

  logger.info("backfill start", { stores: storeIds.length, batchSize: args.batchSize, dryRun: args.dryRun });

  if (args.dryRun) {
    for (const storeId of storeIds) {
      const count = await prisma.product.count({ where: { storeId } });
      logger.info("backfill dry-run", { storeId, productCount: count });
    }
    await prisma.$disconnect();
    return;
  }

  const provider = createDefaultSearchProvider();
  let totalIndexed = 0;
  let totalRemoved = 0;
  let totalFailed = 0;

  for (const storeId of storeIds) {
    const report = await provider.backfillStore(storeId, { batchSize: args.batchSize });
    totalIndexed += report.indexed;
    totalRemoved += report.removed;
    totalFailed += report.failed;
    logger.info("backfill store done", {
      storeId,
      batches: report.batches,
      scanned: report.scanned,
      indexed: report.indexed,
      removed: report.removed,
      failed: report.failed,
      durationMs: report.durationMs,
    });
    // İlk birkaç hatayı raporla (poison tanısı; tümünü basmaz).
    for (const err of report.errors.slice(0, 10)) {
      logger.error("backfill product failed", { storeId, productId: err.productId, message: err.message });
    }
  }

  logger.info("backfill complete", {
    stores: storeIds.length,
    indexed: totalIndexed,
    removed: totalRemoved,
    failed: totalFailed,
  });
  await prisma.$disconnect();
  if (totalFailed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("backfill fatal", error);
  process.exit(1);
});
