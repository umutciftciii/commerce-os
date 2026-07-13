// Faz 1A (ADR-067) — Ana kategori (primaryCategoryId) audit + opsiyonel güvenli
// re-backfill scripti. Migration zaten deterministik backfill yapar; bu script
// AUDIT/DOĞRULAMA amaçlıdır ve migration ile AYNI algoritmayı kullanır (farklı bir
// algoritmayla yeniden yazmaz).
//
// Algoritma (migration SQL ile BİREBİR aynı): aynı store kapsamında en eski
// assignment (createdAt ASC); eşitlikte categoryId ASC. NOT: ProductCategoryAssignment'ın
// surrogate `id` kolonu yoktur (composite PK); bir ürünün iki assignment'ı asla aynı
// categoryId'yi paylaşamaz, bu yüzden categoryId ASC tam deterministiktir.
//
// IDEMPOTENCY: `--apply` yalnız primaryCategoryId NULL olan ürünleri doldurur; mevcut
// (non-null) değerleri EZMEZ. Tekrar çalıştırıldığında sıfır değişiklik üretir (applied=0).
// dry-run (varsayılan) DB'yi hiç değiştirmez, yalnız raporlar.
//
// Kullanım:
//   node scripts/audit-primary-category.mjs                 # dry-run (varsayılan), tüm store'lar
//   node scripts/audit-primary-category.mjs --store=<id>    # tek store'a kısıtla
//   node scripts/audit-primary-category.mjs --apply         # NULL ürünleri deterministik doldur
//
// Çıktı yalnız kontrollü bilgidir (sayılar + review gereken ürün ID'leri). Müşteri
// adı, secret, kişisel veri veya ürün içeriği RAPORLANMAZ.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const storeArg = args.find((a) => a.startsWith("--store="));
const storeId = storeArg ? storeArg.split("=")[1] : undefined;

// Deterministik ana kategori seçimi (migration ile AYNI): en eski assignment
// (createdAt ASC), eşitlikte categoryId ASC.
function pickPrimary(assignments) {
  if (assignments.length === 0) return null;
  const sorted = [...assignments].sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    return t !== 0 ? t : a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0;
  });
  return sorted[0].categoryId;
}

async function main() {
  const where = storeId ? { storeId } : {};
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      storeId: true,
      primaryCategoryId: true,
      assignments: { select: { categoryId: true, createdAt: true } },
    },
  });

  let total = 0;
  let alreadySet = 0;
  let singleAuto = 0;
  let multiDeterministic = 0;
  let noCategoryNull = 0;
  let applied = 0;
  const needsReview = []; // çok kategorili + deterministik seçilmiş → ticari doğrulama gerekebilir

  for (const product of products) {
    total += 1;
    if (product.primaryCategoryId) {
      alreadySet += 1;
      continue;
    }
    const count = product.assignments.length;
    if (count === 0) {
      noCategoryNull += 1;
      continue;
    }
    const picked = pickPrimary(product.assignments);
    if (count === 1) {
      singleAuto += 1;
    } else {
      multiDeterministic += 1;
      needsReview.push(product.id);
    }
    if (apply) {
      await prisma.product.update({ where: { id: product.id }, data: { primaryCategoryId: picked } });
      applied += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        storeScope: storeId ?? "all",
        total,
        alreadySet,
        wouldBackfill: { singleAuto, multiDeterministic, noCategoryNull },
        applied,
        needsReviewProductIds: needsReview,
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
