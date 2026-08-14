import { describe, it, expect } from "vitest";
import type { StoreRole, StorePermission } from "../src/index.js";
import {
  authorizeStoreRequest,
  resolveStorePermission,
  isSensitiveStorePermission,
  SENSITIVE_STORE_PERMISSIONS,
} from "../src/store-authorization.js";
import { hasStorePermission } from "../src/permissions.js";

const owner = { storeId: "store_1", role: "OWNER" as StoreRole };
const viewer = { storeId: "store_1", role: "VIEWER" as StoreRole };

describe("hasStorePermission (fail-closed)", () => {
  it("unknown role → false (does not throw)", () => {
    expect(hasStorePermission("SUPER_ADMIN" as unknown as StoreRole, "catalog:read")).toBe(false);
  });
  it("unknown permission → false", () => {
    expect(hasStorePermission("OWNER", "nope:manage" as unknown as StorePermission)).toBe(false);
  });
});

describe("authorizeStoreRequest — composition (auth → store → capability → permission)", () => {
  it("null principal → UNAUTHENTICATED", () => {
    expect(authorizeStoreRequest({ principal: null })).toEqual({ allowed: false, reason: "UNAUTHENTICATED" });
  });

  it("authenticated, no further requirement → allowed", () => {
    expect(authorizeStoreRequest({ principal: owner })).toEqual({ allowed: true });
  });

  it("path storeId mismatch → STORE_MISMATCH (before capability/permission)", () => {
    const d = authorizeStoreRequest({
      principal: owner,
      pathStoreId: "store_OTHER",
      capabilityEnabled: false,
      requiredPermission: "catalog:read",
    });
    expect(d).toEqual({ allowed: false, reason: "STORE_MISMATCH" });
  });

  it("path storeId match → passes store gate", () => {
    expect(authorizeStoreRequest({ principal: owner, pathStoreId: "store_1" })).toEqual({ allowed: true });
  });

  it("capability disabled → CAPABILITY_DISABLED (even if permission would pass)", () => {
    const d = authorizeStoreRequest({
      principal: owner,
      capabilityEnabled: false,
      requiredPermission: "catalog:read", // OWNER has it
    });
    expect(d).toEqual({ allowed: false, reason: "CAPABILITY_DISABLED" });
  });

  it("capability enabled + permission granted → allowed (both required)", () => {
    expect(
      authorizeStoreRequest({ principal: owner, capabilityEnabled: true, requiredPermission: "refunds:manage" }),
    ).toEqual({ allowed: true });
  });

  it("capability enabled + permission denied → PERMISSION_DENIED", () => {
    expect(
      authorizeStoreRequest({ principal: viewer, capabilityEnabled: true, requiredPermission: "catalog:write" }),
    ).toEqual({ allowed: false, reason: "PERMISSION_DENIED" });
  });

  it("capabilityEnabled undefined = no capability gate", () => {
    expect(authorizeStoreRequest({ principal: owner, requiredPermission: "catalog:read" })).toEqual({ allowed: true });
  });

  it("unknown/invalid role fails closed on permission", () => {
    const d = authorizeStoreRequest({
      principal: { storeId: "store_1", role: "GOD" as unknown as StoreRole },
      requiredPermission: "catalog:read",
    });
    expect(d).toEqual({ allowed: false, reason: "PERMISSION_DENIED" });
  });
});

