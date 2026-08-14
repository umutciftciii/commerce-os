/**
 * Faz D — OWNER provisioning SAF planlayıcı + manifest parser birim testleri (DB'siz).
 * Spec §8 kapsamı: fail-closed unmapped/unknown/duplicate, converge, hash reuse, INVITED,
 * secret reddi, SUSPENDED/CLOSED skip, same-email-different-stores, unrelated PlatformUser.
 */
import { describe, it, expect } from "vitest";
import {
  parseOwnerManifest,
  planStoreOwnerProvisioning,
  type ProvisioningInput,
  type ProvisioningStore,
  type ProvisioningStoreUser,
} from "../src/store-auth/provisioning.js";

const store = (
  id: string,
  slug: string,
  status: ProvisioningStore["status"] = "ACTIVE",
  systemPurpose: string | null = null,
): ProvisioningStore => ({ id, slug, status, systemPurpose });

function plan(over: Partial<ProvisioningInput>) {
  return planStoreOwnerProvisioning({
    manifest: over.manifest ?? [],
    stores: over.stores ?? [],
    existingStoreUsers: over.existingStoreUsers ?? [],
    platformUsers: over.platformUsers ?? [],
    excludeStoreSlugs: over.excludeStoreSlugs ?? [],
  });
}

describe("parseOwnerManifest", () => {
  it("parses valid entries (slug or id + ownerEmail) + optional systemStores", () => {
    const m = parseOwnerManifest({
      systemStores: ["__theme-library__"],
      stores: [
        { storeSlug: "acme", ownerEmail: "a@e.com" },
        { storeId: "store_1", ownerEmail: "b@e.com" },
      ],
    });
    expect(m.entries).toEqual([
      { storeSlug: "acme", storeId: undefined, ownerEmail: "a@e.com" },
      { storeSlug: undefined, storeId: "store_1", ownerEmail: "b@e.com" },
    ]);
    expect(m.systemStores).toEqual(["__theme-library__"]);
  });

  it("systemStores defaults to [] and validates slug shape", () => {
    expect(parseOwnerManifest({ stores: [{ storeSlug: "a", ownerEmail: "x@e.com" }] }).systemStores).toEqual([]);
    expect(() => parseOwnerManifest({ systemStores: "nope", stores: [] })).toThrow(/systemStores/);
    expect(() => parseOwnerManifest({ systemStores: [""], stores: [] })).toThrow(/systemStores/);
  });

  it("REJECTS secret/password fields (no plaintext secret in manifest)", () => {
    expect(() => parseOwnerManifest({ stores: [{ storeSlug: "a", ownerEmail: "x@e.com", password: "hunter2" }] })).toThrow(
      /yasak alan/i,
    );
    expect(() =>
      parseOwnerManifest({ stores: [{ storeSlug: "a", ownerEmail: "x@e.com", passwordHash: "abc" }] }),
    ).toThrow(/yasak alan/i);
  });

  it("requires exactly one of storeSlug/storeId and an ownerEmail", () => {
    expect(() => parseOwnerManifest({ stores: [{ ownerEmail: "x@e.com" }] })).toThrow(/TAM biri/);
    expect(() => parseOwnerManifest({ stores: [{ storeSlug: "a", storeId: "b", ownerEmail: "x@e.com" }] })).toThrow(
      /TAM biri/,
    );
    expect(() => parseOwnerManifest({ stores: [{ storeSlug: "a" }] })).toThrow(/ownerEmail zorunlu/);
  });

  it("rejects non-object / missing stores", () => {
    expect(() => parseOwnerManifest([])).toThrow();
    expect(() => parseOwnerManifest({})).toThrow(/stores/);
  });
});

