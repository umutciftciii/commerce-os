// TODO-165B — Fashion demo kategori assignment backfill (idempotent, güvenli).
//
// SORUN: Fashion demo seed (fashion-demo-seed) fash-cat-* kategorilerini + size chart'ları
// oluşturdu ama enterprise-seed ürünleri eski edm-cat-* taksonomisine bağladı. Sonuç: fashion
// kategori sayfaları (moda-ayakkabi/moda-kadin-giyim/moda-erkek-giyim) BOŞ görünüyor.
//
// ÇÖZÜM: Eski kategori → fashion kategori deterministik eşleme. Eski kategoriye bağlı ürünler
// hedef fashion kategorisine DE bağlanır (ProductCategoryAssignment eklenir). Eski bağlantılar
// KORUNUR — ürün her iki kategoride de görünür (TODO-165B çok-kategori PLP kararı).
//
// IDEMPOTENCY: assignment composite PK (productId, categoryId) → skipDuplicates. Tekrar
// çalıştırıldığında sıfır yeni satır (added=0). dry-run (varsayılan) DB'yi değiştirmez.
//
// TENANT ISOLATION: tüm sorgular storeId scoped. Yalnız --store ile verilen mağaza.
//
// Kullanım:
//   node scripts/backfill-fashion-category-assignments.mjs --store=edm-store            # dry-run
//   node scripts/backfill-fashion-category-assignments.mjs --store=edm-store --apply     # uygula
//
// UYARI: --apply sonrası arama read-model'i güncellenmeli:
//   pnpm --filter @commerce-os/search-service search:backfill --store=edm-store
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const storeArg = args.find((a) => a.startsWith("--store="));
const storeId = storeArg ? storeArg.split("=")[1] : "edm-store";

// Deterministik eşleme: kaynak eski kategori slug → hedef fashion kategori slug.
// Yalnız anlamı NET olan üç fashion kategorisi (ayakkabı + kadın/erkek giyim).
const CATEGORY_MAP = [
  { sourceSlug: "ayakkabi", targetSlug: "moda-ayakkabi" },
  { sourceSlug: "kadin-giyim", targetSlug: "moda-kadin-giyim" },
  { sourceSlug: "erkek-giyim", targetSlug: "moda-erkek-giyim" },
];

async function resolveCategoryId(slug) {
  const cat = await prisma.productCategory.findFirst({
    where: { storeId, slug },
    select: { id: true },
  });
  return cat?.id ?? null;
}

async function main() {
  console.log(`[backfill-fashion-categories] store=${storeId} mode=${apply ? "APPLY" : "dry-run"}`);
  let totalAdded = 0;
  let totalExisting = 0;

  for (const { sourceSlug, targetSlug } of CATEGORY_MAP) {
    const sourceId = await resolveCategoryId(sourceSlug);
    const targetId = await resolveCategoryId(targetSlug);
    if (!sourceId || !targetId) {
      console.log(`  SKIP ${sourceSlug} -> ${targetSlug}: kategori bulunamadı (source=${sourceId}, target=${targetId})`);
      continue;
    }

    // Kaynak kategoriye bağlı ürünler.
    const sourceAssignments = await prisma.productCategoryAssignment.findMany({
      where: { storeId, categoryId: sourceId },
      select: { productId: true },
    });
    const sourceProductIds = sourceAssignments.map((a) => a.productId);

    // Hedefte zaten bağlı olanlar (idempotency raporu için).
    const alreadyTarget = new Set(
      (
        await prisma.productCategoryAssignment.findMany({
          where: { storeId, categoryId: targetId, productId: { in: sourceProductIds } },
          select: { productId: true },
        })
      ).map((a) => a.productId),
    );
    const toAdd = sourceProductIds.filter((pid) => !alreadyTarget.has(pid));
    totalExisting += alreadyTarget.size;

    console.log(
      `  ${sourceSlug} -> ${targetSlug}: kaynak=${sourceProductIds.length}, zaten=${alreadyTarget.size}, eklenecek=${toAdd.length}`,
    );

    if (apply && toAdd.length > 0) {
      const result = await prisma.productCategoryAssignment.createMany({
        data: toAdd.map((productId) => ({ storeId, productId, categoryId: targetId })),
        skipDuplicates: true,
      });
      totalAdded += result.count;
    } else {
      totalAdded += toAdd.length;
    }
  }

  console.log(
    `[backfill-fashion-categories] ${apply ? "eklendi" : "eklenecek"}=${totalAdded}, zaten-bağlı=${totalExisting}`,
  );
  if (!apply) console.log("  (dry-run: DB değişmedi; uygulamak için --apply)");
  else console.log("  UYARI: search read-model'i güncelleyin → search:backfill --store=" + storeId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