describe("role matrix through authorizeStoreRequest", () => {
  const check = (role: StoreRole, permission: StorePermission) =>
    authorizeStoreRequest({ principal: { storeId: "s", role }, requiredPermission: permission }).allowed;

  it("OWNER: settings:manage allow", () => expect(check("OWNER", "settings:manage")).toBe(true));
  it("ADMIN: settings:manage DENY (read-only settings)", () => expect(check("ADMIN", "settings:manage")).toBe(false));
  it("ADMIN: refunds:manage allow", () => expect(check("ADMIN", "refunds:manage")).toBe(true));
  it("MANAGER: refunds:manage DENY", () => expect(check("MANAGER", "refunds:manage")).toBe(false));
  it("MANAGER: refunds:write allow", () => expect(check("MANAGER", "refunds:write")).toBe(true));
  it("STAFF: catalog:write DENY", () => expect(check("STAFF", "catalog:write")).toBe(false));
  it("STAFF: orders:write allow", () => expect(check("STAFF", "orders:write")).toBe(true));
  it("VIEWER: orders:read allow", () => expect(check("VIEWER", "orders:read")).toBe(true));
  it("VIEWER: orders:write DENY (read-only)", () => expect(check("VIEWER", "orders:write")).toBe(false));
  it("VIEWER: shopping-balance:manage DENY", () => expect(check("VIEWER", "shopping-balance:manage")).toBe(false));
});

describe("resolveStorePermission (policy module + action → permission)", () => {
  it("catalog read/write/manage", () => {
    expect(resolveStorePermission("catalog", "read")).toBe("catalog:read");
    expect(resolveStorePermission("catalog", "write")).toBe("catalog:write");
    expect(resolveStorePermission("catalog", "manage")).toBe("catalog:write"); // no catalog:manage tier
  });
  it("refunds has a manage tier", () => {
    expect(resolveStorePermission("refunds", "read")).toBe("refunds:read");
    expect(resolveStorePermission("refunds", "write")).toBe("refunds:write");
    expect(resolveStorePermission("refunds", "manage")).toBe("refunds:manage");
  });
  it("shopping-balance has a manage tier", () => {
    expect(resolveStorePermission("shopping-balance", "manage")).toBe("shopping-balance:manage");
  });
  it("settings: write folds to manage (no settings:write)", () => {
    expect(resolveStorePermission("settings", "read")).toBe("settings:read");
    expect(resolveStorePermission("settings", "write")).toBe("settings:manage");
    expect(resolveStorePermission("settings", "manage")).toBe("settings:manage");
  });
  it("returns is aliased to orders (no dedicated returns permission)", () => {
    expect(resolveStorePermission("returns", "read")).toBe("orders:read");
    expect(resolveStorePermission("returns", "write")).toBe("orders:write");
    expect(resolveStorePermission("returns", "manage")).toBe("orders:write");
  });
  it("customers / orders / product-support / platform-requests read+write", () => {
    expect(resolveStorePermission("orders", "write")).toBe("orders:write");
    expect(resolveStorePermission("customers", "write")).toBe("customers:write");
    expect(resolveStorePermission("product-support", "write")).toBe("product-support:write");
    expect(resolveStorePermission("platform-requests", "write")).toBe("platform-requests:write");
  });
  it("unknown module or action → null (fail-closed; caller must deny)", () => {
    expect(resolveStorePermission("nope" as never, "read")).toBeNull();
    expect(resolveStorePermission("catalog", "destroy" as never)).toBeNull();
  });
});

describe("sensitive store operations foundation", () => {
  it("classifies the store-local sensitive manage permissions", () => {
    expect(isSensitiveStorePermission("refunds:manage")).toBe(true);
    expect(isSensitiveStorePermission("shopping-balance:manage")).toBe(true);
    expect(isSensitiveStorePermission("settings:manage")).toBe(true);
  });
  it("non-sensitive permissions are not flagged", () => {
    expect(isSensitiveStorePermission("catalog:write")).toBe(false);
    expect(isSensitiveStorePermission("orders:write")).toBe(false);
    expect(isSensitiveStorePermission("refunds:write")).toBe(false);
  });
  it("the sensitive set is exactly the three store-local manage ops", () => {
    expect([...SENSITIVE_STORE_PERMISSIONS].sort()).toEqual(
      ["refunds:manage", "settings:manage", "shopping-balance:manage"].sort(),
    );
  });
});
