import { describe, it, expect } from "vitest";
import {
  storeAdminLoginRequestSchema,
  storeAdminCurrentUserSchema,
  storeAdminLoginResponseSchema,
  storeAdminSessionResponseSchema,
} from "../src/index";

describe("store-admin auth contracts", () => {
  it("parses a valid login request; rememberMe defaults to false", () => {
    const r = storeAdminLoginRequestSchema.parse({ email: "a@e.test", password: "x" });
    expect(r.rememberMe).toBe(false);
  });
  it("rejects a login request that carries a storeSlug/storeId (tenant is server-side only)", () => {
    // extra keys are stripped, not an error — assert they do NOT survive into the parsed object
    const r = storeAdminLoginRequestSchema.parse({ email: "a@e.test", password: "x", storeSlug: "acme", storeId: "s1" } as never);
    expect((r as Record<string, unknown>).storeSlug).toBeUndefined();
    expect((r as Record<string, unknown>).storeId).toBeUndefined();
  });
  it("currentUser rejects platform roles and accepts store roles", () => {
    expect(() => storeAdminCurrentUserSchema.parse({ id: "u", storeId: "s", email: "a@e.test", name: null, role: "SUPER_ADMIN" })).toThrow();
    expect(storeAdminCurrentUserSchema.parse({ id: "u", storeId: "s", email: "a@e.test", name: null, role: "OWNER" }).role).toBe("OWNER");
  });
  it("currentUser is a safe DTO — hash/internal fields are stripped, never surfaced", () => {
    const u = storeAdminCurrentUserSchema.parse({
      id: "u", storeId: "s", email: "a@e.test", name: "N", role: "STAFF",
      passwordHash: "H", tokenHash: "T", linkedPlatformUserId: "p", sessionId: "sid",
    } as never);
    for (const k of ["passwordHash", "tokenHash", "linkedPlatformUserId", "sessionId"]) {
      expect((u as Record<string, unknown>)[k]).toBeUndefined();
    }
  });
  it("session response carries timing + session-derived store context (Faz E1)", () => {
    const parsed = storeAdminSessionResponseSchema.parse({
      user: { id: "u", storeId: "s", email: "a@e.test", name: null, role: "VIEWER" },
      store: { id: "s", slug: "acme", name: "Acme", status: "ACTIVE" },
      session: { timing: {
        idleExpiresAt: new Date().toISOString(),
        absoluteExpiresAt: new Date().toISOString(),
        warningLeadSeconds: 300,
        rememberMe: false,
        lastActivityAt: new Date().toISOString(),
      } },
    });
    expect(parsed.session.timing.warningLeadSeconds).toBe(300);
    expect(parsed.store).toEqual({ id: "s", slug: "acme", name: "Acme", status: "ACTIVE" });
  });
  it("session response REQUIRES store (context is session-derived, not optional)", () => {
    expect(() =>
      storeAdminSessionResponseSchema.parse({
        user: { id: "u", storeId: "s", email: "a@e.test", name: null, role: "VIEWER" },
        session: { timing: {
          idleExpiresAt: new Date().toISOString(),
          absoluteExpiresAt: new Date().toISOString(),
          warningLeadSeconds: 300,
          rememberMe: false,
          lastActivityAt: new Date().toISOString(),
        } },
      } as never),
    ).toThrow();
  });
  it("login response shape", () => {
    const parsed = storeAdminLoginResponseSchema.parse({
      token: "tok", expiresAt: new Date().toISOString(),
      user: { id: "u", storeId: "s", email: "a@e.test", name: null, role: "ADMIN" },
    });
    expect(parsed.token).toBe("tok");
  });
});
