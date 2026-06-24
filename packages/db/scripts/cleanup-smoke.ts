import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SMOKE_PREFIXES = ["smoke-", "rev-", "test-", "f2a-smoke-"] as const;
const SAFE_APP_ENVS = new Set(["development", "test", undefined]);

export function assertSafeCleanupEnv(appEnv = process.env.APP_ENV): void {
  if (!SAFE_APP_ENVS.has(appEnv)) {
    throw new Error(`Refusing to cleanup smoke data when APP_ENV=${appEnv}. Use development/test only.`);
  }
}

function prefixedWhere(fields: string[]) {
  return {
    OR: fields.flatMap((field) =>
      SMOKE_PREFIXES.map((prefix) => ({
        [field]: { startsWith: prefix },
      })),
    ),
  };
}

async function main() {
  assertSafeCleanupEnv();

  const storeWhere = prefixedWhere(["slug", "name"]);
  const planWhere = prefixedWhere(["code", "name"]);
  const productWhere = prefixedWhere(["slug", "title"]);
  const categoryWhere = prefixedWhere(["slug", "name"]);
  const variantWhere = prefixedWhere(["sku", "title"]);

  const [variants, products, categories, stores, plans] = await prisma.$transaction([
    prisma.productVariant.deleteMany({ where: variantWhere }),
    prisma.product.deleteMany({ where: productWhere }),
    prisma.productCategory.deleteMany({ where: categoryWhere }),
    prisma.store.deleteMany({ where: storeWhere }),
    prisma.plan.deleteMany({ where: planWhere }),
  ]);

  console.log(
    JSON.stringify({
      ok: true,
      deleted: {
        variants: variants.count,
        products: products.count,
        categories: categories.count,
        stores: stores.count,
        plans: plans.count,
      },
    }),
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
