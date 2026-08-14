import { describe, it, expect } from "vitest";
import { hasStorePermission, ROLE_PERMISSIONS } from "../src/permissions";

describe("store permissions", () => {
  it("OWNER can manage store users; VIEWER cannot", () => {
    expect(hasStorePermission("OWNER", "store-users:manage")).toBe(true);
    expect(hasStorePermission("VIEWER", "store-users:manage")).toBe(false);
  });
  it("only OWNER/ADMIN get refunds:manage (fast refund)", () => {
    expect(hasStorePermission("OWNER", "refunds:manage")).toBe(true);
    expect(hasStorePermission("ADMIN", "refunds:manage")).toBe(true);
    expect(hasStorePermission("MANAGER", "refunds:manage")).toBe(false);
  });
  it("settings:manage is OWNER-only", () => {
    expect(hasStorePermission("OWNER", "settings:manage")).toBe(true);
    expect(hasStorePermission("ADMIN", "settings:manage")).toBe(false);
  });
  it("STAFF can write orders and support but not catalog", () => {
    expect(hasStorePermission("STAFF", "orders:write")).toBe(true);
    expect(hasStorePermission("STAFF", "product-support:write")).toBe(true);
    expect(hasStorePermission("STAFF", "catalog:write")).toBe(false);
  });
  it("shopping-balance:manage is OWNER/ADMIN only", () => {
    expect(hasStorePermission("ADMIN", "shopping-balance:manage")).toBe(true);
    expect(hasStorePermission("MANAGER", "shopping-balance:manage")).toBe(false);
  });
  it("VIEWER is read-only across modules", () => {
    expect(hasStorePermission("VIEWER", "orders:read")).toBe(true);
    expect(hasStorePermission("VIEWER", "orders:write")).toBe(false);
    expect(hasStorePermission("VIEWER", "catalog:write")).toBe(false);
  });
  it("returns:manage for OWNER/ADMIN/MANAGER, read-only for STAFF/VIEWER; independent of refunds", () => {
    for (const r of ["OWNER", "ADMIN", "MANAGER"] as const) {
      expect(hasStorePermission(r, "returns:manage")).toBe(true);
    }
    expect(hasStorePermission("STAFF", "returns:manage")).toBe(false);
    expect(hasStorePermission("STAFF", "returns:read")).toBe(true);
    expect(hasStorePermission("VIEWER", "returns:manage")).toBe(false);
    // returns:manage ≠ refunds:manage (finansal ayrım)
    expect(hasStorePermission("MANAGER", "returns:manage")).toBe(true);
    expect(hasStorePermission("MANAGER", "refunds:manage")).toBe(false);
  });
  it("every role has a Set entry", () => {
    for (const r of ["OWNER", "ADMIN", "MANAGER", "STAFF", "VIEWER"] as const) {
      expect(ROLE_PERMISSIONS[r]).toBeInstanceOf(Set);
    }
  });
});
