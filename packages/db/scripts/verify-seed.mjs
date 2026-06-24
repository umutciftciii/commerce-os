import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [platformAdmin, plan, store, domain, storeUser] = await Promise.all([
    prisma.platformUser.findUnique({ where: { email: "platform-admin@example.local" } }),
    prisma.plan.findUnique({ where: { code: "demo" } }),
    prisma.store.findUnique({ where: { slug: "demo-store" } }),
    prisma.storeDomain.findUnique({ where: { domain: "demo.localhost" } }),
    prisma.storeUser.findFirst({
      where: {
        user: { email: "platform-admin@example.local" },
        store: { slug: "demo-store" },
      },
    }),
  ]);

  const missing = [
    ["platformAdmin", platformAdmin],
    ["plan", plan],
    ["store", store],
    ["domain", domain],
    ["storeUser", storeUser],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Seed verification failed. Missing: ${missing.join(", ")}`);
  }

  const duplicateCounts = {
    platformAdmins: await prisma.platformUser.count({
      where: { email: "platform-admin@example.local" },
    }),
    plans: await prisma.plan.count({ where: { code: "demo" } }),
    stores: await prisma.store.count({ where: { slug: "demo-store" } }),
    domains: await prisma.storeDomain.count({ where: { domain: "demo.localhost" } }),
    storeUsers: await prisma.storeUser.count({
      where: {
        userId: platformAdmin?.id,
        storeId: store?.id,
      },
    }),
  };

  const catalogCounts = store
    ? {
        categories: await prisma.productCategory.count({ where: { storeId: store.id } }),
        products: await prisma.product.count({ where: { storeId: store.id } }),
        variants: await prisma.productVariant.count({ where: { storeId: store.id } }),
        inventoryItems: await prisma.inventoryItem.count({ where: { storeId: store.id } }),
        hoodieSlugs: await prisma.product.count({
          where: { storeId: store.id, slug: "demo-hoodie" },
        }),
        hoodieSku: await prisma.productVariant.count({
          where: { storeId: store.id, sku: "DEMO-HOODIE-BLK-M" },
        }),
        onlineProducts: await prisma.product.count({
          where: {
            storeId: store.id,
            slug: { in: ["demo-hoodie", "demo-tote"] },
            salesMode: "ONLINE",
            priceVisibility: "VISIBLE",
            primaryAction: "ADD_TO_CART",
            purchasable: true,
            minOrderQuantity: 1,
          },
        }),
      }
    : {
        categories: 0,
        products: 0,
        variants: 0,
        inventoryItems: 0,
        hoodieSlugs: 0,
        hoodieSku: 0,
        onlineProducts: 0,
      };

  const duplicates = Object.entries(duplicateCounts)
    .filter(([, count]) => count !== 1)
    .map(([name, count]) => `${name}=${count}`);

  if (duplicates.length > 0) {
    throw new Error(`Seed verification found unexpected counts: ${duplicates.join(", ")}`);
  }

  if (
    catalogCounts.categories < 2 ||
    catalogCounts.products < 2 ||
    catalogCounts.variants < 3 ||
    catalogCounts.inventoryItems < 3 ||
    catalogCounts.hoodieSlugs !== 1 ||
    catalogCounts.hoodieSku !== 1 ||
    catalogCounts.onlineProducts !== 2
  ) {
    throw new Error(`Seed verification found incomplete catalog: ${JSON.stringify(catalogCounts)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      platformAdmin: platformAdmin?.email,
      plan: plan?.code,
      store: store?.slug,
      domain: domain?.domain,
      storeUserRole: storeUser?.role,
      catalog: catalogCounts,
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
