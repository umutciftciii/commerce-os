import { describe, it, expect } from "vitest";
import type { ReturnOrderSummary } from "@commerce-os/api-client";
import {
  resolveReturnWindowLabel,
  resolveReturnActivityLabel,
  hasPendingReturnRefund,
  resolveReturnCtaHref,
} from "../lib/returns-summary";

function summary(overrides: Partial<ReturnOrderSummary> = {}): ReturnOrderSummary {
  return {
    currency: "TRY",
    deliveredAt: "2026-08-02T00:00:00.000Z",
    returnWindowDays: 14,
    returnWindowEndsAt: "2026-08-16T00:00:00.000Z",
    remainingDays: 12,
    windowState: "ELIGIBLE",
    requestCount: 0,
    activeRequestCount: 0,
    primaryReturnNumber: null,
    returnedItemQuantity: 0,
    pendingItemQuantity: 0,
    latestStatus: null,
    approvedRefundIntentMinor: 0,
    completedRefundMinor: 0,
    hasPendingFinancialImpact: false,
    ...overrides,
  };
}

describe("resolveReturnWindowLabel (TODO-169 blocker #1)", () => {
  it("teslim edilmemiş → null (gösterme)", () => {
    expect(resolveReturnWindowLabel(summary({ windowState: "NOT_DELIVERED", returnWindowEndsAt: null }))).toBeNull();
  });

  it("uygun + 3 günden fazla → eligible (son tarih)", () => {
    const label = resolveReturnWindowLabel(summary({ remainingDays: 12 }));
    expect(label).toEqual({ kind: "eligible", endsAt: "2026-08-16T00:00:00.000Z" });
  });

  it("uygun + ≤3 gün → endingSoon", () => {
    const label = resolveReturnWindowLabel(summary({ remainingDays: 3 }));
    expect(label).toEqual({ kind: "endingSoon", remainingDays: 3 });
  });

  it("süre doldu → expired", () => {
    expect(resolveReturnWindowLabel(summary({ windowState: "EXPIRED", remainingDays: -2 }))).toEqual({
      kind: "expired",
    });
  });

  it("null summary → null", () => {
    expect(resolveReturnWindowLabel(null)).toBeNull();
  });
});

describe("resolveReturnActivityLabel (TODO-169 blocker #5)", () => {
  it("iade yok → null", () => {
    expect(resolveReturnActivityLabel(summary())).toBeNull();
  });

  it("aktif talep → latestStatus + pending adet", () => {
    const label = resolveReturnActivityLabel(
      summary({ requestCount: 1, activeRequestCount: 1, pendingItemQuantity: 2, latestStatus: "REQUESTED" }),
    );
    expect(label).toEqual({ status: "REQUESTED", count: 2 });
  });

  it("tamamlanmış → returnedItemQuantity", () => {
    const label = resolveReturnActivityLabel(
      summary({ requestCount: 1, returnedItemQuantity: 1, latestStatus: "COMPLETED" }),
    );
    expect(label).toEqual({ status: "COMPLETED", count: 1 });
  });
});

describe("hasPendingReturnRefund (TODO-169 blocker #7)", () => {
  it("pending finansal etki bayrağını yansıtır", () => {
    expect(hasPendingReturnRefund(summary({ hasPendingFinancialImpact: true }))).toBe(true);
    expect(hasPendingReturnRefund(summary())).toBe(false);
    expect(hasPendingReturnRefund(null)).toBe(false);
  });
});

describe("resolveReturnCtaHref (BUG-RETURN-DEEPLINK)", () => {
  it("tek odak iade → iade takip detayına deep-link", () => {
    expect(resolveReturnCtaHref("ORD-100", summary({ primaryReturnNumber: "RET-42" }))).toBe(
      "/account/returns/RET-42",
    );
  });

  it("belirsiz (odak iade yok) → sipariş detayı #returns", () => {
    expect(resolveReturnCtaHref("ORD-100", summary({ primaryReturnNumber: null }))).toBe(
      "/account/orders/ORD-100#returns",
    );
  });

  it("summary yoksa → sipariş detayı #returns (fail-open)", () => {
    expect(resolveReturnCtaHref("ORD-7", null)).toBe("/account/orders/ORD-7#returns");
  });

  it("returnNumber ve orderNumber URL-encode edilir", () => {
    expect(resolveReturnCtaHref("ORD/7", summary({ primaryReturnNumber: "RET 9" }))).toBe(
      "/account/returns/RET%209",
    );
    expect(resolveReturnCtaHref("ORD/7", null)).toBe("/account/orders/ORD%2F7#returns");
  });
});
