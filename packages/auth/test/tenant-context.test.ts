import { describe, expect, it } from "vitest";
import {
  assertStoreAccess,
  getStoreIdOrThrow,
  requirePlatformAdmin,
  requireStoreContext,
} from "../src/index.js";

const tenantContext = {
  storeId: "store_1",
  storeUserId: "store_user_1",
  role: "OWNER" as const,
};

describe("tenant context helpers", () => {
  it("requires store context", () => {
    expect(requireStoreContext(tenantContext)).toBe(tenantContext);
    expect(() => requireStoreContext(null)).toThrow("Store context is required.");
  });

  it("returns the active store id", () => {
    expect(getStoreIdOrThrow(tenantContext)).toBe("store_1");
  });

  it("asserts store access", () => {
    expect(() => assertStoreAccess(tenantContext, "store_1")).not.toThrow();
    expect(() => assertStoreAccess(tenantContext, "store_2")).toThrow("Store access denied.");
  });

  it("requires platform admin context", () => {
    expect(requirePlatformAdmin({ platformUserId: "platform_1", role: "SUPER_ADMIN" })).toEqual({
      platformUserId: "platform_1",
      role: "SUPER_ADMIN",
    });
  });
});