describe("planStoreOwnerProvisioning — fail-closed conditions", () => {
  it("unmapped ACTIVE store → applicable=false", () => {
    const r = plan({
      stores: [store("s1", "acme"), store("s2", "other")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      platformUsers: [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }],
    });
    expect(r.unmappedActiveStores.map((s) => s.slug)).toEqual(["other"]);
    expect(r.applicable).toBe(false);
  });

  it("unknown mapped store → conflict UNKNOWN_STORE + applicable=false", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "ghost", ownerEmail: "a@e.com" }],
    });
    expect(r.conflicts[0]?.reason).toBe("UNKNOWN_STORE");
    expect(r.applicable).toBe(false);
  });

  it("duplicate mapping (same store twice) → conflict DUPLICATE_MAPPING", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [
        { storeSlug: "acme", ownerEmail: "a@e.com" },
        { storeId: "s1", ownerEmail: "b@e.com" },
      ],
      platformUsers: [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }],
    });
    expect(r.conflicts.some((c) => c.reason === "DUPLICATE_MAPPING")).toBe(true);
    expect(r.applicable).toBe(false);
  });

  it("fully mapped, no conflicts → applicable=true", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      platformUsers: [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }],
    });
    expect(r.applicable).toBe(true);
  });
});

describe("planStoreOwnerProvisioning — EXPLICIT system-store allowlist", () => {
  const owner = [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }];

  it("empty allowlist: system store is NOT auto-excluded (prod fail-closed unchanged)", () => {
    const r = plan({
      stores: [store("s1", "acme"), store("sys", "__theme-library__", "ACTIVE", "THEME_LIBRARY")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      platformUsers: owner,
    });
    // Sistem mağaza generic olarak dışlanmaz → unmapped ACTIVE → applicable false.
    expect(r.unmappedActiveStores.map((s) => s.slug)).toEqual(["__theme-library__"]);
    expect(r.applicable).toBe(false);
  });

  it("explicit allowlist excludes a genuine system store → applicable=true", () => {
    const r = plan({
      stores: [store("s1", "acme"), store("sys", "__theme-library__", "ACTIVE", "THEME_LIBRARY")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      platformUsers: owner,
      excludeStoreSlugs: ["__theme-library__"],
    });
    expect(r.unmappedActiveStores).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.applicable).toBe(true);
  });

  it("cannot exclude a NON-system store (real tenant) → conflict SYSTEM_EXCLUDE_NOT_SYSTEM", () => {
    const r = plan({
      stores: [store("s1", "acme"), store("s2", "real-tenant")], // systemPurpose null
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      platformUsers: owner,
      excludeStoreSlugs: ["real-tenant"],
    });
    expect(r.conflicts.some((c) => c.reason === "SYSTEM_EXCLUDE_NOT_SYSTEM")).toBe(true);
    expect(r.applicable).toBe(false);
  });

  it("cannot exclude a slug that is also mapped → conflict SYSTEM_EXCLUDE_ALSO_MAPPED", () => {
    const r = plan({
      stores: [store("sys", "__theme-library__", "ACTIVE", "THEME_LIBRARY")],
      manifest: [{ storeSlug: "__theme-library__", ownerEmail: "a@e.com" }],
      platformUsers: owner,
      excludeStoreSlugs: ["__theme-library__"],
    });
    expect(r.conflicts.some((c) => c.reason === "SYSTEM_EXCLUDE_ALSO_MAPPED")).toBe(true);
    expect(r.applicable).toBe(false);
  });

  it("non-existent excluded slug → no-op (cannot hide any ACTIVE store)", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      platformUsers: owner,
      excludeStoreSlugs: ["ghost-does-not-exist"],
    });
    expect(r.conflicts).toEqual([]);
    expect(r.applicable).toBe(true);
  });
});

