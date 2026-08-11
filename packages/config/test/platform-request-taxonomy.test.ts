import { describe, it, expect } from "vitest";
import {
  PLATFORM_REQUEST_PRIORITIES,
  PLATFORM_REQUEST_STORE_IMPACTS,
  PLATFORM_REQUEST_CLOSE_REASONS,
  PLATFORM_REQUEST_CONTEXT_KINDS,
  PLATFORM_REQUEST_CATEGORY_SEED,
  deriveInitialPriority,
  formatPlatformRequestNumber,
  type PlatformRequestStoreImpact,
} from "../src/platform-request-taxonomy.js";
import { DEFAULT_PLATFORM_REQUEST_SLA_POLICY } from "../src/platform-request-sla-policy.js";

describe("platform-request taxonomy (TODO-178)", () => {
  it("lists the fixed platform-owned priority ladder", () => {
    expect([...PLATFORM_REQUEST_PRIORITIES]).toEqual(["LOW", "NORMAL", "HIGH", "URGENT"]);
  });

  it("lists the advisory store impact scale and the close reasons and context kinds", () => {
    expect([...PLATFORM_REQUEST_STORE_IMPACTS]).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect([...PLATFORM_REQUEST_CLOSE_REASONS].sort()).toEqual(
      ["COMPLETED", "DUPLICATE", "NOT_ACTIONABLE", "REJECTED", "WITHDRAWN_BY_STORE"].sort(),
    );
    expect(PLATFORM_REQUEST_CONTEXT_KINDS).toContain("NONE");
    expect(PLATFORM_REQUEST_CONTEXT_KINDS).toContain("PLATFORM_POLICY");
  });

  it("seeds a non-empty category set with unique keys and stable sort order", () => {
    const keys = PLATFORM_REQUEST_CATEGORY_SEED.map((c) => c.key);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    expect(new Set(keys).size).toBe(keys.length);
    // covers the first real use cases
    expect(keys).toEqual(
      expect.arrayContaining([
        "CANCELLATION_TAXONOMY",
        "PRODUCT_SUPPORT_CONFIG",
        "CATALOG_TAXONOMY",
        "PLATFORM_POLICY",
      ]),
    );
    const orders = PLATFORM_REQUEST_CATEGORY_SEED.map((c) => c.sortOrder);
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b));
  });

  it("every seeded category default priority is a valid platform priority", () => {
    for (const c of PLATFORM_REQUEST_CATEGORY_SEED) {
      expect(PLATFORM_REQUEST_PRIORITIES).toContain(c.defaultPriority);
    }
  });

  it("every seeded category slaPolicyKey resolves to a valid SLA target (no dead-end)", () => {
    for (const c of PLATFORM_REQUEST_CATEGORY_SEED) {
      const target =
        DEFAULT_PLATFORM_REQUEST_SLA_POLICY.byKey[c.slaPolicyKey] ??
        DEFAULT_PLATFORM_REQUEST_SLA_POLICY.default;
      expect(target.resolutionHours).toBeGreaterThanOrEqual(target.firstResponseHours);
    }
  });

  it("initial priority derives ONLY from the category default — store impact has no authority", () => {
    const impacts: PlatformRequestStoreImpact[] = ["LOW", "MEDIUM", "HIGH"];
    // Same category default across every possible store impact → identical priority.
    for (const impact of impacts) {
      expect(deriveInitialPriority("NORMAL", impact)).toBe("NORMAL");
    }
    expect(deriveInitialPriority("HIGH", undefined)).toBe("HIGH");
    expect(deriveInitialPriority("LOW", "HIGH")).toBe("LOW");
  });

  it("formats a global request number as zero-padded PR-######", () => {
    expect(formatPlatformRequestNumber(1)).toBe("PR-000001");
    expect(formatPlatformRequestNumber(42)).toBe("PR-000042");
    expect(formatPlatformRequestNumber(1234567)).toBe("PR-1234567");
  });
});
