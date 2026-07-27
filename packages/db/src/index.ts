import { Prisma, PrismaClient } from "@prisma/client";

// PB-2/PB-3 — Dağıtık advisory lock (worker + api-gateway paylaşır; bkz. advisory-lock.ts).
export {
  createPgAdvisoryLockManager,
  getDefaultAdvisoryLockManager,
  disconnectDefaultAdvisoryLockManager,
  type StoreJobLocker,
  type LockOutcome,
  type AdvisoryLockManager,
} from "./advisory-lock.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.APP_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type TransactionClient = Prisma.TransactionClient;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export async function withTransaction<T>(
  callback: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(callback);
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
