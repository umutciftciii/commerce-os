import { describe, it, expect } from "vitest";
import {
  buildReturnOrderSummary,
  isActiveReturnStatus,
  type ReturnProjectionRequestInput,
} from "../src/returns/projection";

const DAY = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(iso);

function req(
  status: ReturnProjectionRequestInput["status"],
  items: Array<[number, number | null]>,
  refund?: { totalRefundMinor: number; status: "PENDING" | "PROCESSED" | "CANCELLED" },
  createdAt = "2026-08-02T00:00:00Z",
): ReturnProjectionRequestInput {
  return {
    status,
    createdAt: d(createdAt),
    items: items.map(([quantity, approvedQuantity]) => ({ quantity, approvedQuantity })),
    refundIntent: refund ?? null,
  };
}

describe("returns projection — window (ADR-269 §2, blocker #1)", () => {
  it("not delivered → NOT_DELIVERED, null window/remainingDays", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-04T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: null,
      requests: [],
    });
    expect(s.windowState).toBe("NOT_DELIVERED");
    expect(s.returnWindowEndsAt).toBeNull();
    expect(s.remainingDays).toBeNull();
    expect(s.deliveredAt).toBeNull();
  });

  it("window end = deliveredAt + 14 gün (satın alma tarihi kullanılmaz)", () => {
    const anchor = d("2026-08-02T00:00:00Z");
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-04T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: anchor,
      requests: [],
    });
    expect(s.returnWindowEndsAt).toBe(new Date(anchor.getTime() + 14 * DAY).toISOString());
    expect(s.deliveredAt).toBe(anchor.toISOString());
    expect(s.windowState).toBe("ELIGIBLE");
    expect(s.remainingDays).toBe(12);
  });

  it("store policy override (30 gün)", () => {
    const anchor = d("2026-08-02T00:00:00Z");
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-04T00:00:00Z"),
      returnWindowDays: 30,
      deliveryAnchor: anchor,
      requests: [],
    });
    expect(s.returnWindowDays).toBe(30);
    expect(s.remainingDays).toBe(28);
  });

  it("expired → EXPIRED, remainingDays ≤ 0", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-09-01T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-01T00:00:00Z"),
      requests: [],
    });
    expect(s.windowState).toBe("EXPIRED");
    expect(s.remainingDays!).toBeLessThanOrEqual(0);
  });
});

describe("returns projection — activity (blocker #5/#6)", () => {
  it("boş → tüm sayımlar 0, latestStatus null", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-04T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [],
    });
    expect(s.requestCount).toBe(0);
    expect(s.activeRequestCount).toBe(0);
    expect(s.latestStatus).toBeNull();
  });

  it("tek aktif talep → pendingItemQuantity, latestStatus", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-04T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("REQUESTED", [[1, null]])],
    });
    expect(s.requestCount).toBe(1);
    expect(s.activeRequestCount).toBe(1);
    expect(s.pendingItemQuantity).toBe(1);
    expect(s.returnedItemQuantity).toBe(0);
    expect(s.latestStatus).toBe("REQUESTED");
  });

  it("latestStatus = en son oluşturulan talep", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [
        req("REJECTED", [[1, null]], undefined, "2026-08-03T00:00:00Z"),
        req("APPROVED", [[1, null]], undefined, "2026-08-06T00:00:00Z"),
      ],
    });
    expect(s.latestStatus).toBe("APPROVED");
  });

  it("iptal/red/expire aktif SAYILMAZ ve adet havuza döner", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("CANCELLED_BY_CUSTOMER", [[2, null]]), req("EXPIRED", [[1, null]])],
    });
    expect(s.activeRequestCount).toBe(0);
    expect(s.pendingItemQuantity).toBe(0);
  });

  it("RECEIVED sonrası returnedItemQuantity approvedQuantity kullanır", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("RECEIVED", [[2, 1]])], // istenen 2, onaylanan 1
    });
    expect(s.returnedItemQuantity).toBe(1);
  });

  it("isActiveReturnStatus", () => {
    expect(isActiveReturnStatus("REQUESTED")).toBe(true);
    expect(isActiveReturnStatus("REFUND_PENDING")).toBe(true);
    expect(isActiveReturnStatus("REJECTED")).toBe(false);
    expect(isActiveReturnStatus("COMPLETED")).toBe(false);
    expect(isActiveReturnStatus("CLOSED")).toBe(false);
  });
});

describe("returns projection — financial impact (ADR-268/§7, blocker #7)", () => {
  it("PENDING RefundIntent → approved niyet, completed 0, hasPendingFinancialImpact true", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("REFUND_PENDING", [[1, 1]], { totalRefundMinor: 631350, status: "PENDING" })],
    });
    expect(s.approvedRefundIntentMinor).toBe(631350);
    expect(s.completedRefundMinor).toBe(0);
    expect(s.hasPendingFinancialImpact).toBe(true);
  });

  it("PROCESSED refund → completed sayılır, pending etki yok (TODO-170)", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("COMPLETED", [[1, 1]], { totalRefundMinor: 631350, status: "PROCESSED" })],
    });
    expect(s.approvedRefundIntentMinor).toBe(0);
    expect(s.completedRefundMinor).toBe(631350);
    expect(s.hasPendingFinancialImpact).toBe(false);
  });

  it("refund intent yoksa finansal etki yok", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("APPROVED", [[1, 1]])],
    });
    expect(s.approvedRefundIntentMinor).toBe(0);
    expect(s.hasPendingFinancialImpact).toBe(false);
  });
});
