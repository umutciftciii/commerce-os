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
  refund?: { totalRefundMinor: number; status: "PENDING" | "PROCESSED" | "CONSUMED" | "CANCELLED" },
  createdAt = "2026-08-02T00:00:00Z",
  returnNumber = "RET-1",
  realizedRefundMinor = 0,
): ReturnProjectionRequestInput {
  return {
    returnNumber,
    status,
    createdAt: d(createdAt),
    items: items.map(([quantity, approvedQuantity]) => ({ quantity, approvedQuantity })),
    refundIntent: refund ?? null,
    realizedRefundMinor,
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

  it("CONSUMED intent + gerçekleşen ledger refund → completed sayılır, pending etki yok (ADR-272)", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      // Intent CONSUMED (beklenen), ledger'da SUCCEEDED refund realized = 631350 (gerçekleşen).
      requests: [req("COMPLETED", [[1, 1]], { totalRefundMinor: 631350, status: "CONSUMED" }, undefined, "RET-1", 631350)],
    });
    expect(s.approvedRefundIntentMinor).toBe(631350);
    expect(s.completedRefundMinor).toBe(631350);
    expect(s.hasPendingFinancialImpact).toBe(false);
  });

  it("CONSUMED intent ama refund FAILED (realized 0) → beklenen var, gerçekleşen 0, pending etki (ADR-272)", () => {
    const s = buildReturnOrderSummary({
      currency: "TRY",
      now: d("2026-08-10T00:00:00Z"),
      returnWindowDays: 14,
      deliveryAnchor: d("2026-08-02T00:00:00Z"),
      requests: [req("REFUND_PENDING", [[1, 1]], { totalRefundMinor: 631350, status: "CONSUMED" }, undefined, "RET-1", 0)],
    });
    expect(s.approvedRefundIntentMinor).toBe(631350);
    expect(s.completedRefundMinor).toBe(0);
    expect(s.hasPendingFinancialImpact).toBe(true);
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

// BUG-RETURN-DEEPLINK — CTA tek-otorite deep-link hedefi (primaryReturnNumber).
describe("returns projection — deep-link primaryReturnNumber (BUG-RETURN-DEEPLINK)", () => {
  const base = {
    currency: "TRY",
    now: d("2026-08-10T00:00:00Z"),
    returnWindowDays: 14,
    deliveryAnchor: d("2026-08-02T00:00:00Z"),
  };

  it("hiç iade yoksa null", () => {
    const s = buildReturnOrderSummary({ ...base, requests: [] });
    expect(s.primaryReturnNumber).toBeNull();
  });

  it("tek aktif iade → o iadenin numarası (takip detayına deep-link)", () => {
    const s = buildReturnOrderSummary({
      ...base,
      requests: [req("APPROVED", [[1, 1]], undefined, "2026-08-03T00:00:00Z", "RET-42")],
    });
    expect(s.activeRequestCount).toBe(1);
    expect(s.primaryReturnNumber).toBe("RET-42");
  });

  it("birden fazla aktif iade → null (sipariş detayı #returns'e gider)", () => {
    const s = buildReturnOrderSummary({
      ...base,
      requests: [
        req("APPROVED", [[1, 1]], undefined, "2026-08-03T00:00:00Z", "RET-1"),
        req("REQUESTED", [[1, null]], undefined, "2026-08-04T00:00:00Z", "RET-2"),
      ],
    });
    expect(s.activeRequestCount).toBe(2);
    expect(s.primaryReturnNumber).toBeNull();
  });

  it("aktif iade yok ama tek toplam iade (kapalı) → o iadenin numarası", () => {
    const s = buildReturnOrderSummary({
      ...base,
      requests: [req("COMPLETED", [[1, 1]], undefined, "2026-08-03T00:00:00Z", "RET-9")],
    });
    expect(s.activeRequestCount).toBe(0);
    expect(s.primaryReturnNumber).toBe("RET-9");
  });

  it("aktif iade yok, birden fazla kapalı iade → null", () => {
    const s = buildReturnOrderSummary({
      ...base,
      requests: [
        req("REJECTED", [[1, null]], undefined, "2026-08-03T00:00:00Z", "RET-1"),
        req("COMPLETED", [[1, 1]], undefined, "2026-08-04T00:00:00Z", "RET-2"),
      ],
    });
    expect(s.primaryReturnNumber).toBeNull();
  });
});
