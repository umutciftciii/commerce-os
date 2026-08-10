import { describe, it, expect } from "vitest";
import {
  evaluateStatusTransition,
  evaluateReopen,
  REOPEN_WINDOW_DAYS,
} from "../src/product-support/status-map";

const RESOLVED_AT = new Date("2026-08-10T00:00:00.000Z");
const DAY = 86_400_000;

describe("status transitions (ADR-289 §7, server-authoritative)", () => {
  it("store admin can move active states to RESOLVED", () => {
    expect(evaluateStatusTransition("OPEN", "RESOLVED", "STORE_ADMIN")).toEqual({ ok: true, code: "OK" });
    expect(evaluateStatusTransition("WAITING_CUSTOMER", "RESOLVED", "STORE_ADMIN")).toEqual({
      ok: true,
      code: "OK",
    });
  });

  it("store admin reply moves OPEN/WAITING_STORE to WAITING_CUSTOMER", () => {
    expect(evaluateStatusTransition("WAITING_STORE", "WAITING_CUSTOMER", "STORE_ADMIN")).toEqual({
      ok: true,
      code: "OK",
    });
  });

  it("store admin can close from RESOLVED", () => {
    expect(evaluateStatusTransition("RESOLVED", "CLOSED", "STORE_ADMIN")).toEqual({ ok: true, code: "OK" });
  });

  it("customer reply moves WAITING_CUSTOMER to WAITING_STORE", () => {
    expect(evaluateStatusTransition("WAITING_CUSTOMER", "WAITING_STORE", "CUSTOMER")).toEqual({
      ok: true,
      code: "OK",
    });
  });

  it("customer cannot resolve or close", () => {
    expect(evaluateStatusTransition("OPEN", "RESOLVED", "CUSTOMER").code).toBe("INVALID_TRANSITION");
    expect(evaluateStatusTransition("WAITING_STORE", "CLOSED", "CUSTOMER").code).toBe("INVALID_TRANSITION");
  });

  it("system can move to WAITING_CUSTOMER", () => {
    expect(evaluateStatusTransition("OPEN", "WAITING_CUSTOMER", "SYSTEM")).toEqual({ ok: true, code: "OK" });
  });

  it("rejects a nonsense transition", () => {
    expect(evaluateStatusTransition("CLOSED", "OPEN", "STORE_ADMIN").code).toBe("INVALID_TRANSITION");
    expect(evaluateStatusTransition("OPEN", "OPEN", "STORE_ADMIN").code).toBe("INVALID_TRANSITION");
  });
});

describe("reopen (ADR-289 §7: owner-only, 7-day window, fresh cycle)", () => {
  it("exposes a 7-day window constant", () => {
    expect(REOPEN_WINDOW_DAYS).toBe(7);
  });

  it("allows the owner to reopen a RESOLVED ticket inside the window", () => {
    expect(
      evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 3 * DAY), true),
    ).toEqual({ ok: true, code: "OK" });
  });

  it("rejects reopen past the 7-day window", () => {
    expect(
      evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 8 * DAY), true).code,
    ).toBe("REOPEN_WINDOW_EXPIRED");
  });

  it("allows reopen exactly at the 7-day boundary", () => {
    expect(
      evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 7 * DAY), true).ok,
    ).toBe(true);
  });

  it("rejects reopen by a non-owner", () => {
    expect(
      evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 1 * DAY), false).code,
    ).toBe("NOT_OWNER");
  });

  it("CLOSED tickets can never be reopened", () => {
    expect(
      evaluateReopen("CLOSED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 1 * DAY), true).code,
    ).toBe("CLOSED_CANNOT_REOPEN");
  });

  it("rejects reopen of a non-RESOLVED, non-CLOSED ticket", () => {
    expect(
      evaluateReopen("OPEN", null, new Date(RESOLVED_AT.getTime() + 1 * DAY), true).code,
    ).toBe("INVALID_TRANSITION");
  });
});
