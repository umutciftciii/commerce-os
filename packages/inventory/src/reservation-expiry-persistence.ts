/**
 * H-3 (ADR-191/192) — inventory-reservation-expiry Prisma persistence. FOR UPDATE SKIP LOCKED ile
 * concurrency-safe aday claim; her aday `InventoryItem` satırını FOR UPDATE kilitler → consume/lazy
 * ile serialize (payment-vs-expiry; oversell imkânsız). Tüm sorgular store-scoped / bounded / UTC.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ExpiredBatchResult, ReservationExpiryPersistence } from "./reservation-expiry-service.js";

const PAID_FOR_COMMIT = ["PAID", "AUTHORIZED", "PARTIALLY_REFUNDED"];

export function createPrismaReservationExpiryPersistence(prisma: PrismaClient): ReservationExpiryPersistence {
  return {
    async listStores(storeId) {
      const rows = await prisma.store.findMany({
        where: { status: "ACTIVE", ...(storeId ? { id: storeId } : {}) },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    async countExpiredReservations(storeId, cutoff) {
      return prisma.inventoryReservation.count({
        where: { storeId, status: "ACTIVE", expiresAt: { not: null, lte: cutoff } },
      });
    },

    async processExpiredBatch(storeId, cutoff, now, batchSize): Promise<ExpiredBatchResult> {
      return prisma.$transaction(async (tx) => {
        // 1) Aday rezervasyonları concurrency-safe claim et (kilitli satırları atla).
        const claimed = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "InventoryReservation"
          WHERE "storeId" = ${storeId}
            AND "status" = 'ACTIVE'
            AND "expiresAt" IS NOT NULL
            AND "expiresAt" <= ${cutoff}
          ORDER BY "expiresAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        `;
        const result: ExpiredBatchResult = { processed: claimed.length, expired: 0, reconciledConsumed: 0, skipped: 0 };
        if (claimed.length === 0) return result;

        const ids = claimed.map((c) => c.id);
        const reservations = await tx.inventoryReservation.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            variantId: true,
            quantity: true,
            status: true,
            orderId: true,
            order: { select: { paymentStatus: true } },
          },
        });

        for (const r of reservations) {
          if (r.status !== "ACTIVE") {
            result.skipped += 1;
            continue;
          }
          // Payment-vs-expiry: siparişin paymentStatus'u kilit-anında yeniden okundu (yukarıdaki join).
          const paid = PAID_FOR_COMMIT.includes(r.order.paymentStatus);
          // InventoryItem satırını kilitle → consume/lazy ile serialize.
          const itemRows = await tx.$queryRaw<Array<{ quantityReserved: number; quantityOnHand: number }>>`
            SELECT "quantityReserved", "quantityOnHand"
            FROM "InventoryItem"
            WHERE "storeId" = ${storeId} AND "variantId" = ${r.variantId}
            FOR UPDATE
          `;
          const item = itemRows[0];

          if (paid) {
            // Reconcile: PAID/AUTHORIZED + hâlâ ACTIVE → satışa commit (bırakma).
            await tx.inventoryReservation.update({
              where: { id: r.id },
              data: { status: "CONSUMED", consumedAt: now },
            });
            if (item && item.quantityReserved >= r.quantity && item.quantityOnHand >= r.quantity) {
              await tx.inventoryItem.update({
                where: { variantId: r.variantId },
                data: { quantityReserved: { decrement: r.quantity }, quantityOnHand: { decrement: r.quantity } },
              });
              await tx.inventoryMovement.create({
                data: {
                  storeId,
                  variantId: r.variantId,
                  type: "SALE_COMMIT",
                  quantityDelta: -r.quantity,
                  reason: "Reservation reconciled to sale (paid, expiry job).",
                  referenceType: "Order",
                  referenceId: r.orderId,
                },
              });
            }
            result.reconciledConsumed += 1;
          } else {
            // Expire: stok geri ver.
            await tx.inventoryReservation.update({
              where: { id: r.id },
              data: { status: "EXPIRED", releasedAt: now, releaseReason: "RESERVATION_EXPIRED" },
            });
            if (item && item.quantityReserved >= r.quantity) {
              await tx.inventoryItem.update({
                where: { variantId: r.variantId },
                data: { quantityReserved: { decrement: r.quantity } },
              });
              await tx.inventoryMovement.create({
                data: {
                  storeId,
                  variantId: r.variantId,
                  type: "SALE_RELEASE",
                  quantityDelta: -r.quantity,
                  reason: "Reservation expired (sweeper).",
                  referenceType: "Order",
                  referenceId: r.orderId,
                },
              });
            }
            result.expired += 1;
          }
        }
        return result;
      });
    },

    async cancelExpiredOrdersBatch(storeId, now, batchSize) {
      return prisma.$transaction(async (tx) => {
        // PLACED + ödenmemiş + rezervasyonları expired (ACTIVE kalmamış) → kontrollü CANCELLED.
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT o."id" FROM "Order" o
          WHERE o."storeId" = ${storeId}
            AND o."status" = 'PLACED'
            AND o."paymentStatus" IN ('UNPAID', 'PAYMENT_PENDING', 'PAYMENT_FAILED')
            AND EXISTS (
              SELECT 1 FROM "InventoryReservation" r
              WHERE r."orderId" = o."id" AND r."status" = 'EXPIRED'
            )
            AND NOT EXISTS (
              SELECT 1 FROM "InventoryReservation" r
              WHERE r."orderId" = o."id" AND r."status" = 'ACTIVE'
            )
          ORDER BY o."placedAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        `;
        if (rows.length === 0) return 0;
        for (const row of rows) {
          await tx.order.update({
            where: { id: row.id },
            data: {
              status: "CANCELLED",
              fulfillmentStatus: "CANCELLED",
              cancelledAt: now,
              cancelReason: "RESERVATION_EXPIRED",
              events: {
                create: [
                  {
                    storeId,
                    type: "ORDER_EXPIRED",
                    message: "Order cancelled by reservation expiry sweeper (unpaid, reservations expired).",
                    metadata: { reason: "RESERVATION_EXPIRED" } as Prisma.InputJsonValue,
                  },
                ],
              },
            },
          });
        }
        return rows.length;
      });
    },

    async countOrphanDrafts(storeId, draftCutoff) {
      return prisma.order.count({
        where: {
          storeId,
          status: "DRAFT",
          createdAt: { lt: draftCutoff },
          paymentAttempts: { none: {} },
        },
      });
    },

    async cancelOrphanDraftsBatch(storeId, draftCutoff, now, batchSize) {
      return prisma.$transaction(async (tx) => {
        const orphans = await tx.order.findMany({
          where: {
            storeId,
            status: "DRAFT",
            createdAt: { lt: draftCutoff },
            paymentAttempts: { none: {} },
          },
          select: { id: true },
          take: batchSize,
        });
        if (orphans.length === 0) return 0;
        for (const o of orphans) {
          await tx.order.update({
            where: { id: o.id },
            data: {
              status: "CANCELLED",
              fulfillmentStatus: "CANCELLED",
              cancelledAt: now,
              cancelReason: "ORPHAN_DRAFT",
              events: {
                create: [
                  {
                    storeId,
                    type: "ORDER_EXPIRED",
                    message: "Abandoned draft order cancelled by cleanup sweeper (no payment, aged out).",
                    metadata: { reason: "ORPHAN_DRAFT" } as Prisma.InputJsonValue,
                  },
                ],
              },
            },
          });
        }
        return orphans.length;
      });
    },
  };
}
