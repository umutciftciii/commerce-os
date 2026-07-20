/**
 * Enterprise Demo Dataset — SEED ENTRYPOINT.
 *
 * Kullanım (docker api-gateway içinde veya DATABASE_URL ayarlı host'ta):
 *   node packages/db/scripts/enterprise-seed.mjs            # seed (temizle+yeniden oluştur, enterprise-demo scope)
 *   node packages/db/scripts/enterprise-seed.mjs --dry-run  # YAZMAZ; yalnız dağılım özeti (JSON)
 *   node packages/db/scripts/enterprise-seed.mjs --summary  # --dry-run ile aynı
 *   node packages/db/scripts/enterprise-seed.mjs --json     # sonucu makine-okunur JSON olarak bas
 *
 * Güvenlik: YALNIZ enterprise-demo store scope'unda çalışır (persist guard). `demo-store` ve
 * üretim/müşteri verisine ASLA dokunmaz. Deterministik + idempotent (tekrar çalıştırma güvenli).
 */

import { generateDataset } from "./enterprise/catalog.mjs";
import { summarize } from "./enterprise/summary.mjs";
import { STORE_SLUG } from "./enterprise/constants.mjs";

function parseArgs(argv) {
  const set = new Set(argv.slice(2));
  return {
    dryRun: set.has("--dry-run") || set.has("--summary"),
    json: set.has("--json"),
    help: set.has("--help") || set.has("-h"),
  };
}

function printHelp() {
  console.log(`Enterprise Demo Dataset seed
  --dry-run / --summary  Yazmadan dağılım özetini göster
  --json                 Sonucu JSON olarak bas
  --help                 Bu yardım`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return printHelp();

  const t0 = Date.now();
  const ds = generateDataset();
  const genMs = Date.now() - t0;
  const summary = summarize(ds);

  if (args.dryRun) {
    const payload = { mode: "dry-run", store: STORE_SLUG, generateMs: genMs, summary };
    if (args.json) console.log(JSON.stringify(payload));
    else {
      console.log(`[enterprise-seed] DRY-RUN — store=${STORE_SLUG} (yazma YOK)`);
      console.log(`  üretim süresi: ${genMs} ms`);
      console.log(JSON.stringify(summary, null, 2));
    }
    return;
  }

  // Gerçek yazma yalnız burada @prisma/client yükler (dry-run/host'ta prisma gerekmez).
  const { persistDataset } = await import("./enterprise/persist.mjs");
  const result = await persistDataset(ds);

  const payload = {
    mode: "seed",
    store: STORE_SLUG,
    generateMs: genMs,
    persistMs: result.durationMs,
    totalMs: Date.now() - t0,
    counts: result.counts,
    placeholders: result.placeholders,
    summary,
  };
  if (args.json) {
    console.log(JSON.stringify(payload));
  } else {
    console.log(`[enterprise-seed] OK — store=${STORE_SLUG}`);
    console.log(`  üretim: ${genMs} ms · yazma: ${result.durationMs} ms · toplam: ${payload.totalMs} ms`);
    console.log(`  yazılan satırlar:`, JSON.stringify(result.counts));
    console.log(`  yer tutucu görseller:`, JSON.stringify(result.placeholders));
    console.log(`  dağılım:`, JSON.stringify(summary));
  }
}

main().catch((error) => {
  console.error("[enterprise-seed] HATA:", error);
  process.exit(1);
});
