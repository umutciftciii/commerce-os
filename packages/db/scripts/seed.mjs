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
