import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SMOKE_PREFIXES = ["smoke-", "rev-", "test-"] as const;
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

  const [stores, plans] = await prisma.$transaction([
    prisma.store.deleteMany({ where: storeWhere }),
    prisma.plan.deleteMany({ where: planWhere }),
  ]);

  console.log(JSON.stringify({ ok: true, deleted: { stores: stores.count, plans: plans.count } }));
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
