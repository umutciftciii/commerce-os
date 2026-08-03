/**
 * H-3 (ADR-188…191) — Rezervasyon lifecycle DB operasyonları (consume / release / lazy-expiry /
 * read-time add-back). server.ts (checkout + ödeme) ve worker (süpürücü) buradan çağırır → mantık
 * tek yerde, yeniden-kullanılır, review edilebilir. Tüm write'lar `InventoryItem` satırını `FOR UPDATE`
 * kilitler → consume/release/expiry serialize olur (payment-vs-expiry yarışı; oversell imkânsız).
 */
import { Prisma } from "@prisma/client";
import type { ReleaseReason } from "./reservation-lifecycle.js";

type Tx = Prisma.TransactionClient;

/** PAID/AUTHORIZED sayılan (expiry-koruyan / consume-tetikleyen) ödeme durumları. */
const PAID_FOR_COMMIT = new Set(["PAID", "AUTHORIZED", "PARTIALLY_REFUNDED"]);

/**
 * Read-time expiry add-back — verilen varyantlar için süresi dolmuş ama henüz süpürülmemiş ACTIVE
 * rezervasyonların toplam miktarı (variantId → qty). available = onHand − reserved + bu değer.
 * Doğruluk scheduler'a bağlı DEĞİL. Boş liste → boş map (sorgu atlanır).
 */
export async function expiredReservedByVariant(
  db: Pick<Tx, "inventoryReservation">,
  storeId: string,
  variantIds: string[],
  now: Date,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (variantIds.length === 0) return map;
  const rows = await db.inventoryReservation.groupBy({
    by: ["variantId"],
    where: {
      storeId,
      variantId: { in: variantIds },
      status: "ACTIVE",
      expiresAt: { not: null, lte: now },
    },
    _sum: { quantity: true },
  });
  for (const row of rows) map.set(row.variantId, row._sum.quantity ?? 0);
  return map;
}

/**
 * Lazy write-time expiry (placeOrder kilidi altında): bu varyantın süresi dolmuş ACTIVE
 * rezervasyonlarından ödeme-kesinleşmemiş olanları fiziksel bırakır (sayaç düşer, EXPIRED).
 * Böylece oversell kontrolü scheduler'dan bağımsız DOĞRU olur. Çağıran zaten InventoryItem'ı
 * FOR UPDATE kilitlemiş olmalı. Bırakılan toplam miktarı döndürür.
 */
