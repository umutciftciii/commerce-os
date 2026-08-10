import { describe, it, expect } from "vitest";
import {
  DEFAULT_TICKET_SLA_POLICY,
  SUPPORT_TOPICS,
  resolveTicketSlaTarget,
  computeTicketDueAts,
  type TicketSlaPolicy,
} from "../src/ticket-sla-policy.js";

describe("ticket SLA policy (ADR-289 §5, topic-based platform-owned)", () => {
  it("uses the topic override when present", () => {
    const p: TicketSlaPolicy = {
      default: { firstResponseHours: 24, resolutionHours: 72 },
      byTopic: { WARRANTY_SERVICE: { firstResponseHours: 8, resolutionHours: 48 } },
    };
    expect(resolveTicketSlaTarget(p, "WARRANTY_SERVICE")).toEqual({
      firstResponseHours: 8,
      resolutionHours: 48,
    });
  });

  it("falls back to default when the topic has no override", () => {
    expect(resolveTicketSlaTarget(DEFAULT_TICKET_SLA_POLICY, "OTHER")).toEqual(
      DEFAULT_TICKET_SLA_POLICY.default,
    );
  });

  it("resolves a target for every SupportTopic (no topic can dead-end SLA)", () => {
    for (const topic of SUPPORT_TOPICS) {
      const t = resolveTicketSlaTarget(DEFAULT_TICKET_SLA_POLICY, topic);
      expect(t.firstResponseHours).toBeGreaterThan(0);
      expect(t.resolutionHours).toBeGreaterThan(0);
      // resolution must never be tighter than first-response (invariant)
      expect(t.resolutionHours).toBeGreaterThanOrEqual(t.firstResponseHours);
    }
  });

  it("computes deterministic due dates from now (+hours)", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const { firstResponseDueAt, resolutionDueAt } = computeTicketDueAts(now, {
      firstResponseHours: 24,
      resolutionHours: 72,
    });
    expect(firstResponseDueAt.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(resolutionDueAt.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    // pure: input `now` is not mutated
    expect(now.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("SUPPORT_TOPICS lists exactly the seven Faz 1 topics", () => {
    expect([...SUPPORT_TOPICS].sort()).toEqual(
      [
        "DAMAGED_OR_MISSING",
        "INVOICE_DOCUMENT",
        "OTHER",
        "PRODUCT_INFO",
        "PRODUCT_NOT_WORKING",
        "SETUP_USAGE",
        "WARRANTY_SERVICE",
      ].sort(),
    );
  });
});
