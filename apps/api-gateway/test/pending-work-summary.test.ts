import { describe, it, expect } from "vitest";
import {
  buildPendingWorkSummary,
  RETURN_SETTLED_STATUSES,
  type StatusCountRow,
} from "../src/pending-work/summary";
import type { ReturnStatus, ProductReviewStatus } from "@prisma/client";

const d = (iso: string) => new Date(iso);

function rev(count: number, oldest: string | null): StatusCountRow<ProductReviewStatus>[] {
  return [{ status: "PENDING", count, oldest: oldest ? d(oldest) : null }];
}

function ret(
  entries: Array<[ReturnStatus, number, string | null]>,
): StatusCountRow<ReturnStatus>[] {
  return entries.map(([status, count, oldest]) => ({ status, count, oldest: oldest ? d(oldest) : null }));
}

describe("pending-work summary (TODO-170-recovery)", () => {
  it("boş → tüm sayaçlar 0 ve oldest null", () => {
    const s = buildPendingWorkSummary([], []);
    expect(s.reviews).toEqual({ count: 0, oldestAt: null });
    expect(s.returns.actionable).toEqual({ count: 0, oldestAt: null });
    expect(s.returns.newRequests.count).toBe(0);
    expect(s.returns.inspection.count).toBe(0);
    expect(s.returns.financialAction.count).toBe(0);
  });

  it("3 bekleyen değerlendirme → reviews.count=3 + en eski ankor", () => {
    const s = buildPendingWorkSummary(rev(3, "2026-08-01T00:00:00Z"), []);
    expect(s.reviews.count).toBe(3);
    expect(s.reviews.oldestAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("actionable = admin-actionable allowlist; müşteri/kargo-bekleyen sayılmaz (P1/P2)", () => {
    const s = buildPendingWorkSummary(
      [],
      ret([
        ["REQUESTED", 2, "2026-08-03T00:00:00Z"],
        ["REFUND_PENDING", 1, "2026-08-02T00:00:00Z"],
        ["APPROVED", 7, "2026-07-10T00:00:00Z"], // müşteri kargoya verecek → sayılmaz
        ["AWAITING_SHIPMENT", 9, "2026-07-11T00:00:00Z"], // müşteri bekleniyor → sayılmaz
        ["RETURN_SHIPPED", 3, "2026-07-12T00:00:00Z"], // kargoda → sayılmaz
        ["COMPLETED", 5, "2026-07-01T00:00:00Z"], // settled → sayılmaz
        ["REJECTED", 4, "2026-07-01T00:00:00Z"], // settled → sayılmaz
      ]),
    );
    expect(s.returns.actionable.count).toBe(3); // yalnız REQUESTED(2) + REFUND_PENDING(1)
    expect(s.returns.actionable.oldestAt).toBe("2026-08-02T00:00:00.000Z");
  });

  it("40 AWAITING_SHIPMENT → actionable badge 0", () => {
    const s = buildPendingWorkSummary([], ret([["AWAITING_SHIPMENT", 40, "2026-08-01T00:00:00Z"]]));
    expect(s.returns.actionable.count).toBe(0);
  });

  it("3 REQUESTED + 2 RECEIVED → actionable badge 5", () => {
    const s = buildPendingWorkSummary(
      [],
      ret([
        ["REQUESTED", 3, "2026-08-03T00:00:00Z"],
        ["RECEIVED", 2, "2026-08-02T00:00:00Z"],
      ]),
    );
    expect(s.returns.actionable.count).toBe(5);
  });

  it("invariant: actionable == newRequests + inspection + financialAction (sidebar==dashboard)", () => {
    const s = buildPendingWorkSummary(
      [],
      ret([
        ["REQUESTED", 2, null],
        ["UNDER_REVIEW", 1, null],
        ["RECEIVED", 1, null],
        ["INSPECTION_REQUIRED", 2, null],
        ["INSPECTED", 3, null], // eskiden KAYIP — artık inspection
        ["REFUND_PENDING", 1, null],
        ["REPLACEMENT_PENDING", 1, null],
        ["AWAITING_SHIPMENT", 8, null], // sayılmaz
        ["COMPLETED", 5, null], // sayılmaz
      ]),
    );
    const bucketSum =
      s.returns.newRequests.count + s.returns.inspection.count + s.returns.financialAction.count;
    expect(s.returns.actionable.count).toBe(bucketSum);
    expect(s.returns.actionable.count).toBe(11); // 3 + 6 + 2
  });

  it("kategoriler doğru gruplanır; INSPECTED inspection'a dahil", () => {
    const s = buildPendingWorkSummary(
      [],
      ret([
        ["REQUESTED", 2, "2026-08-04T00:00:00Z"],
        ["UNDER_REVIEW", 1, "2026-08-03T00:00:00Z"],
        ["RECEIVED", 1, "2026-08-02T00:00:00Z"],
        ["INSPECTION_REQUIRED", 2, "2026-08-01T00:00:00Z"],
        ["INSPECTED", 2, "2026-07-31T00:00:00Z"],
        ["REFUND_PENDING", 1, "2026-08-05T00:00:00Z"],
        ["REPLACEMENT_PENDING", 1, "2026-08-06T00:00:00Z"],
      ]),
    );
    expect(s.returns.newRequests.count).toBe(3); // REQUESTED + UNDER_REVIEW
    expect(s.returns.newRequests.oldestAt).toBe("2026-08-03T00:00:00.000Z");
    expect(s.returns.inspection.count).toBe(5); // RECEIVED + INSPECTION_REQUIRED + INSPECTED
    expect(s.returns.inspection.oldestAt).toBe("2026-07-31T00:00:00.000Z");
    expect(s.returns.financialAction.count).toBe(2); // REFUND_PENDING + REPLACEMENT_PENDING
  });

  it("settled kümesi ADR-269 terminal durumlarıyla hizalı", () => {
    expect(new Set(RETURN_SETTLED_STATUSES)).toEqual(
      new Set(["COMPLETED", "REJECTED", "CANCELLED_BY_CUSTOMER", "EXPIRED", "CLOSED"]),
    );
  });
});
