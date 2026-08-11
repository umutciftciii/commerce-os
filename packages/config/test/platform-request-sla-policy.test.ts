import { describe, it, expect } from "vitest";
import {
  DEFAULT_PLATFORM_REQUEST_SLA_POLICY,
  resolvePlatformRequestSlaTarget,
  computePlatformRequestDueAts,
  type PlatformRequestSlaPolicy,
} from "../src/platform-request-sla-policy.js";

describe("platform-request SLA policy (TODO-178, category-key platform-owned)", () => {
  it("uses the byKey override when the sla policy key is present", () => {
    const p: PlatformRequestSlaPolicy = {
      default: { firstResponseHours: 24, resolutionHours: 120 },
      byKey: { EXPEDITED: { firstResponseHours: 8, resolutionHours: 48 } },
    };
    expect(resolvePlatformRequestSlaTarget(p, "EXPEDITED")).toEqual({
      firstResponseHours: 8,
      resolutionHours: 48,
    });
  });

  it("falls back to default for an unknown/DEFAULT sla policy key", () => {
    expect(resolvePlatformRequestSlaTarget(DEFAULT_PLATFORM_REQUEST_SLA_POLICY, "DEFAULT")).toEqual(
      DEFAULT_PLATFORM_REQUEST_SLA_POLICY.default,
    );
    expect(
      resolvePlatformRequestSlaTarget(DEFAULT_PLATFORM_REQUEST_SLA_POLICY, "__nonexistent__"),
    ).toEqual(DEFAULT_PLATFORM_REQUEST_SLA_POLICY.default);
  });

  it("keeps resolution never tighter than first-response for every configured key (invariant)", () => {
    const keys = ["DEFAULT", ...Object.keys(DEFAULT_PLATFORM_REQUEST_SLA_POLICY.byKey)];
    for (const key of keys) {
      const t = resolvePlatformRequestSlaTarget(DEFAULT_PLATFORM_REQUEST_SLA_POLICY, key);
      expect(t.firstResponseHours).toBeGreaterThan(0);
      expect(t.resolutionHours).toBeGreaterThanOrEqual(t.firstResponseHours);
    }
  });

  it("computes deterministic due dates from now (+hours) without mutating now", () => {
    const now = new Date("2026-08-11T00:00:00.000Z");
    const { firstResponseDueAt, resolutionDueAt } = computePlatformRequestDueAts(now, {
      firstResponseHours: 24,
      resolutionHours: 120,
    });
    expect(firstResponseDueAt.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(resolutionDueAt.toISOString()).toBe("2026-08-16T00:00:00.000Z");
    expect(now.toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });
});
