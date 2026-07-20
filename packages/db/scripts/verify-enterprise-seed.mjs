/**
 * Enterprise Demo Dataset — SEED SONRASI DOĞRULAMA (invariant kontrolleri).
 *
 * Yalnız enterprise-demo store scope'unu okur. Seed + search backfill sonrası çalıştırılır:
 *   node packages/db/scripts/enterprise-seed.mjs
 *   pnpm --filter @commerce-os/search-service search:backfill --store edm-store
 *   node packages/db/scripts/verify-enterprise-seed.mjs
 *
 * Search read-model kontrolleri backfill'e bağlıdır; backfill çalışmadıysa --skip-search ile atla.
 */

import { PrismaClient } from "@prisma/client";
import { STORE_ID, STORE_SLUG } from "./enterprise/constants.mjs";

const prisma = new PrismaClient();
const skipSearch = process.argv.includes("--skip-search");

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
}

async function main() {
  const store = await prisma.store.findUnique({ where: { slug: STORE_SLUG } });
  check("store exists & ACTIVE", store && store.status === "ACTIVE" && store.id === STORE_ID, { id: store?.id, status: store?.status });
  if (!store) throw fail();
  const where = { storeId: STORE_ID };

  const [products, activeProducts, categories, variants, brands] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.count({ where: { ...where, status: "ACTIVE" } }),
    prisma.productCategory.count({ where }),
    prisma.productVariant.count({ where }),
    prisma.product.findMany({ where, select: { brand: true }, distinct: ["brand"] }),
  ]);
  check("product count ≥ 300", products >= 300, { products });
  check("category count ≥ 30", categories >= 30, { categories });
  check("brand count ≥ 50", brands.length >= 50, { brands: brands.length });
  check("variant count ≥ 2000", variants >= 2000, { variants });

  // Duplicate SKU / slug.
  const dupSku = await prisma.productVariant.groupBy({ by: ["sku"], where, _count: { sku: true }, having: { sku: { _count: { gt: 1 } } } });
  check("no duplicate SKU", dupSku.length === 0, { dupGroups: dupSku.length });
  const dupSlug = await prisma.product.groupBy({ by: ["slug"], where, _count: { slug: true }, having: { slug: { _count: { gt: 1 } } } });
  check("no duplicate product slug", dupSlug.length === 0, { dupGroups: dupSlug.length });
  const dupCatSlug = await prisma.productCategory.groupBy({ by: ["slug"], where, _count: { slug: true }, having: { slug: { _count: { gt: 1 } } } });
  check("no duplicate category slug", dupCatSlug.length === 0, { dupGroups: dupCatSlug.length });

  // Orphan variant / inventory (LEFT JOIN — gerçek referans kontrolü).
  const orphanVar = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "ProductVariant" v LEFT JOIN "Product" p ON v."productId" = p.id WHERE v."storeId" = ${STORE_ID} AND p.id IS NULL`;
  check("no orphan variant", orphanVar[0].n === 0, { orphanVariants: orphanVar[0].n });
  const orphanInvRow = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "InventoryItem" i LEFT JOIN "ProductVariant" v ON i."variantId" = v.id WHERE i."storeId" = ${STORE_ID} AND v.id IS NULL`;
  check("no orphan inventory item", orphanInvRow[0].n === 0, { orphanInv: orphanInvRow[0].n });

  // Assignment tutarlılığı (kategori var).
  const assignments = await prisma.productCategoryAssignment.findMany({ where, select: { categoryId: true } });
  const catIds = new Set((await prisma.productCategory.findMany({ where, select: { id: true } })).map((c) => c.id));
  const badAssign = assignments.filter((a) => !catIds.has(a.categoryId)).length;
  check("category assignments consistent", badAssign === 0, { badAssign });

  // Attribute value ↔ definition tutarlılığı.
  const defIds = new Set((await prisma.attributeDefinition.findMany({ where, select: { id: true } })).map((d) => d.id));
  const pav = await prisma.productAttributeValue.findMany({ where, select: { attributeDefinitionId: true } });
  const badPav = pav.filter((v) => !defIds.has(v.attributeDefinitionId)).length;
  check("product attribute values match definitions", badPav === 0, { badPav });

  // Required attribute coverage (variant-defining OLMAYAN required → ürün-seviyesi PAV zorunlu).
  const requiredLinks = await prisma.categoryAttribute.findMany({ where: { ...where, required: true, variantDefining: false }, select: { categoryId: true, attributeDefinitionId: true } });
  const reqByCat = new Map();
  for (const l of requiredLinks) {
    if (!reqByCat.has(l.categoryId)) reqByCat.set(l.categoryId, []);
    reqByCat.get(l.categoryId).push(l.attributeDefinitionId);
  }
  const prods = await prisma.product.findMany({ where, select: { id: true, primaryCategoryId: true } });
  const pavPairs = new Set((await prisma.productAttributeValue.findMany({ where, select: { productId: true, attributeDefinitionId: true } })).map((r) => `${r.productId}|${r.attributeDefinitionId}`));
  let missingRequired = 0;
  for (const p of prods) {
    const req = reqByCat.get(p.primaryCategoryId) ?? [];
    for (const defId of req) if (!pavPairs.has(`${p.id}|${defId}`)) missingRequired += 1;
  }
  check("required product attributes present", missingRequired === 0, { missingRequired });

  // Variant-defining kombinasyon tutarlılığı: ATTRIBUTE_COMBINATION varyantların VOV sayısı = eksen sayısı.
  const genVariants = await prisma.productVariant.findMany({ where: { ...where, generationSource: "ATTRIBUTE_COMBINATION" }, select: { id: true, combinationKey: true } });
  const vovCounts = new Map();
  for (const r of await prisma.productVariantOptionValue.groupBy({ by: ["variantId"], where, _count: { variantId: true } })) {
    vovCounts.set(r.variantId, r._count.variantId);
  }
  let comboMismatch = 0;
  for (const v of genVariants) {
    const axisCount = v.combinationKey ? v.combinationKey.split("|").length - 1 : 0;
    if ((vovCounts.get(v.id) ?? 0) !== axisCount) comboMismatch += 1;
  }
  check("variant-defining combinations consistent", comboMismatch === 0, { comboMismatch, generated: genVariants.length });

  // Negatif/ tutarsız stok yok.
  const negItem = await prisma.inventoryItem.count({ where: { OR: [{ quantityOnHand: { lt: 0 } }, { quantityReserved: { lt: 0 } }], storeId: STORE_ID } });
  const negBal = await prisma.inventoryBalance.count({ where: { OR: [{ onHand: { lt: 0 } }, { reserved: { lt: 0 } }, { safetyStock: { lt: 0 } }], storeId: STORE_ID } });
  check("no negative inventory", negItem === 0 && negBal === 0, { negItem, negBal });

  // Fiyat invariant'ları.
  const badPrice = await prisma.productVariant.count({ where: { ...where, priceMinor: { lte: 0 } } });
  const badCost = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "ProductVariant" WHERE "storeId" = ${STORE_ID} AND "costMinor" IS NOT NULL AND "costMinor" > "priceMinor"`;
  const badCompare = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "ProductVariant" WHERE "storeId" = ${STORE_ID} AND "compareAtMinor" IS NOT NULL AND "compareAtMinor" <= "priceMinor"`;
  check("price invariants valid", badPrice === 0 && badCost[0].n === 0 && badCompare[0].n === 0, { badPrice, badCost: badCost[0].n, badCompare: badCompare[0].n });

  // Kampanya projeksiyonu: aktif public rozet-tipi kampanya var.
  const badgeCampaigns = await prisma.campaign.count({ where: { ...where, status: "ACTIVE", isPublic: true, type: { in: ["COUPON_CODE", "AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"] } } });
  check("active public badge campaigns exist", badgeCampaigns >= 5, { badgeCampaigns });

  // Search read-model (backfill sonrası).
  if (!skipSearch) {
    const docs = await prisma.productSearchDocument.count({ where });
    check("search docs cover active products", docs === activeProducts, { docs, activeProducts });
    const docBrands = await prisma.productSearchDocument.findMany({ where, select: { brand: true }, distinct: ["brand"] });
    check("search docs carry brands (autocomplete brand source)", docBrands.filter((b) => b.brand).length >= 40, { brands: docBrands.length });
    const facetRows = await prisma.productFacetValue.count({ where });
    const facetDefs = await prisma.productFacetValue.findMany({ where, select: { attributeDefinitionId: true }, distinct: ["attributeDefinitionId"] });
    check("facet rows produced (facet source)", facetRows > 0 && facetDefs.length >= 5, { facetRows, facetDefs: facetDefs.length });
    const campDocs = await prisma.productSearchDocument.count({ where: { ...where, NOT: { campaign: { equals: null } } } });
    check("campaign badges projected into search docs", campDocs > 0, { campDocs });
  }

  const failed = checks.filter((c) => !c.ok);
  const report = { store: STORE_SLUG, activeProducts, variants, categories, ok: failed.length === 0, total: checks.length, failed: failed.length, checks };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

function fail() {
  console.log(JSON.stringify({ ok: false, checks }, null, 2));
  process.exitCode = 1;
  return new Error("verification aborted");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[verify-enterprise-seed] HATA:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
