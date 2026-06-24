import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SMOKE_PREFIXES = ["smoke-", "rev-", "test-", "f2a-smoke-", "f2d-smoke-"] as const;
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
  const orderWhere = prefixedWhere(["orderNumber", "customerEmail", "cancelReason"]);
  const customerWhere = prefixedWhere(["email", "firstName", "lastName"]);

  const result = await prisma.$transaction(async (transaction) => {
    const activeReservations = await transaction.inventoryReservation.findMany({
      where: { status: "ACTIVE", order: orderWhere },
      select: { id: true, variantId: true, quantity: true },
    });
    for (const reservation of activeReservations) {
      const inventoryItem = await transaction.inventoryItem.findUnique({
        where: { variantId: reservation.variantId },
        select: { id: true, quantityReserved: true },
      });
      if (inventoryItem) {
        await transaction.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { quantityReserved: Math.max(0, inventoryItem.quantityReserved - reservation.quantity) },
        });
      }
      await transaction.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    }

    const orders = await transaction.order.deleteMany({ where: orderWhere });
    const customers = await transaction.customer.deleteMany({ where: customerWhere });
    const variants = await transaction.productVariant.deleteMany({ where: variantWhere });
    const products = await transaction.product.deleteMany({ where: productWhere });
    const categories = await transaction.productCategory.deleteMany({ where: categoryWhere });
    const stores = await transaction.store.deleteMany({ where: storeWhere });
    const plans = await transaction.plan.deleteMany({ where: planWhere });
    return {
      releasedReservations: activeReservations.length,
      orders,
      customers,
      variants,
      products,
      categories,
      stores,
      plans,
    };
  });

  console.log(
    JSON.stringify({
      ok: true,
      deleted: {
        releasedReservations: result.releasedReservations,
        orders: result.orders.count,
        customers: result.customers.count,
        variants: result.variants.count,
        products: result.products.count,
        categories: result.categories.count,
        stores: result.stores.count,
        plans: result.plans.count,
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
