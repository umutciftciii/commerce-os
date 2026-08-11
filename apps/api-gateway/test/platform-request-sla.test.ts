import { describe, it, expect } from "vitest";
import {
  slaStateFor,
  liveSlaSnapshot,
  isLiveCycleAtSlaRisk,
} from "../src/platform-requests/sla";

const DUE = new Date("2026-08-12T12:00:00.000Z");

describe("platform-request SLA state (TODO-178, read-time; no persisted breach flag)", () => {
  it("is DONE when met or terminal regardless of due date", () => {
    expect(slaStateFor(DUE, new Date("2026-08-11T00:00:00.000Z"), new Date("2026-08-20T00:00:00.000Z"), false)).toBe("DONE");
    expect(slaStateFor(DUE, null, new Date("2026-08-20T00:00:00.000Z"), true)).toBe("DONE");
  });

  it("is OVERDUE past the due instant", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-12T12:00:00.001Z"), false)).toBe("OVERDUE");
  });

  it("is DUE_TODAY on the same UTC calendar day before due, INSIDE the day before", () => {
    expect(slaStateFor(DUE, null, new Date("2026-08-12T05:00:00.000Z"), false)).toBe("DUE_TODAY");
    expect(slaStateFor(DUE, null, new Date("2026-08-11T23:59:59.000Z"), false)).toBe("INSIDE");
  });

  it("picks the highest cycle as the live snapshot", () => {
    const snaps = [{ cycle: 1 }, { cycle: 3 }, { cycle: 2 }];
    expect(liveSlaSnapshot(snaps)?.cycle).toBe(3);
    expect(liveSlaSnapshot([])).toBeNull();
  });

  it("flags live-cycle SLA risk only from the highest cycle (reopen resolves false-positives)", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const snaps = [
      // old cycle overdue+resolved — must be ignored (not live)
      {
        cycle: 1,
        firstResponseDueAt: new Date("2026-08-10T00:00:00.000Z"),
        firstResponseMetAt: new Date("2026-08-10T00:00:00.000Z"),
        resolutionDueAt: new Date("2026-08-11T00:00:00.000Z"),
        resolvedAt: new Date("2026-08-11T00:00:00.000Z"),
      },
      // live cycle, resolution overdue, unresolved → at risk
      {
        cycle: 2,
        firstResponseDueAt: new Date("2026-08-16T00:00:00.000Z"),
        firstResponseMetAt: new Date("2026-08-14T00:00:00.000Z"),
        resolutionDueAt: new Date("2026-08-14T00:00:00.000Z"),
        resolvedAt: null,
      },
    ];
    expect(isLiveCycleAtSlaRisk(snaps, now)).toBe(true);
    expect(isLiveCycleAtSlaRisk([snaps[0]], now)).toBe(false);
  });
});
