/**
 * H-3 pre-ship (ADR-194) — PAID/AUTHORIZED + ACTIVE reconcile Prisma persistence.
 * FOR UPDATE SKIP LOCKED ile aday claim; her aday InventoryItem satırını FOR UPDATE kilitler (consume/
 * expiry/lazy ile serialize; lock sırası: InventoryReservation(claim) → InventoryItem). Güvenli commit;
 * belirsiz kayıt MUTATE EDİLMEZ → MANUAL_REVIEW. Idempotent (yalnız ACTIVE→CONSUMED geçişinde SALE_COMMIT).
 */
import { type PrismaClient, type PaymentStatus } from "@prisma/client";
import type { ReconcileBatchResult, ReservationReconcilePersistence } from "./reservation-reconcile-service.js";

const PAID: PaymentStatus[] = ["PAID", "AUTHORIZED"];

export function createPrismaReservationReconcilePersistence(prisma: PrismaClient): ReservationReconcilePersistence {
  return {
    async listStores(storeId) {
      const rows = await prisma.store.findMany({
        where: { status: "ACTIVE", ...(storeId ? { id: storeId } : {}) },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    async countReconcileCandidates(storeId) {
      return prisma.inventoryReservation.count({
        where: { storeId, status: "ACTIVE", order: { paymentStatus: { in: PAID } } },
      });
    },

    async processReconcileBatch(storeId, now, batchSize): Promise<ReconcileBatchResult> {
      return prisma.$transaction(async (tx) => {
        // PAID/AUTHORIZED siparişe bağlı ACTIVE rezervasyonları concurrency-safe claim et.
        const claimed = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT r."id" FROM "InventoryReservation" r
          JOIN "Order" o ON o."id" = r."orderId"
          WHERE r."storeId" = ${storeId}
            AND r."status" = 'ACTIVE'
            AND o."paymentStatus" IN ('PAID', 'AUTHORIZED')
          ORDER BY r."createdAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF r SKIP LOCKED
        `;
        const result: ReconcileBatchResult = { processed: claimed.length, reconciled: 0, manualReview: 0, skipped: 0 };
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
            orderLine: { select: { quantity: true } },
          },
        });

        for (const r of reservations) {
          if (r.status !== "ACTIVE" || !PAID.includes(r.order.paymentStatus)) {
            result.skipped += 1;
            continue;
          }
          // Belirsizlik guard'ları: qty eşleşmeli, order line var olmalı.
          if (!r.orderLine || r.orderLine.quantity !== r.quantity) {
            result.manualReview += 1;
            continue;
          }
          const itemRows = await tx.$queryRaw<Array<{ quantityReserved: number; quantityOnHand: number }>>`
            SELECT "quantityReserved", "quantityOnHand"
            FROM "InventoryItem"
            WHERE "storeId" = ${storeId} AND "variantId" = ${r.variantId}
            FOR UPDATE
          `;
          const item = itemRows[0];
          if (!item || item.quantityReserved < r.quantity || item.quantityOnHand < r.quantity) {
            // Eksik inventory item veya sayaç yetersiz → belirsiz, MUTATE ETME.
            result.manualReview += 1;
            continue;
          }
          // Güvenli commit: ACTIVE → CONSUMED + sayaç düşür + SALE_COMMIT (yalnız bu geçişte → duplicate yok).
          await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: "CONSUMED", consumedAt: now } });
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
              reason: "Reservation reconciled to sale (PAID+ACTIVE backfill).",
              referenceType: "Order",
              referenceId: r.orderId,
            },
          });
          result.reconciled += 1;
        }
        return result;
      });
    },
  };
}
