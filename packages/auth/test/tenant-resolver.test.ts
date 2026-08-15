import { describe, it, expect } from "vitest";
import { resolveStoreAdminTenantContext } from "../src/tenant-resolver";

describe("store-admin tenant resolver", () => {
  it("resolves a configured slug (server-side)", () => {
    expect(resolveStoreAdminTenantContext({ configuredStoreSlug: "acme" })).toEqual({ storeSlug: "acme" });
  });
  it("trims surrounding whitespace", () => {
    expect(resolveStoreAdminTenantContext({ configuredStoreSlug: "  acme  " })).toEqual({ storeSlug: "acme" });
  });
  it("fails closed on empty / whitespace / missing", () => {
    expect(resolveStoreAdminTenantContext({ configuredStoreSlug: "" })).toBeNull();
    expect(resolveStoreAdminTenantContext({ configuredStoreSlug: "   " })).toBeNull();
    expect(resolveStoreAdminTenantContext({})).toBeNull();
  });
  it("ignores host in Phase 1 (no subdomain resolution yet)", () => {
    expect(resolveStoreAdminTenantContext({ host: "acme.admin.example.com" })).toBeNull();
    expect(resolveStoreAdminTenantContext({ configuredStoreSlug: "acme", host: "other.example.com" })).toEqual({ storeSlug: "acme" });
  });
});
