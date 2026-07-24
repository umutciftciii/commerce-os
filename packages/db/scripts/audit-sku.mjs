// TODO-160A (ADR-109…113) — SKU governance AUDIT scripti (SALT-OKUMA).
//
// Mağaza(lar)daki varyant SKU'larını tarar ve governance sorunlarını raporlar:
//   EMPTY · DUPLICATE · INVALID_CHARS · TOO_LONG · SKU_OPAQUE · BARCODE_EQUALS_SKU
// Her satır için deterministik ÖNERİLEN SKU (product slug + option kodları) üretir. DB'yi HİÇ değiştirmez.
//
// Kullanım:
//   node scripts/audit-sku.mjs                  # tüm store'lar, özet + ilk N problem
//   node scripts/audit-sku.mjs --store=edm-store
//   node scripts/audit-sku.mjs --limit=50       # raporlanan satır üst sınırı (default 100)
//   node scripts/audit-sku.mjs --json           # tam JSON (satırlar dahil, limit uygulanır)
//
// Çıktı yalnız kontrollü bilgidir (sayılar + variant/product ID'leri + SKU değerleri). Müşteri/kişisel
// veri RAPORLANMAZ. api-gateway sku-engine ile AYNI sınıflandırma + üretim algoritmasını kullanır.
import { PrismaClient } from "@prisma/client";
import { buildBaseSku, SKU_MAX_LENGTH } from "@commerce-os/utils";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const storeArg = args.find((a) => a.startsWith("--store="));
const limitArg = args.find((a) => a.startsWith("--limit="));
const storeId = storeArg ? storeArg.split("=")[1] : undefined;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;
const asJson = args.includes("--json");

const CONTRACT_SKU_CHARSET = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OPAQUE_SKU_PATTERN = /^V-[A-Za-z0-9]+-[a-z0-9]+$/;

// api-gateway classifySkuIssues ile birebir (DUPLICATE hariç — o store-frekansıyla ayrı eklenir).
function classify(sku, barcode) {
  const problems = [];
  const trimmed = (sku ?? "").trim();
  if (trimmed.length === 0) {
    problems.push("SKU_EMPTY");
    return problems;
  }
  if (!CONTRACT_SKU_CHARSET.test(trimmed)) problems.push("SKU_INVALID_CHARS");
  if (trimmed.length > SKU_MAX_LENGTH) problems.push("SKU_TOO_LONG");
  if (OPAQUE_SKU_PATTERN.test(trimmed)) problems.push("SKU_OPAQUE");
  if (barcode && barcode.length > 0 && barcode === sku) problems.push("BARCODE_EQUALS_SKU");
  return problems;
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

async function auditStore(storeScopeId) {
  const where = storeScopeId ? { storeId: storeScopeId } : {};

  // Eksen sırası (productId+attributeDefinitionId → position).
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
    orderBy: [{ storeId: "asc" }, { productId: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      storeId: true,
      productId: true,
      sku: true,
      barcode: true,
      skuSource: true,
      status: true,
      product: { select: { slug: true } },
      optionValueSelections: {
        select: { attributeDefinitionId: true, option: { select: { value: true } } },
      },
      attributeValues: {
        select: { attributeDefinitionId: true, optionId: true, option: { select: { value: true } } },
      },
    },
  });

  // Store-scoped duplicate frekansı (storeId|sku).
  const freq = new Map();
  for (const v of variants) {
    if (!v.sku) continue;
    const key = `${v.storeId}|${v.sku}`;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  const summary = {};
  const rows = [];
  for (const v of variants) {
    const problems = classify(v.sku, v.barcode);
    if (v.sku && (freq.get(`${v.storeId}|${v.sku}`) ?? 0) > 1) problems.push("DUPLICATE");
    if (problems.length === 0) continue;
    for (const p of problems) summary[p] = (summary[p] ?? 0) + 1;

    const byDef = new Map();
    for (const s of v.optionValueSelections) byDef.set(s.attributeDefinitionId, s.option?.value ?? null);
    for (const a of v.attributeValues) {
      if (a.optionId && !byDef.has(a.attributeDefinitionId)) byDef.set(a.attributeDefinitionId, a.option?.value ?? null);
    }
    const selections = [...byDef.entries()].map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value }));
    const optionCodes = orderOptionCodes(selections, axisByProduct.get(v.productId) ?? new Map());
    const suggested = buildBaseSku({ productCode: v.product.slug, optionCodes }).base;

    rows.push({
      store: v.storeId,
      product: v.productId,
      variant: v.id,
      currentSku: v.sku,
      skuSource: v.skuSource,
      status: v.status,
      problems,
      suggestedSku: suggested,
    });
  }

  return { scanned: variants.length, flagged: rows.length, summary, rows };
}

async function main() {
  const result = await auditStore(storeId);
  const truncated = result.rows.length > limit;
  const report = {
    mode: "audit (read-only)",
    storeScope: storeId ?? "all",
    scanned: result.scanned,
    flagged: result.flagged,
    summary: result.summary,
    truncated,
    rows: result.rows.slice(0, limit),
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      JSON.stringify(
        { mode: report.mode, storeScope: report.storeScope, scanned: report.scanned, flagged: report.flagged, summary: report.summary, truncated },
        null,
        2,
      ),
    );
    if (report.rows.length > 0) {
      console.log(`\nİlk ${report.rows.length} problem (--json ile tümü):`);
      for (const r of report.rows) {
        console.log(`  [${r.problems.join(",")}] ${r.store} ${r.variant} sku="${r.currentSku}" → öneri="${r.suggestedSku}" (${r.skuSource})`);
      }
    }
  }
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
