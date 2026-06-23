import { describe, expect, it } from "vitest";
import {
  assertStoreRole,
  assertStoreAccess,
  getStoreIdOrThrow,
  hashPassword,
  requireAuthenticatedPlatformUser,
  requirePlatformAdmin,
  requireStoreAccess,
  requireStoreContext,
  verifyPassword,
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
    expect(requireStoreAccess(tenantContext, "store_1")).toBe(tenantContext);
  });

  it("requires platform admin context", () => {
    expect(requirePlatformAdmin({ platformUserId: "platform_1", role: "SUPER_ADMIN" })).toEqual({
      platformUserId: "platform_1",
      role: "SUPER_ADMIN",
    });
    expect(requireAuthenticatedPlatformUser({ platformUserId: "platform_1", role: "SUPPORT_ADMIN" }))
      .toEqual({
        platformUserId: "platform_1",
        role: "SUPPORT_ADMIN",
      });
  });

  it("checks store roles by minimum privilege", () => {
    expect(() => assertStoreRole(tenantContext, "ADMIN")).not.toThrow();
    expect(() => assertStoreRole({ ...tenantContext, role: "STAFF" }, "MANAGER")).toThrow(
      "Store role is not allowed.",
    );
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("secret-password", "pepper");
    expect(hash).not.toContain("secret-password");
    await expect(verifyPassword("secret-password", hash, "pepper")).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash, "pepper")).resolves.toBe(false);
  });
});