describe("planStoreOwnerProvisioning — decisions", () => {
  it("CREATE with matching PlatformUser hash → login-ready + linked", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "Owner@Example.com" }],
      platformUsers: [{ id: "p1", email: "owner@example.com", name: "Owner", hasPasswordHash: true }],
    });
    const d = r.decisions[0]!;
    expect(d.outcome).toBe("CREATE_LOGIN_READY");
    expect(d.credential).toBe("PLATFORM_HASH_REUSE");
    expect(d.linkedPlatformUserId).toBe("p1");
    expect(d.loginReady).toBe(true);
    expect(d.targetStatus).toBe("ACTIVE");
    expect(r.summary.loginReadyOwners).toBe(1);
  });

  it("CREATE with NO matching hash → INVITED (non-login-ready), never linked, no random/default password", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "new@e.com" }],
      platformUsers: [],
    });
    const d = r.decisions[0]!;
    expect(d.outcome).toBe("CREATE_INVITED");
    expect(d.credential).toBe("NONE_INVITED");
    expect(d.linkedPlatformUserId).toBeNull();
    expect(d.loginReady).toBe(false);
    expect(d.targetStatus).toBe("INVITED");
  });

  it("unrelated PlatformUser (different email) is NEVER linked", () => {
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "owner@e.com" }],
      platformUsers: [{ id: "p9", email: "someone-else@e.com", name: "X", hasPasswordHash: true }],
    });
    const d = r.decisions[0]!;
    expect(d.linkedPlatformUserId).toBeNull();
    expect(d.outcome).toBe("CREATE_INVITED");
  });

  it("existing OWNER ACTIVE with hash → NOOP_LOGIN_READY (idempotent)", () => {
    const existing: ProvisioningStoreUser = {
      id: "su1",
      storeId: "s1",
      email: "a@e.com",
      role: "OWNER",
      status: "ACTIVE",
      hasPasswordHash: true,
      linkedPlatformUserId: null,
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [existing],
    });
    expect(r.decisions[0]!.outcome).toBe("NOOP_LOGIN_READY");
    expect(r.decisions[0]!.loginReady).toBe(true);
  });

  it("existing non-OWNER with hash → CONVERGE_LOGIN_READY, role OWNER", () => {
    const existing: ProvisioningStoreUser = {
      id: "su1",
      storeId: "s1",
      email: "a@e.com",
      role: "MANAGER",
      status: "ACTIVE",
      hasPasswordHash: true,
      linkedPlatformUserId: null,
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [existing],
    });
    const d = r.decisions[0]!;
    expect(d.outcome).toBe("CONVERGE_LOGIN_READY");
    expect(d.targetRole).toBe("OWNER");
    expect(d.existingStoreUserId).toBe("su1");
  });

  it("existing INVITED without hash + matching platform → CONVERGE_LOGIN_READY (reuse + link)", () => {
    const existing: ProvisioningStoreUser = {
      id: "su1",
      storeId: "s1",
      email: "a@e.com",
      role: "OWNER",
      status: "INVITED",
      hasPasswordHash: false,
      linkedPlatformUserId: null,
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [existing],
      platformUsers: [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }],
    });
    const d = r.decisions[0]!;
    expect(d.outcome).toBe("CONVERGE_LOGIN_READY");
    expect(d.credential).toBe("PLATFORM_HASH_REUSE");
    expect(d.linkedPlatformUserId).toBe("p1");
    expect(d.targetStatus).toBe("ACTIVE");
  });

  it("existing INVITED without hash + NO platform → CONVERGE_INVITED (stays non-login-ready)", () => {
    const existing: ProvisioningStoreUser = {
      id: "su1",
      storeId: "s1",
      email: "a@e.com",
      role: "OWNER",
      status: "INVITED",
      hasPasswordHash: false,
      linkedPlatformUserId: null,
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [existing],
    });
    expect(r.decisions[0]!.outcome).toBe("CONVERGE_INVITED");
    expect(r.decisions[0]!.loginReady).toBe(false);
  });

  it("seed null-email OWNER linked to owner platform-user → CONVERGE (email set), not CREATE collision", () => {
    // Mağazada bu platform-user'a ZATEN linked ama email=null bir OWNER var (seed). Email ile
    // bulunamaz; link ile bulunur → CONVERGE (email set edilir) → login-ready; unique link ihlali yok.
    const existing: ProvisioningStoreUser = {
      id: "seedrow",
      storeId: "s1",
      email: null,
      role: "OWNER",
      status: "ACTIVE",
      hasPasswordHash: true,
      linkedPlatformUserId: "p1",
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [existing],
      platformUsers: [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }],
    });
    const d = r.decisions[0]!;
    expect(d.outcome).toBe("CONVERGE_LOGIN_READY");
    expect(d.existingStoreUserId).toBe("seedrow"); // link-satırı converge; yeni satır YOK
    expect(d.targetStatus).toBe("ACTIVE");
    expect(d.loginReady).toBe(true);
  });

  it("email-row and link-row are DIFFERENT rows → conflict LINK_EMAIL_SPLIT", () => {
    const emailRow: ProvisioningStoreUser = {
      id: "byEmail",
      storeId: "s1",
      email: "a@e.com",
      role: "MANAGER",
      status: "ACTIVE",
      hasPasswordHash: true,
      linkedPlatformUserId: null,
    };
    const linkRow: ProvisioningStoreUser = {
      id: "byLink",
      storeId: "s1",
      email: null,
      role: "OWNER",
      status: "ACTIVE",
      hasPasswordHash: true,
      linkedPlatformUserId: "p1",
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [emailRow, linkRow],
      platformUsers: [{ id: "p1", email: "a@e.com", name: "A", hasPasswordHash: true }],
    });
    expect(r.conflicts.some((c) => c.reason === "LINK_EMAIL_SPLIT")).toBe(true);
    expect(r.applicable).toBe(false);
  });

  it("existing DISABLED → conflict EXISTING_DISABLED (no silent re-enable)", () => {
    const existing: ProvisioningStoreUser = {
      id: "su1",
      storeId: "s1",
      email: "a@e.com",
      role: "OWNER",
      status: "DISABLED",
      hasPasswordHash: true,
      linkedPlatformUserId: null,
    };
    const r = plan({
      stores: [store("s1", "acme")],
      manifest: [{ storeSlug: "acme", ownerEmail: "a@e.com" }],
      existingStoreUsers: [existing],
    });
    expect(r.conflicts[0]?.reason).toBe("EXISTING_DISABLED");
    expect(r.applicable).toBe(false);
  });

  it("SUSPENDED/CLOSED mapped store → SKIP_STORE_NOT_ACTIVE (not unmapped; policy)", () => {
    const r = plan({
      stores: [store("s1", "acme", "SUSPENDED"), store("s2", "shut", "CLOSED")],
      manifest: [
        { storeSlug: "acme", ownerEmail: "a@e.com" },
        { storeSlug: "shut", ownerEmail: "b@e.com" },
      ],
    });
    expect(r.decisions.every((d) => d.outcome === "SKIP_STORE_NOT_ACTIVE")).toBe(true);
    expect(r.summary.skippedNotActive).toBe(2);
    // Not-active mağazalar ACTIVE değil → unmapped-ACTIVE listesine girmez → applicable true.
    expect(r.unmappedActiveStores).toEqual([]);
    expect(r.applicable).toBe(true);
  });

  it("same email, different stores → independent decisions (no conflict)", () => {
    const r = plan({
      stores: [store("s1", "acme"), store("s2", "beta")],
      manifest: [
        { storeSlug: "acme", ownerEmail: "shared@e.com" },
        { storeSlug: "beta", ownerEmail: "shared@e.com" },
      ],
      platformUsers: [{ id: "p1", email: "shared@e.com", name: "S", hasPasswordHash: true }],
    });
    expect(r.conflicts).toEqual([]);
    expect(r.decisions).toHaveLength(2);
    expect(r.decisions.every((d) => d.outcome === "CREATE_LOGIN_READY")).toBe(true);
    expect(r.decisions.every((d) => d.linkedPlatformUserId === "p1")).toBe(true);
    expect(r.applicable).toBe(true);
  });
});
