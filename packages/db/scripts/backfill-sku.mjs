// TODO-160A (ADR-113) — SKU governance BACKFILL scripti (GÜVENLİ; varsayılan DRY-RUN).
//
// Yalnız BOŞ (veya açıkça seçilen OPAK `V-<id>-<hash>`) SKU'ları deterministik okunabilir SKU ile
// doldurur. GEÇERLİ mevcut SKU'lara ASLA dokunmaz. OrderLine snapshot'larını DEĞİŞTİRMEZ (yalnız
// ProductVariant.sku). Yazılan her SKU skuSource=AUTO olur ve AuditLog'a işlenir.
//
// GÜVENLİK KURALLARI (ADR-108/113):
//   * Varsayılan DRY-RUN — `--apply` olmadan HİÇBİR yazma yok.
//   * `--apply` için `--store=<id>` ZORUNLU (tüm-store toplu yazma kazara engellenir).
//   * Row-count circuit breaker: aday sayısı --max-rows'u (default 1000) aşarsa `--force` gerekir.
//   * Yalnız EMPTY (varsayılan) veya `--include-opaque` ile OPAK SKU'lar hedeflenir.
//   * Yazmadan önce backup önerisi basılır.
//
// Kullanım:
//   node scripts/backfill-sku.mjs --store=edm-store                  # dry-run (varsayılan)
//   node scripts/backfill-sku.mjs --store=edm-store --include-opaque # dry-run, opak dahil
//   node scripts/backfill-sku.mjs --store=edm-store --apply          # GERÇEK yazma (empty)
//   node scripts/backfill-sku.mjs --store=edm-store --include-opaque --apply --actor=<platformUserId>
import { PrismaClient } from "@prisma/client";
import { buildBaseSku, resolveUniqueSku, SKU_MAX_LENGTH } from "@commerce-os/utils";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeOpaque = args.includes("--include-opaque");
const force = args.includes("--force");
const storeArg = args.find((a) => a.startsWith("--store="));
const actorArg = args.find((a) => a.startsWith("--actor="));
const maxRowsArg = args.find((a) => a.startsWith("--max-rows="));
const storeId = storeArg ? storeArg.split("=")[1] : undefined;
const actorUserId = actorArg ? actorArg.split("=")[1] : null;
const maxRows = maxRowsArg ? Number(maxRowsArg.split("=")[1]) : 1000;

const OPAQUE_SKU_PATTERN = /^V-[A-Za-z0-9]+-[a-z0-9]+$/;

function isEmptySku(sku) {
  return !sku || sku.trim().length === 0;
}
function isOpaqueSku(sku) {
  return typeof sku === "string" && OPAQUE_SKU_PATTERN.test(sku.trim());
}

function orderOptionCodes(selections, axisPos) {
  return selections
    .filter((s) => s.value)
    .sort((a, b) => {
      const pa = axisPos.get(a.attributeDefinitionId) ?? Number.MAX_SAFE_INTEGER;
      const pb = axisPos.get(b.attributeDefinitionId) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.attributeDefinitionId < b.attributeDefinitionId ? -1 : 1;
    })
    .map((s) => s.value);
}

