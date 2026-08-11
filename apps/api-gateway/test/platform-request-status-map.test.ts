import { describe, it, expect } from "vitest";
import {
  evaluateTransition,
  evaluateClose,
  evaluateReopen,
  REOPEN_WINDOW_DAYS,
} from "../src/platform-requests/status-map";

const RESOLVED_AT = new Date("2026-08-11T00:00:00.000Z");
const DAY = 86_400_000;

describe("platform-request transitions (TODO-178, server-authoritative)", () => {
  it("platform triages then works a request (Faz B: OPEN → TRIAGED/IN_PROGRESS/WAITING_STORE/RESOLVED)", () => {
    expect(evaluateTransition("OPEN", "TRIAGED", "PLATFORM")).toEqual({ ok: true, code: "OK" });
    expect(evaluateTransition("OPEN", "IN_PROGRESS", "PLATFORM")).toEqual({ ok: true, code: "OK" });
    expect(evaluateTransition("OPEN", "WAITING_STORE", "PLATFORM")).toEqual({ ok: true, code: "OK" });
    expect(evaluateTransition("OPEN", "RESOLVED", "PLATFORM")).toEqual({ ok: true, code: "OK" });
    expect(evaluateTransition("TRIAGED", "IN_PROGRESS", "PLATFORM")).toEqual({ ok: true, code: "OK" });
    expect(evaluateTransition("TRIAGED", "WAITING_STORE", "PLATFORM").ok).toBe(true);
    expect(evaluateTransition("TRIAGED", "RESOLVED", "PLATFORM").ok).toBe(true);
  });

  it("platform toggles IN_PROGRESS ↔ WAITING_STORE and resolves only from OPEN/TRIAGED/IN_PROGRESS", () => {
    expect(evaluateTransition("IN_PROGRESS", "WAITING_STORE", "PLATFORM").ok).toBe(true);
    expect(evaluateTransition("WAITING_STORE", "IN_PROGRESS", "PLATFORM").ok).toBe(true);
    expect(evaluateTransition("IN_PROGRESS", "RESOLVED", "PLATFORM").ok).toBe(true);
    // Faz B: WAITING_STORE resolve etmez (önce IN_PROGRESS); RESOLVED reopen yalnız reopenRequest ile.
    expect(evaluateTransition("WAITING_STORE", "RESOLVED", "PLATFORM").code).toBe("INVALID_TRANSITION");
    expect(evaluateTransition("RESOLVED", "IN_PROGRESS", "PLATFORM").code).toBe("INVALID_TRANSITION");
  });

  it("a store reply returns WAITING_STORE to IN_PROGRESS (SYSTEM)", () => {
    expect(evaluateTransition("WAITING_STORE", "IN_PROGRESS", "SYSTEM")).toEqual({ ok: true, code: "OK" });
  });

  it("store cannot drive status transitions (no direct status control)", () => {
    expect(evaluateTransition("OPEN", "TRIAGED", "STORE").code).toBe("INVALID_TRANSITION");
    expect(evaluateTransition("IN_PROGRESS", "RESOLVED", "STORE").code).toBe("INVALID_TRANSITION");
  });

  it("CLOSED is never reachable via evaluateTransition (must go through evaluateClose)", () => {
    expect(evaluateTransition("RESOLVED", "CLOSED", "PLATFORM").code).toBe("INVALID_TRANSITION");
    expect(evaluateTransition("OPEN", "CLOSED", "STORE").code).toBe("INVALID_TRANSITION");
  });

  it("rejects nonsense/no-op transitions", () => {
    expect(evaluateTransition("CLOSED", "OPEN", "PLATFORM").code).toBe("INVALID_TRANSITION");
    expect(evaluateTransition("OPEN", "OPEN", "PLATFORM").code).toBe("INVALID_TRANSITION");
    expect(evaluateTransition("OPEN", "RESOLVED", "STORE").code).toBe("INVALID_TRANSITION");
  });
});

