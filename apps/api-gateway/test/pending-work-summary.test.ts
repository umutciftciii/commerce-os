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

  it("actionable = settled olmayan tüm iadeler; settled sayılmaz", () => {
    const s = buildPendingWorkSummary(
      [],
      ret([
        ["REQUESTED", 2, "2026-08-03T00:00:00Z"],
        ["REFUND_PENDING", 1, "2026-08-02T00:00:00Z"],
        ["COMPLETED", 5, "2026-07-01T00:00:00Z"], // settled → sayılmaz
        ["REJECTED", 4, "2026-07-01T00:00:00Z"], // settled → sayılmaz
      ]),
    );
    expect(s.returns.actionable.count).toBe(3); // 2 + 1
    // En eski aktif ankor REFUND_PENDING (08-02), COMPLETED/REJECTED (07-01) sayılmaz.
    expect(s.returns.actionable.oldestAt).toBe("2026-08-02T00:00:00.000Z");
  });

  it("kategoriler doğru gruplanır (yeni/inceleme/finansal)", () => {
    const s = buildPendingWorkSummary(
      [],
      ret([
        ["REQUESTED", 2, "2026-08-04T00:00:00Z"],
        ["UNDER_REVIEW", 1, "2026-08-03T00:00:00Z"],
        ["RECEIVED", 1, "2026-08-02T00:00:00Z"],
        ["INSPECTION_REQUIRED", 2, "2026-08-01T00:00:00Z"],
        ["REFUND_PENDING", 1, "2026-08-05T00:00:00Z"],
        ["REPLACEMENT_PENDING", 1, "2026-08-06T00:00:00Z"],
      ]),
    );
    expect(s.returns.newRequests.count).toBe(3); // REQUESTED + UNDER_REVIEW
    expect(s.returns.newRequests.oldestAt).toBe("2026-08-03T00:00:00.000Z");
    expect(s.returns.inspection.count).toBe(3); // RECEIVED + INSPECTION_REQUIRED
    expect(s.returns.inspection.oldestAt).toBe("2026-08-01T00:00:00.000Z");
    expect(s.returns.financialAction.count).toBe(2); // REFUND_PENDING + REPLACEMENT_PENDING
  });

  it("settled kümesi ADR-269 terminal durumlarıyla hizalı", () => {
    expect(new Set(RETURN_SETTLED_STATUSES)).toEqual(
      new Set(["COMPLETED", "REJECTED", "CANCELLED_BY_CUSTOMER", "EXPIRED", "CLOSED"]),
    );
  });
});
