import { describe, it, expect } from "vitest";
import { slaStateFor } from "../src/product-support/sla";

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