describe("platform-request close (TODO-178, closeReason guards; no CANCELLED status)", () => {
  it("store withdraws only from OPEN/TRIAGED/WAITING_STORE with WITHDRAWN_BY_STORE", () => {
    for (const from of ["OPEN", "TRIAGED", "WAITING_STORE"] as const) {
      expect(evaluateClose(from, "STORE", "WITHDRAWN_BY_STORE")).toEqual({ ok: true, code: "OK" });
    }
    expect(evaluateClose("IN_PROGRESS", "STORE", "WITHDRAWN_BY_STORE").code).toBe("INVALID_CLOSE_REASON");
    expect(evaluateClose("RESOLVED", "STORE", "WITHDRAWN_BY_STORE").code).toBe("INVALID_CLOSE_REASON");
  });

  it("store confirm-closes only from RESOLVED with COMPLETED", () => {
    expect(evaluateClose("RESOLVED", "STORE", "COMPLETED")).toEqual({ ok: true, code: "OK" });
    expect(evaluateClose("OPEN", "STORE", "COMPLETED").code).toBe("INVALID_CLOSE_REASON");
  });

  it("store cannot use platform-only close reasons", () => {
    expect(evaluateClose("OPEN", "STORE", "NOT_ACTIONABLE").code).toBe("ACTOR_NOT_ALLOWED");
    expect(evaluateClose("OPEN", "STORE", "DUPLICATE").code).toBe("ACTOR_NOT_ALLOWED");
    expect(evaluateClose("OPEN", "STORE", "REJECTED").code).toBe("ACTOR_NOT_ALLOWED");
  });

  it("platform closes active states with operational reasons and RESOLVED with COMPLETED", () => {
    for (const from of ["OPEN", "TRIAGED", "IN_PROGRESS", "WAITING_STORE"] as const) {
      expect(evaluateClose(from, "PLATFORM", "NOT_ACTIONABLE").ok).toBe(true);
      expect(evaluateClose(from, "PLATFORM", "DUPLICATE").ok).toBe(true);
      expect(evaluateClose(from, "PLATFORM", "REJECTED").ok).toBe(true);
    }
    expect(evaluateClose("RESOLVED", "PLATFORM", "COMPLETED").ok).toBe(true);
  });

  it("platform cannot mark COMPLETED before RESOLVED, and cannot use WITHDRAWN_BY_STORE", () => {
    expect(evaluateClose("IN_PROGRESS", "PLATFORM", "COMPLETED").code).toBe("INVALID_CLOSE_REASON");
    expect(evaluateClose("OPEN", "PLATFORM", "WITHDRAWN_BY_STORE").code).toBe("ACTOR_NOT_ALLOWED");
  });

  it("an already-closed request cannot be closed again, and SYSTEM cannot close", () => {
    expect(evaluateClose("CLOSED", "PLATFORM", "COMPLETED").code).toBe("ALREADY_CLOSED");
    expect(evaluateClose("OPEN", "SYSTEM", "NOT_ACTIONABLE").code).toBe("ACTOR_NOT_ALLOWED");
  });
});

describe("platform-request reopen (TODO-178: requester-store, 7-day window, fresh cycle)", () => {
  it("exposes a 7-day window constant", () => {
    expect(REOPEN_WINDOW_DAYS).toBe(7);
  });

  it("lets the requester store reopen a RESOLVED request inside the window", () => {
    expect(evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 3 * DAY), true)).toEqual({
      ok: true,
      code: "OK",
    });
  });

  it("allows reopen exactly at the boundary, rejects past it", () => {
    expect(evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 7 * DAY), true).ok).toBe(true);
    expect(evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + 8 * DAY), true).code).toBe(
      "REOPEN_WINDOW_EXPIRED",
    );
  });

  it("rejects reopen by a non-owner store, a CLOSED request, or a non-RESOLVED request", () => {
    expect(evaluateReopen("RESOLVED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + DAY), false).code).toBe("NOT_OWNER");
    expect(evaluateReopen("CLOSED", RESOLVED_AT, new Date(RESOLVED_AT.getTime() + DAY), true).code).toBe(
      "CLOSED_CANNOT_REOPEN",
    );
    expect(evaluateReopen("IN_PROGRESS", null, new Date(RESOLVED_AT.getTime() + DAY), true).code).toBe(
      "INVALID_TRANSITION",
    );
  });
});
