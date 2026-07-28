/**
 * H-3 (ADR-188…191) — Rezervasyon lifecycle DB operasyonları (in-memory tx double).
 * Kapsam: consume idempotency · duplicate consume no-op · geç-ödeme (lateAfterExpiry) · release
 * idempotency · terminal rezervasyona dokunmama · lazy write-time expiry (ödenmiş korunur) ·
 * sayaç-drift guard (negatife düşürmez).
 */
import { describe, expect, it } from "vitest";
import {
  consumeOrderReservations,
  releaseOrderReservations,
  lazyExpireVariantReservations,
} from "../src/reservation-operations.js";

interface FakeReservation {
  id: string;
  storeId: string;
  orderId: string;
  variantId: string;
  quantity: number;
  status: "ACTIVE" | "CONSUMED" | "RELEASED" | "EXPIRED";
  expiresAt: Date | null;
  releasedAt: Date | null;
  consumedAt: Date | null;
  releaseReason: string | null;
  order: { paymentStatus: string };
}
interface FakeItem {
  variantId: string;
  quantityReserved: number;
  quantityOnHand: number;
}

function createTx(reservations: FakeReservation[], items: FakeItem[]) {
  const movements: Array<{ type: string; variantId: string; quantityDelta: number }> = [];
  const matches = (r: FakeReservation, where: Record<string, unknown>): boolean => {
    if (where.storeId && r.storeId !== where.storeId) return false;
    if (where.orderId && r.orderId !== where.orderId) return false;
    if (where.variantId && r.variantId !== where.variantId) return false;
    if (where.status && r.status !== where.status) return false;
    if (where.expiresAt) {
      const cond = where.expiresAt as { not?: null; lte?: Date };
      if (cond.not === null && r.expiresAt === null) return false;
      if (cond.lte && (r.expiresAt === null || r.expiresAt.getTime() > cond.lte.getTime())) return false;
    }
    return true;
  };
  const tx = {
    inventoryReservation: {
      findMany: async ({ where }: any) => reservations.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      update: async ({ where, data }: any) => {
        const r = reservations.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
    inventoryItem: {
      update: async ({ where, data }: any) => {
        const it = items.find((x) => x.variantId === where.variantId)!;
        if (data.quantityReserved?.decrement) it.quantityReserved -= data.quantityReserved.decrement;
        if (data.quantityReserved?.increment) it.quantityReserved += data.quantityReserved.increment;
        if (data.quantityOnHand?.decrement) it.quantityOnHand -= data.quantityOnHand.decrement;
        return it;
      },
    },
    inventoryMovement: {
      create: async ({ data }: any) => {
        movements.push({ type: data.type, variantId: data.variantId, quantityDelta: data.quantityDelta });
        return data;
      },
    },
    // $queryRaw`SELECT ... WHERE storeId=${storeId} AND variantId=${variantId} FOR UPDATE`
    $queryRaw: async (_strings: TemplateStringsArray, ...values: any[]) => {
      const variantId = values[1];
      const it = items.find((x) => x.variantId === variantId);
      return it ? [{ quantityReserved: it.quantityReserved, quantityOnHand: it.quantityOnHand }] : [];
    },
  };
  return { tx: tx as any, movements };
}

const NOW = new Date("2026-07-29T12:00:00.000Z");

function reservation(over: Partial<FakeReservation> = {}): FakeReservation {
  return {
    id: "r1",
    storeId: "s1",
    orderId: "o1",
    variantId: "v1",
    quantity: 3,
    status: "ACTIVE",
    expiresAt: new Date("2026-07-29T11:00:00.000Z"),
    releasedAt: null,
    consumedAt: null,
    releaseReason: null,
    order: { paymentStatus: "UNPAID" },
    ...over,
  };
}

describe("consumeOrderReservations", () => {
  it("ACTIVE → CONSUMED, onHand+reserved birlikte düşer, SALE_COMMIT", async () => {
    const res = [reservation()];
    const items = [{ variantId: "v1", quantityReserved: 3, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const out = await consumeOrderReservations(tx, "s1", "o1", NOW);
    expect(out).toEqual({ consumed: 1, committedQty: 3, lateAfterExpiry: false });
    expect(res[0].status).toBe("CONSUMED");
    expect(items[0]).toEqual({ variantId: "v1", quantityReserved: 0, quantityOnHand: 7 });
    expect(movements).toEqual([{ type: "SALE_COMMIT", variantId: "v1", quantityDelta: -3 }]);
  });

  it("duplicate consume: ikinci çağrı no-op (idempotent)", async () => {
    const res = [reservation({ status: "CONSUMED" })];
    const items = [{ variantId: "v1", quantityReserved: 0, quantityOnHand: 7 }];
    const { tx, movements } = createTx(res, items);
    const out = await consumeOrderReservations(tx, "s1", "o1", NOW);
    expect(out.consumed).toBe(0);
    expect(out.lateAfterExpiry).toBe(false);
    expect(movements).toHaveLength(0);
  });

  it("geç-ödeme: ACTIVE yok ama EXPIRED var → lateAfterExpiry (fail-closed)", async () => {
    const res = [reservation({ status: "EXPIRED" })];
    const items = [{ variantId: "v1", quantityReserved: 0, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const out = await consumeOrderReservations(tx, "s1", "o1", NOW);
    expect(out).toEqual({ consumed: 0, committedQty: 0, lateAfterExpiry: true });
    expect(movements).toHaveLength(0); // otomatik düşüş YOK
  });

  it("sayaç drift: reserved < qty → rezervasyon CONSUMED ama sayaç negatife düşmez", async () => {
    const res = [reservation({ quantity: 5 })];
    const items = [{ variantId: "v1", quantityReserved: 2, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const out = await consumeOrderReservations(tx, "s1", "o1", NOW);
    expect(res[0].status).toBe("CONSUMED");
    expect(out.committedQty).toBe(0);
    expect(items[0].quantityReserved).toBe(2); // dokunulmadı
    expect(movements).toHaveLength(0);
  });
});

describe("releaseOrderReservations", () => {
  it("ACTIVE → RELEASED, reserved geri eklenir, releaseReason", async () => {
    const res = [reservation()];
    const items = [{ variantId: "v1", quantityReserved: 3, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const released = await releaseOrderReservations(tx, "s1", "o1", NOW, "PAYMENT_CANCELLED");
    expect(released).toBe(1);
    expect(res[0].status).toBe("RELEASED");
    expect(res[0].releaseReason).toBe("PAYMENT_CANCELLED");
    expect(items[0].quantityReserved).toBe(0);
    expect(movements).toEqual([{ type: "SALE_RELEASE", variantId: "v1", quantityDelta: -3 }]);
  });

  it("duplicate release: terminal rezervasyon dokunulmaz (idempotent, çift geri-ekleme yok)", async () => {
    const res = [reservation({ status: "RELEASED" })];
    const items = [{ variantId: "v1", quantityReserved: 0, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const released = await releaseOrderReservations(tx, "s1", "o1", NOW, "PAYMENT_CANCELLED");
    expect(released).toBe(0);
    expect(items[0].quantityReserved).toBe(0);
    expect(movements).toHaveLength(0);
  });
});

describe("lazyExpireVariantReservations", () => {
  it("ödenmemiş süresi dolmuş rezervasyon bırakılır (EXPIRED), stok geri", async () => {
    const res = [reservation()]; // expiresAt 11:00 < NOW 12:00, UNPAID
    const items = [{ variantId: "v1", quantityReserved: 3, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const freed = await lazyExpireVariantReservations(tx, "s1", "v1", NOW);
    expect(freed).toBe(3);
    expect(res[0].status).toBe("EXPIRED");
    expect(items[0].quantityReserved).toBe(0);
    expect(movements).toHaveLength(1);
  });

  it("ödenmiş (PAID) süresi dolmuş rezervasyon KORUNUR (consume yolu commit eder)", async () => {
    const res = [reservation({ order: { paymentStatus: "PAID" } })];
    const items = [{ variantId: "v1", quantityReserved: 3, quantityOnHand: 10 }];
    const { tx, movements } = createTx(res, items);
    const freed = await lazyExpireVariantReservations(tx, "s1", "v1", NOW);
    expect(freed).toBe(0);
    expect(res[0].status).toBe("ACTIVE");
    expect(movements).toHaveLength(0);
  });
});
