import { describe, it, expect } from "vitest";
import { isLiveCycleAtSlaRisk, liveSlaSnapshot, slaStateFor } from "../src/product-support/sla";

const DUE = new Date("2026-08-10T12:00:00.000Z");

describe("SLA state (ADR-289 §5, read-time; recovery slaState parity)", () => {
  it("DONE when the target is met (even if past due)", () => {
    expect(
      slaStateFor(DUE, new Date("2026-08-09T00:00:00.000Z"), new Date("2026-08-20T00:00:00.000Z"), false),
    ).toBe("DONE");
  });

  it("DONE when the ticket is terminal (resolved/closed)", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-20T00:00:00.000Z"), true)).toBe("DONE");
  });

  it("OVERDUE when now is past due and not met/terminal", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-11T00:00:00.000Z"), false)).toBe("OVERDUE");
  });

  // TD-177-2 — live cycle = en yüksek cycle; risk = live cycle OVERDUE (inbox rozetiyle aynı kaynak).
  describe("live cycle selection + SLA risk (TD-177-2)", () => {
    const PAST = new Date("2026-05-01T00:00:00.000Z");
    const NOW = new Date("2026-06-01T12:00:00.000Z");
    const FUTURE = new Date("2026-07-01T00:00:00.000Z");
    const snap = (cycle: number, o: Partial<{ frDue: Date; frMet: Date | null; resDue: Date; resolved: Date | null }> = {}) => ({
      cycle,
      firstResponseDueAt: o.frDue ?? FUTURE,
      firstResponseMetAt: o.frMet ?? null,
      resolutionDueAt: o.resDue ?? FUTURE,
      resolvedAt: o.resolved ?? null,
    });

    it("liveSlaSnapshot en yüksek cycle'ı seçer; boş → null", () => {
      expect(liveSlaSnapshot([snap(1), snap(3), snap(2)])?.cycle).toBe(3);
      expect(liveSlaSnapshot([])).toBeNull();
    });

    it("historical overdue-resolved cycle → risk DEĞİL (live cycle temiz)", () => {
      const risk = isLiveCycleAtSlaRisk(
        [
          snap(1, { frDue: PAST, frMet: PAST, resDue: PAST, resolved: PAST }), // eski overdue AMA resolved
          snap(2, { frDue: FUTURE, frMet: NOW, resDue: FUTURE, resolved: null }), // live temiz
        ],
        NOW,
      );
      expect(risk).toBe(false);
    });

    it("live cycle resolution overdue → risk", () => {
      expect(isLiveCycleAtSlaRisk([snap(1, { frDue: PAST, frMet: PAST, resDue: PAST, resolved: null })], NOW)).toBe(true);
    });

    it("live cycle first-response overdue (yanıtsız) → risk", () => {
      expect(isLiveCycleAtSlaRisk([snap(1, { frDue: PAST, frMet: null, resDue: FUTURE, resolved: null })], NOW)).toBe(true);
    });

    it("live cycle tamamen içeride → risk DEĞİL", () => {
      expect(isLiveCycleAtSlaRisk([snap(1)], NOW)).toBe(false);
    });
  });

  it("DUE_TODAY when now is the same UTC calendar day and before due", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-10T06:00:00.000Z"), false)).toBe("DUE_TODAY");
  });

  it("INSIDE when now is an earlier day", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-08T23:59:59.000Z"), false)).toBe("INSIDE");
  });

  it("exact-due boundary (now == dueAt) is DUE_TODAY, not OVERDUE", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-10T12:00:00.000Z"), false)).toBe("DUE_TODAY");
  });
});