async function main() {
  if (apply && !storeId) {
    console.error("HATA: --apply için --store=<id> ZORUNLU (kazara tüm-store yazma engellenir).");
    process.exit(1);
  }

  const where = storeId ? { storeId } : {};

  const axes = await prisma.productVariantAttribute.findMany({
    where,
    select: { productId: true, attributeDefinitionId: true, position: true },
  });
  const axisByProduct = new Map();
  for (const a of axes) {
    if (!axisByProduct.has(a.productId)) axisByProduct.set(a.productId, new Map());
    axisByProduct.get(a.productId).set(a.attributeDefinitionId, a.position);
  }

  const variants = await prisma.productVariant.findMany({
    where,
    orderBy: [{ storeId: "asc" }, { productId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      storeId: true,
      productId: true,
      sku: true,
      product: { select: { slug: true } },
      optionValueSelections: {
        select: { attributeDefinitionId: true, option: { select: { value: true } } },
      },
      attributeValues: {
        select: { attributeDefinitionId: true, optionId: true, option: { select: { value: true } } },
      },
    },
  });

  // Store-scoped mevcut SKU kümesi (collision temeli) — GEÇERLİ SKU'lar korunur.
  const takenByStore = new Map();
  for (const v of variants) {
    if (isEmptySku(v.sku)) continue;
    if (!takenByStore.has(v.storeId)) takenByStore.set(v.storeId, new Set());
    takenByStore.get(v.storeId).add(v.sku);
  }

  // Adaylar: EMPTY (varsayılan) + opsiyonel OPAK. GEÇERLİ SKU'lar aday DEĞİL (dokunulmaz).
  const candidates = variants.filter(
    (v) => isEmptySku(v.sku) || (includeOpaque && isOpaqueSku(v.sku)),
  );

  if (candidates.length > maxRows && !force) {
    console.error(
      JSON.stringify(
        {
          mode: "aborted",
          reason: "ROW_COUNT_CIRCUIT_BREAKER",
          candidates: candidates.length,
          maxRows,
          hint: "İnceleyip onayladıysanız --force ile tekrar çalıştırın.",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const plan = [];
  for (const v of candidates) {
    const taken = takenByStore.get(v.storeId) ?? new Set();
    const byDef = new Map();
    for (const s of v.optionValueSelections) byDef.set(s.attributeDefinitionId, s.option?.value ?? null);
    for (const a of v.attributeValues) {
      if (a.optionId && !byDef.has(a.attributeDefinitionId)) byDef.set(a.attributeDefinitionId, a.option?.value ?? null);
    }
    const selections = [...byDef.entries()].map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value }));
    const optionCodes = orderOptionCodes(selections, axisByProduct.get(v.productId) ?? new Map());
    const base = buildBaseSku({ productCode: v.product.slug, optionCodes }).base;
    const resolved = resolveUniqueSku(base, (c) => taken.has(c), { maxLength: SKU_MAX_LENGTH });
    taken.add(resolved.sku);
    if (!takenByStore.has(v.storeId)) takenByStore.set(v.storeId, taken);
    plan.push({ storeId: v.storeId, variantId: v.id, productId: v.productId, oldSku: v.sku ?? "", newSku: resolved.sku });
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          storeScope: storeId ?? "all",
          includeOpaque,
          scanned: variants.length,
          candidates: candidates.length,
          wouldWrite: plan.length,
          backupHint: "Gerçek yazma öncesi: pnpm db:backup pre-sku-backfill",
          sample: plan.slice(0, 20),
        },
        null,
        2,
      ),
    );
    return;
  }

  // GERÇEK yazma: her aday tek update + AuditLog (tek transaction/aday). OrderLine'a DOKUNULMAZ.
  console.log(`GERÇEK yazma başlıyor (${plan.length} varyant). Backup önerisi: pnpm db:backup pre-sku-backfill`);
  let written = 0;
  let conflicts = 0;
  for (const item of plan) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.productVariant.update({
          where: { id: item.variantId, storeId: item.storeId },
          data: { sku: item.newSku, skuSource: "AUTO" },
        });
        await tx.auditLog.create({
          data: {
            action: "SYSTEM",
            storeId: item.storeId,
            platformUserId: actorUserId,
            entityType: "ProductVariant",
            entityId: item.variantId,
            metadata: {
              field: "sku",
              oldValue: item.oldSku,
              newValue: item.newSku,
              source: "AUTO",
              reason: "sku-backfill",
            },
          },
        });
      });
      written += 1;
    } catch (error) {
      // P2002 (yarış/başka satır aynı SKU) → atla + say (deterministik, sessizce bozmaz).
      if (error && error.code === "P2002") {
        conflicts += 1;
      } else {
        throw error;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        storeScope: storeId,
        includeOpaque,
        scanned: variants.length,
        candidates: candidates.length,
        written,
        conflicts,
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
