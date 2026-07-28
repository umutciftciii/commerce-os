/**
 * H-3 (ADR-193) — Rezervasyon reconciliation SALT-OKUNUR taraması + operasyon görünürlük sayaçları.
 * Sessiz otomatik düzeltme YOK; belirsizlikler uyarı olarak raporlanır (job yalnız kesin-orphan'ı
 * reconcile eder). Tüm sorgular store-scoped / bounded. PII loglanmaz.
 */
import type { PrismaClient } from "@prisma/client";

export interface ReservationReconciliationReport {
  storeId: string;
  scannedAt: string;
  /** PAID/AUTHORIZED sipariş + ACTIVE rezervasyon (consume kaçırılmış olabilir → reconcile adayı). */
  paidOrderActiveReservations: number;
  /** CANCELLED sipariş + ACTIVE rezervasyon (release kaçırılmış → drift). */
  cancelledOrderActiveReservations: number;
  /** ACTIVE rezervasyon + expiresAt NULL + sipariş ödenmemiş (TTL'siz kalmış). */
  activeUnpaidWithoutExpiry: number;
  /** InventoryItem.quantityReserved != SUM(ACTIVE rezervasyon qty) olan varyant sayısı. */
  reservedCounterMismatchVariants: number;
  /** quantityReserved > quantityOnHand olan varyant sayısı. */
  reservedExceedsOnHandVariants: number;
  /** LATE_PAYMENT_AFTER_EXPIRY işaretli sipariş sayısı (manuel inceleme). */
  latePaymentAfterExpiryOrders: number;
  /** Toplam uyarı (yukarıdakilerin toplamı; 0 = temiz). */
  warningCount: number;
}

export interface ReservationVisibilitySummary {
  activeReservations: number;
  expiredCandidates: number;
  orphanDraftCandidates: number;
  releasedCount: number;
  expiredCount: number;
  consumedCount: number;
  oldestActiveAt: string | null;
}

export async function scanReservationReconciliation(
  prisma: PrismaClient,
  storeId: string,
  now: Date,
): Promise<ReservationReconciliationReport> {
  const [
    paidActive,
    cancelledActive,
    unpaidNoExpiry,
    latePayment,
    counterMismatch,
    exceedsOnHand,
  ] = await Promise.all([
    prisma.inventoryReservation.count({
      where: { storeId, status: "ACTIVE", order: { paymentStatus: { in: ["PAID", "AUTHORIZED", "PARTIALLY_REFUNDED"] } } },
    }),
    prisma.inventoryReservation.count({
      where: { storeId, status: "ACTIVE", order: { status: "CANCELLED" } },
    }),
    prisma.inventoryReservation.count({
      where: {
        storeId,
        status: "ACTIVE",
        expiresAt: null,
        order: { paymentStatus: { in: ["UNPAID", "PAYMENT_PENDING", "PAYMENT_FAILED"] } },
      },
    }),
    prisma.orderEvent.count({ where: { storeId, type: "LATE_PAYMENT_AFTER_EXPIRY" } }),
    // Sayaç ≠ SUM(active qty): varyant bazlı karşılaştırma (bounded, store-scoped).
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT i."variantId",
               i."quantityReserved" AS reserved,
               COALESCE(r.sum_qty, 0) AS active_sum
        FROM "InventoryItem" i
        LEFT JOIN (
          SELECT "variantId", SUM("quantity") AS sum_qty
          FROM "InventoryReservation"
          WHERE "storeId" = ${storeId} AND "status" = 'ACTIVE'
          GROUP BY "variantId"
        ) r ON r."variantId" = i."variantId"
        WHERE i."storeId" = ${storeId} AND i."quantityReserved" <> COALESCE(r.sum_qty, 0)
      ) mism
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "InventoryItem"
      WHERE "storeId" = ${storeId} AND "quantityReserved" > "quantityOnHand"
    `,
  ]);

  const counterMismatchVariants = Number(counterMismatch[0]?.count ?? 0);
  const exceedsOnHandVariants = Number(exceedsOnHand[0]?.count ?? 0);
  const warningCount =
    paidActive + cancelledActive + unpaidNoExpiry + latePayment + counterMismatchVariants + exceedsOnHandVariants;

  return {
    storeId,
    scannedAt: now.toISOString(),
    paidOrderActiveReservations: paidActive,
    cancelledOrderActiveReservations: cancelledActive,
    activeUnpaidWithoutExpiry: unpaidNoExpiry,
    reservedCounterMismatchVariants: counterMismatchVariants,
    reservedExceedsOnHandVariants: exceedsOnHandVariants,
    latePaymentAfterExpiryOrders: latePayment,
    warningCount,
  };
}

export async function reservationVisibilitySummary(
  prisma: PrismaClient,
  storeId: string,
  now: Date,
  draftCutoff: Date,
): Promise<ReservationVisibilitySummary> {
  const [active, expiredCandidates, orphanDrafts, released, expired, consumed, oldest] = await Promise.all([
    prisma.inventoryReservation.count({ where: { storeId, status: "ACTIVE" } }),
    prisma.inventoryReservation.count({
      where: { storeId, status: "ACTIVE", expiresAt: { not: null, lte: now } },
    }),
    prisma.order.count({
      where: { storeId, status: "DRAFT", createdAt: { lt: draftCutoff }, paymentAttempts: { none: {} } },
    }),
    prisma.inventoryReservation.count({ where: { storeId, status: "RELEASED" } }),
    prisma.inventoryReservation.count({ where: { storeId, status: "EXPIRED" } }),
    prisma.inventoryReservation.count({ where: { storeId, status: "CONSUMED" } }),
    prisma.inventoryReservation.findFirst({
      where: { storeId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    activeReservations: active,
    expiredCandidates,
    orphanDraftCandidates: orphanDrafts,
    releasedCount: released,
    expiredCount: expired,
    consumedCount: consumed,
    oldestActiveAt: oldest?.createdAt.toISOString() ?? null,
  };
}
