import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@commerce-os/auth";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword(
    "local-admin-password",
    process.env.PASSWORD_HASH_PEPPER ?? "",
  );

  const platformAdmin = await prisma.platformUser.upsert({
    where: { email: "platform-admin@example.local" },
    update: {
      name: "Demo Platform Admin",
      passwordHash,
      role: "SUPER_ADMIN",
    },
    create: {
      email: "platform-admin@example.local",
      name: "Demo Platform Admin",
      passwordHash,
      role: "SUPER_ADMIN",
    },
  });

  const plan = await prisma.plan.upsert({
    where: { code: "demo" },
    update: {
      name: "Demo Plan",
      description: "Seeded demo plan for local development.",
    },
    create: {
      code: "demo",
      name: "Demo Plan",
      description: "Seeded demo plan for local development.",
      metadata: { seeded: true },
    },
  });

  const store = await prisma.store.upsert({
    where: { slug: "demo-store" },
    update: {
      name: "Demo Store",
      status: "ACTIVE",
    },
    create: {
      name: "Demo Store",
      slug: "demo-store",
      status: "ACTIVE",
      metadata: { seeded: true },
    },
  });

  await prisma.storeDomain.upsert({
    where: { domain: "demo.localhost" },
    update: {
      storeId: store.id,
      type: "SYSTEM_SUBDOMAIN",
      status: "ACTIVE",
    },
    create: {
      storeId: store.id,
      domain: "demo.localhost",
      type: "SYSTEM_SUBDOMAIN",
      status: "ACTIVE",
    },
  });

  await prisma.storeUser.upsert({
    where: {
      userId_storeId: {
        userId: platformAdmin.id,
        storeId: store.id,
      },
    },
    update: {
      role: "OWNER",
      acceptedAt: new Date(),
    },
    create: {
      userId: platformAdmin.id,
      storeId: store.id,
      role: "OWNER",
      acceptedAt: new Date(),
    },
  });

  await prisma.subscription.upsert({
    where: { id: `${store.id}-${plan.id}` },
    update: {
      status: "TRIALING",
      planId: plan.id,
      storeId: store.id,
    },
    create: {
      id: `${store.id}-${plan.id}`,
      storeId: store.id,
      planId: plan.id,
      status: "TRIALING",
      metadata: { seeded: true },
    },
  });

  await prisma.eventLog.upsert({
    where: { id: "seed-demo-store-event" },
    update: {
      storeId: store.id,
      type: "SYSTEM_EVENT",
      payload: { message: "Seed completed." },
    },
    create: {
      id: "seed-demo-store-event",
      storeId: store.id,
      type: "SYSTEM_EVENT",
      payload: { message: "Seed completed." },
    },
  });

  const apparelCategory = await prisma.productCategory.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "apparel" } },
    update: { name: "Apparel", sortOrder: 10, status: "ACTIVE" },
    create: {
      storeId: store.id,
      name: "Apparel",
      slug: "apparel",
      sortOrder: 10,
      status: "ACTIVE",
    },
  });

  const accessoriesCategory = await prisma.productCategory.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "accessories" } },
    update: { name: "Accessories", sortOrder: 20, status: "ACTIVE" },
    create: {
      storeId: store.id,
      name: "Accessories",
      slug: "accessories",
      sortOrder: 20,
      status: "ACTIVE",
    },
  });

  const hoodie = await prisma.product.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "demo-hoodie" } },
    update: {
      title: "Demo Hoodie",
      status: "ACTIVE",
      type: "PHYSICAL",
      brand: "Commerce OS",
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      maxOrderQuantity: null,
      callToActionLabel: null,
      whatsappMessageTemplate: null,
      inquiryFormTitle: null,
      appointmentNote: null,
      // F3C.2 — Ürün-seviyesi kargo ölçüsü; varyantlar boş bırakıp buradan fallback alır.
      shippingWeightKg: 0.6,
      shippingDesi: 5,
      // Faz 1A (ADR-067) — tek kategorili ürün: ana kategori = o kategori.
      primaryCategoryId: apparelCategory.id,
    },
    create: {
      storeId: store.id,
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      description: "Seeded hoodie product for local catalog smoke tests.",
      status: "ACTIVE",
      type: "PHYSICAL",
      brand: "Commerce OS",
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      shippingWeightKg: 0.6,
      shippingDesi: 5,
      primaryCategoryId: apparelCategory.id,
    },
  });

  const tote = await prisma.product.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "demo-tote" } },
    update: {
      title: "Demo Tote Bag",
      status: "ACTIVE",
      type: "PHYSICAL",
      brand: "Commerce OS",
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      maxOrderQuantity: null,
      callToActionLabel: null,
      whatsappMessageTemplate: null,
      inquiryFormTitle: null,
      appointmentNote: null,
      // F3C.2 — Kargo ölçüleri (desi tarifesi runtime smoke için).
      shippingWeightKg: 0.4,
      shippingDesi: 3,
      // Faz 1A (ADR-067) — tek kategorili ürün: ana kategori = o kategori.
      primaryCategoryId: accessoriesCategory.id,
    },
    create: {
      storeId: store.id,
      title: "Demo Tote Bag",
      slug: "demo-tote",
      description: "Seeded tote product for local catalog smoke tests.",
      status: "ACTIVE",
      type: "PHYSICAL",
      brand: "Commerce OS",
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      shippingWeightKg: 0.4,
      shippingDesi: 3,
      primaryCategoryId: accessoriesCategory.id,
    },
  });

  await prisma.productCategoryAssignment.createMany({
    data: [
      { storeId: store.id, productId: hoodie.id, categoryId: apparelCategory.id },
      { storeId: store.id, productId: tote.id, categoryId: accessoriesCategory.id },
    ],
    skipDuplicates: true,
  });

  const variants = await Promise.all([
    prisma.productVariant.upsert({
      where: { storeId_sku: { storeId: store.id, sku: "DEMO-HOODIE-BLK-M" } },
      update: {
        productId: hoodie.id,
        title: "Black / M",
        priceMinor: 129900,
        compareAtMinor: 149900,
        currency: "TRY",
        status: "ACTIVE",
        optionValues: { color: "Black", size: "M" },
      },
      create: {
        storeId: store.id,
        productId: hoodie.id,
        title: "Black / M",
        sku: "DEMO-HOODIE-BLK-M",
        priceMinor: 129900,
        compareAtMinor: 149900,
        currency: "TRY",
        status: "ACTIVE",
        optionValues: { color: "Black", size: "M" },
      },
    }),
    prisma.productVariant.upsert({
      where: { storeId_sku: { storeId: store.id, sku: "DEMO-HOODIE-BLK-L" } },
      update: {
        productId: hoodie.id,
        title: "Black / L",
        priceMinor: 129900,
        compareAtMinor: 149900,
        currency: "TRY",
        status: "ACTIVE",
        optionValues: { color: "Black", size: "L" },
      },
      create: {
        storeId: store.id,
        productId: hoodie.id,
        title: "Black / L",
        sku: "DEMO-HOODIE-BLK-L",
        priceMinor: 129900,
        compareAtMinor: 149900,
        currency: "TRY",
        status: "ACTIVE",
        optionValues: { color: "Black", size: "L" },
      },
    }),
    prisma.productVariant.upsert({
      where: { storeId_sku: { storeId: store.id, sku: "DEMO-TOTE-NAT" } },
      update: {
        productId: tote.id,
        title: "Natural",
        priceMinor: 39900,
        compareAtMinor: null,
        currency: "TRY",
        status: "ACTIVE",
        optionValues: { color: "Natural" },
      },
      create: {
        storeId: store.id,
        productId: tote.id,
        title: "Natural",
        sku: "DEMO-TOTE-NAT",
        priceMinor: 39900,
        currency: "TRY",
        status: "ACTIVE",
        optionValues: { color: "Natural" },
      },
    }),
  ]);

  await Promise.all(
    variants.map((variant, index) =>
      prisma.inventoryItem.upsert({
        where: { variantId: variant.id },
        update: {
          storeId: store.id,
          quantityReserved: 0,
          lowStockThreshold: index === 2 ? 5 : 10,
        },
        create: {
          storeId: store.id,
          variantId: variant.id,
          quantityOnHand: index === 2 ? 25 : 15,
          quantityReserved: 0,
          lowStockThreshold: index === 2 ? 5 : 10,
        },
      }),
    ),
  );

  // TODO-152 (ADR-076) — Inventory Engine: store icin VARSAYILAN depo (migration backfill ile
  // ayni deterministik id/kod) + her varyant icin default-depo InventoryBalance. onHand/reserved
  // InventoryItem ile birebir (InventoryItem otorite); safety/incoming/reorder demo degerleri.
  const defaultWarehouse = await prisma.warehouse.upsert({
    where: { id: `wh_default_${store.id}` },
    update: { code: "DEFAULT", name: "Ana Depo", status: "ACTIVE", isDefault: true, priority: 0 },
    create: {
      id: `wh_default_${store.id}`,
      storeId: store.id,
      code: "DEFAULT",
      name: "Ana Depo",
      status: "ACTIVE",
      isDefault: true,
      priority: 0,
    },
  });

  await Promise.all(
    variants.map((variant, index) =>
      prisma.inventoryBalance.upsert({
        where: { warehouseId_variantId: { warehouseId: defaultWarehouse.id, variantId: variant.id } },
        update: {
          onHand: index === 2 ? 25 : 15,
          reserved: 0,
          safetyStock: index === 2 ? 2 : 3,
          incoming: index === 0 ? 20 : 0,
          reorderPoint: index === 2 ? 5 : 8,
        },
        create: {
          storeId: store.id,
          warehouseId: defaultWarehouse.id,
          variantId: variant.id,
          onHand: index === 2 ? 25 : 15,
          reserved: 0,
          safetyStock: index === 2 ? 2 : 3,
          incoming: index === 0 ? 20 : 0,
          reorderPoint: index === 2 ? 5 : 8,
        },
      }),
    ),
  );

  // F3C.2 — Demo magaza icin VARSAYILAN kargo TARIFE plani. Eski hardcoded ₺49,90 /
  // ₺750 ucretsiz kargo esigi artik "magic" degil; store tarifesi olarak tutulur
  // (FREE_THRESHOLD: esik altinda 4990, esik ustunde 0). Provider canli quote DEGIL.
  await prisma.shippingRatePlan.upsert({
    where: { id: `${store.id}-default-shipping` },
    update: {
      name: "Standart Kargo",
      status: "ACTIVE",
      isDefault: true,
      pricingMode: "FREE_THRESHOLD",
      currency: "TRY",
      fixedAmountMinor: 4990,
      freeShippingThresholdMinor: 75000,
    },
    create: {
      id: `${store.id}-default-shipping`,
      storeId: store.id,
      name: "Standart Kargo",
      status: "ACTIVE",
      isDefault: true,
      pricingMode: "FREE_THRESHOLD",
      currency: "TRY",
      fixedAmountMinor: 4990,
      freeShippingThresholdMinor: 75000,
    },
  });
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
