/**
 * TODO-175 — Return create refund destination persistence + server-authoritative eligibility.
 * DATABASE_URL yoksa SKIP.
 */
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { hasTestDb, seedDeliveredOrder, type SeededOrder } from "./helpers/returns-db.js";
import { createReturnRequest } from "../src/returns/service.js";

const cleanups: Array<() => Promise<void>> = [];
async function order(withPaidPayment = true): Promise<SeededOrder> {
  const s = await seedDeliveredOrder({ withPaidPayment, unitPriceMinor: 50000, lineQuantity: 1 });
  cleanups.push(s.cleanup);
  return s;
}

describe.skipIf(!hasTestDb)("TODO-175 return create refund destination (integration)", () => {
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c().catch(() => {});
  });

  it("persists immutable customer destination (REFUND + SHOPPING_BALANCE)", async () => {
    const o = await order(true);
    const res = await createReturnRequest(
      {
        storeId: o.storeId, customerId: o.customerId, orderNumber: o.orderNumber,
        resolutionType: "REFUND", refundDestination: "SHOPPING_BALANCE",
        items: [{ orderLineId: o.orderLineId, quantity: 1, reason: "NO_LONGER_NEEDED", customerComment: "x" }],
      },
      new Date(),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const rr = await prisma.returnRequest.findUniqueOrThrow({ where: { id: res.returnRequestId }, select: { resolutionType: true, refundDestination: true, refundDestinationSelectedBy: true, refundDestinationSelectedAt: true } });
      expect(rr.resolutionType).toBe("REFUND");
      expect(rr.refundDestination).toBe("SHOPPING_BALANCE");
      expect(rr.refundDestinationSelectedBy).toBe("CUSTOMER");
      expect(rr.refundDestinationSelectedAt).not.toBeNull();
    }
  });

  it("rejects REFUND without destination (server authority)", async () => {
    const o = await order(true);
    const res = await createReturnRequest(
      {
        storeId: o.storeId, customerId: o.customerId, orderNumber: o.orderNumber,
        resolutionType: "REFUND",
        items: [{ orderLineId: o.orderLineId, quantity: 1, reason: "NO_LONGER_NEEDED", customerComment: "x" }],
      },
      new Date(),
    );
    expect(res).toMatchObject({ ok: false, code: "REFUND_DESTINATION_INVALID" });
  });

  it("rejects ORIGINAL_PAYMENT when order has no external payment", async () => {
    const o = await order(false); // no paid payment → no external refundable
    const res = await createReturnRequest(
      {
        storeId: o.storeId, customerId: o.customerId, orderNumber: o.orderNumber,
        resolutionType: "REFUND", refundDestination: "ORIGINAL_PAYMENT",
        items: [{ orderLineId: o.orderLineId, quantity: 1, reason: "NO_LONGER_NEEDED", customerComment: "x" }],
      },
      new Date(),
    );
    expect(res).toMatchObject({ ok: false, code: "REFUND_DESTINATION_INVALID" });
  });
});