export async function lazyExpireVariantReservations(
  tx: Tx,
  storeId: string,
  variantId: string,
  now: Date,
): Promise<number> {
  const candidates = await tx.inventoryReservation.findMany({
    where: { storeId, variantId, status: "ACTIVE", expiresAt: { not: null, lte: now } },
    select: { id: true, orderId: true, quantity: true, order: { select: { paymentStatus: true } } },
  });
  let releasedQty = 0;
  for (const c of candidates) {
    // Payment-vs-expiry: ödeme kesinleşmişse DOKUNMA (consume yolu commit edecek).
    if (PAID_FOR_COMMIT.has(c.order.paymentStatus)) continue;
    await tx.inventoryReservation.update({
      where: { id: c.id },
      data: { status: "EXPIRED", releasedAt: now, releaseReason: "RESERVATION_EXPIRED" satisfies ReleaseReason },
    });
    await tx.inventoryItem.update({
      where: { variantId },
      data: { quantityReserved: { decrement: c.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        storeId,
        variantId,
        type: "SALE_RELEASE",
        quantityDelta: -c.quantity,
        reason: "Reservation expired (lazy, checkout).",
        referenceType: "Order",
        referenceId: c.orderId,
      },
    });
    releasedQty += c.quantity;
  }
  return releasedQty;
}

export interface ConsumeResult {
  /** CONSUMED edilen rezervasyon sayısı. */
  consumed: number;
  /** Toplam commit edilen miktar. */
  committedQty: number;
  /**
   * ADR-191 fail-closed: ödeme başarısı geldi ama sipariş ACTIVE rezervasyon TAŞIMIYOR ve önceden
   * EXPIRED/RELEASED rezervasyonu VAR → stok süpürülmüş; otomatik düşüş yapılmaz (oversell riski),
   * manuel inceleme gerekir. Çağıran LATE_PAYMENT_AFTER_EXPIRY order-event'i yazar.
   */
  lateAfterExpiry: boolean;
}

/**
 * Ödeme PAID/AUTHORIZED geçişinde: siparişin ACTIVE rezervasyonlarını satışa commit eder
 * (quantityReserved VE quantityOnHand birlikte düşer, CONSUMED, SALE_COMMIT). Idempotent: yalnız
 * ACTIVE işlenir → duplicate webhook ikinci consume YAPMAZ. Aynı tx içinde çağrılmalı.
 */
export async function consumeOrderReservations(
  tx: Tx,
  storeId: string,
  orderId: string,
  now: Date,
): Promise<ConsumeResult> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { storeId, orderId },
    select: { id: true, variantId: true, quantity: true, status: true },
  });
  const active = reservations.filter((r) => r.status === "ACTIVE");

  if (active.length === 0) {
    // Hiç ACTIVE yok: geç-ödeme (expiry önce kazandı) mı? EXPIRED/RELEASED varsa fail-closed işaret.
    const lateAfterExpiry = reservations.some((r) => r.status === "EXPIRED" || r.status === "RELEASED");
    return { consumed: 0, committedQty: 0, lateAfterExpiry };
  }

  let committedQty = 0;
  for (const r of active) {
    // InventoryItem satırını kilitle → expiry job / paralel consume ile serialize.
    const rows = await tx.$queryRaw<Array<{ quantityReserved: number; quantityOnHand: number }>>`
      SELECT "quantityReserved", "quantityOnHand"
      FROM "InventoryItem"
      WHERE "storeId" = ${storeId} AND "variantId" = ${r.variantId}
      FOR UPDATE
    `;
    const item = rows[0];
    // Sayaç yetersizse (drift) negatife düşürme; yalnız rezervasyonu terminal yap.
    const canCommitCounter = item != null && item.quantityReserved >= r.quantity && item.quantityOnHand >= r.quantity;
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "CONSUMED", consumedAt: now },
    });
    if (canCommitCounter) {
      await tx.inventoryItem.update({
        where: { variantId: r.variantId },
        data: {
          quantityReserved: { decrement: r.quantity },
          quantityOnHand: { decrement: r.quantity },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          storeId,
          variantId: r.variantId,
          type: "SALE_COMMIT",
          quantityDelta: -r.quantity,
          reason: "Reservation consumed (payment settled).",
          referenceType: "Order",
          referenceId: orderId,
        },
      });
      committedQty += r.quantity;
    }
  }
  // TODO-167 (ADR-266) — Ödeme SETTLED (SALE_COMMIT) → alıcının ACTIVE cart'ı CONVERTED (+ satırlar
  // temizlenir). Bu fonksiyon YALNIZ ödeme başarısında çağrılır (checkout PLACE'de DEĞİL) → başarısız/
  // beklemede ödeme cart'ı ACTIVE bırakır (yeniden denenebilir); sonraki cart erişimi yeni boş ACTIVE
  // cart'ı LAZY oluşturur. Aynı ödeme tx'i içinde atomik (cart iff ödeme commit).
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
  if (order?.customerId) {
    const activeCart = await tx.cart.findFirst({
      where: { storeId, customerId: order.customerId, status: "ACTIVE" },
      select: { id: true },
    });
    if (activeCart) {
      await tx.cart.update({
        where: { id: activeCart.id },
        data: { status: "CONVERTED", convertedAt: now },
      });
      await tx.cartLine.deleteMany({ where: { cartId: activeCart.id } });
    }
  }
  return { consumed: active.length, committedQty, lateAfterExpiry: false };
}

/**
 * Siparişin ACTIVE rezervasyonlarını geri bırakır (ödeme iptali / abandonment). quantityReserved
 * geri eklenir, RELEASED + releaseReason. Idempotent (yalnız ACTIVE); tenant-safe (storeId scope);
 * aynı miktarı iki kez geri eklemez (terminal rezervasyona dokunmaz). Bırakılan sayısını döndürür.
 */
export async function releaseOrderReservations(
  tx: Tx,
  storeId: string,
  orderId: string,
  now: Date,
  reason: ReleaseReason,
): Promise<number> {
  const active = await tx.inventoryReservation.findMany({
    where: { storeId, orderId, status: "ACTIVE" },
    select: { id: true, variantId: true, quantity: true },
  });
  let released = 0;
  for (const r of active) {
    const rows = await tx.$queryRaw<Array<{ quantityReserved: number }>>`
      SELECT "quantityReserved"
      FROM "InventoryItem"
      WHERE "storeId" = ${storeId} AND "variantId" = ${r.variantId}
      FOR UPDATE
    `;
    const item = rows[0];
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: now, releaseReason: reason },
    });
    if (item != null && item.quantityReserved >= r.quantity) {
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
          reason: `Reservation released (${reason}).`,
          referenceType: "Order",
          referenceId: orderId,
        },
      });
    }
    released += 1;
  }
  return released;
}
