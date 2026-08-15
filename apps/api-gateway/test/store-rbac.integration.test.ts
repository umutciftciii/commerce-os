/**
 * Faz E2B — Store Admin RBAC + auth invariants (route-level, full `createServer`).
 *
 * Store Admin business route'ları artık YALNIZ StoreUserSession ile doğrulanır (Faz E2 cutover).
 * Bu suite gerçek route-level kanıt sağlar: rol matrisi (OWNER/ADMIN/MANAGER/STAFF/VIEWER),
 * güvenlik invariant'ları (no-token/PlatformUser-deny/cross-store/DISABLED/SUSPENDED-store/
 * revoked/permission-deny/leak-yok) ve AuditLog STORE_USER actor doğruluğu. Fake `storeAuthData`
 * enjekte edilir (bkz. helpers/store-auth-fixture); DB gerekmez. PlatformUser token'ı GEÇERLİ bir
 * PlatformSession olsa bile Store Admin route'unda 401 alır (dual-auth/fallback YOK).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { type AppConfig, type AppDataAccess, createServer } from "../src/server.js";
import {
  TEST_SESSION_SECRET,
  bearer,
  createStoreAuthDataFake,
  type StoreAuthSpec,
} from "./helpers/store-auth-fixture.js";

const config = {
  APP_ENV: "test",
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: TEST_SESSION_SECRET,
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 50,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
  MEDIA_PUBLIC_BASE_URL: "http://media.test",
} as unknown as AppConfig;

const STORE_ID = "store_1";
const store = {
  id: STORE_ID,
  name: "Test Store",
  slug: "test-store",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

// Rol başına deterministik token (ACTIVE store + ACTIVE StoreUser).
const ROLE_TOKENS = {
  OWNER: "owner-tok",
  ADMIN: "admin-tok",
  MANAGER: "manager-tok",
  STAFF: "staff-tok",
  VIEWER: "viewer-tok",
} as const;

const AUTH_SPECS: StoreAuthSpec[] = [
  { token: ROLE_TOKENS.OWNER, storeId: STORE_ID, role: "OWNER" },
  { token: ROLE_TOKENS.ADMIN, storeId: STORE_ID, role: "ADMIN" },
  { token: ROLE_TOKENS.MANAGER, storeId: STORE_ID, role: "MANAGER" },
  { token: ROLE_TOKENS.STAFF, storeId: STORE_ID, role: "STAFF" },
  { token: ROLE_TOKENS.VIEWER, storeId: STORE_ID, role: "VIEWER" },
  { token: "disabled-tok", storeId: STORE_ID, role: "OWNER", storeUserStatus: "DISABLED" },
  { token: "suspended-store-tok", storeId: STORE_ID, role: "OWNER", storeStatus: "SUSPENDED" },
  { token: "revoked-tok", storeId: STORE_ID, role: "OWNER", revoked: true },
  { token: "expired-tok", storeId: STORE_ID, role: "OWNER", expired: true },
  // Başka mağazanın OWNER'ı: /stores/store_1/... path'ine gelirse session.storeId=store_2 ≠ store_1.
  { token: "other-store-tok", storeId: "store_2", role: "OWNER" },
];

let auditSpy: ReturnType<typeof vi.fn>;

function build() {
  auditSpy = vi.fn(async () => {});
  const dataAccess = {
    findStoreById: async (id: string) => (id === STORE_ID ? store : null),
    // Geçerli bir PLATFORM oturumu — Store Admin guard'ı BUNU KULLANMAZ (yalnız storeAuthData).
    findPlatformSessionByTokenHash: async () => ({
      id: "psess_1",
      expiresAt: new Date(Date.now() + 3_600_000),
      lastActivityAt: new Date(),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
      rememberMe: false,
      revokedAt: null,
      platformUser: { id: "pu_1", email: "a@b.co", name: "PA", passwordHash: "x", role: "SUPER_ADMIN" },
    }),
    listProductsAdmin: async () => ({ data: [], total: 0 }),
    getStoreSettings: async () => null,
    upsertStoreSettings: async () => null,
    createAuditLog: auditSpy,
  } as unknown as AppDataAccess;
  return createServer(config, { dataAccess, storeAuthData: createStoreAuthDataFake(AUTH_SPECS) });
}

let app: ReturnType<typeof build>;
beforeEach(() => {
  app = build();
});

const PRODUCTS = `/stores/${STORE_ID}/products`;
const SETTINGS = `/stores/${STORE_ID}/settings`;
const FINANCE = `/stores/${STORE_ID}/finance/summary`;
const CREDIT_ADJUST = `/stores/${STORE_ID}/customers/cust_1/credit/adjust`;

async function get(url: string, token?: string) {
  return app.inject({ method: "GET", url, ...(token ? { headers: bearer(token) } : {}) });
}
async function send(method: "POST" | "PATCH", url: string, token: string, body: unknown = {}) {
  return app.inject({ method, url, headers: bearer(token), payload: body });
}

describe("E2B — role matrix (representative routes per family)", () => {
  it("catalog:read (GET products) — ALL roles allowed", async () => {
    for (const role of Object.values(ROLE_TOKENS)) {
      const res = await get(PRODUCTS, role);
      expect(res.statusCode, `role ${role}`).toBe(200);
    }
  });

  it("catalog:write (POST products) — STAFF/VIEWER DENY (403)", async () => {
    for (const token of [ROLE_TOKENS.STAFF, ROLE_TOKENS.VIEWER]) {
      const res = await send("POST", PRODUCTS, token, { title: "X", slug: "x" });
      expect(res.statusCode, token).toBe(403);
      expect(res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Insufficient permissions." } });
    }
  });

  it("settings:manage (PATCH settings) — only OWNER; ADMIN/MANAGER/STAFF/VIEWER DENY", async () => {
    for (const token of [ROLE_TOKENS.ADMIN, ROLE_TOKENS.MANAGER, ROLE_TOKENS.STAFF, ROLE_TOKENS.VIEWER]) {
      const res = await send("PATCH", SETTINGS, token, {});
      expect(res.statusCode, token).toBe(403);
    }
    const owner = await send("PATCH", SETTINGS, ROLE_TOKENS.OWNER, { returnsRequireApproval: true });
    expect(owner.statusCode).toBe(200);
  });

  it("finance:read (GET finance) — STAFF/VIEWER DENY (403, revenue-sensitive)", async () => {
    for (const token of [ROLE_TOKENS.STAFF, ROLE_TOKENS.VIEWER]) {
      const res = await get(FINANCE, token);
      expect(res.statusCode, token).toBe(403);
    }
  });

  it("shopping-balance:write (POST credit/adjust) — MANAGER/STAFF/VIEWER DENY", async () => {
    for (const token of [ROLE_TOKENS.MANAGER, ROLE_TOKENS.STAFF, ROLE_TOKENS.VIEWER]) {
      const res = await send("POST", CREDIT_ADJUST, token, {});
      expect(res.statusCode, token).toBe(403);
    }
  });
});

describe("E2B — security invariants (on a store business route)", () => {
  it("no token → 401", async () => {
    expect((await get(PRODUCTS)).statusCode).toBe(401);
  });
  it("PlatformUser token (valid PlatformSession, NOT a store session) → 401 on store route", async () => {
    // 'platform-token' storeAuthData'da YOK; findPlatformSessionByTokenHash geçerli döner ama
    // Store Admin guard onu KULLANMAZ → 401 (silent dual-auth/fallback yok).
    expect((await get(PRODUCTS, "platform-token")).statusCode).toBe(401);
  });
  it("cross-store path (session.storeId ≠ path storeId) → 404 STORE_ACCESS_DENIED", async () => {
    const res = await get(PRODUCTS, "other-store-tok");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "STORE_ACCESS_DENIED", message: "Store access denied." } });
  });
  it("DISABLED StoreUser → 401", async () => {
    expect((await get(PRODUCTS, "disabled-tok")).statusCode).toBe(401);
  });
  it("SUSPENDED store → deny (401)", async () => {
    expect((await get(PRODUCTS, "suspended-store-tok")).statusCode).toBe(401);
  });
  it("revoked session → 401", async () => {
    expect((await get(PRODUCTS, "revoked-tok")).statusCode).toBe(401);
  });
  it("expired session → 401", async () => {
    expect((await get(PRODUCTS, "expired-tok")).statusCode).toBe(401);
  });
  it("permission-deny 403 body does NOT leak role or required permission", async () => {
    const res = await send("PATCH", SETTINGS, ROLE_TOKENS.VIEWER, {});
    expect(res.statusCode).toBe(403);
    const raw = JSON.stringify(res.json());
    expect(raw).not.toContain("settings:manage");
    expect(raw).not.toContain("VIEWER");
    expect(raw).not.toContain("OWNER");
  });
});

describe("E2B — AuditLog STORE_USER actor correctness", () => {
  it("OWNER settings mutation writes AuditLog with STORE_USER actor and NO platformUserId", async () => {
    const res = await send("PATCH", SETTINGS, ROLE_TOKENS.OWNER, { returnsRequireApproval: true });
    expect(res.statusCode).toBe(200);
    expect(auditSpy).toHaveBeenCalled();
    const input = auditSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(input.actorKind).toBe("STORE_USER");
    expect(input.actorStoreUserId).toBe("su_owner");
    expect(input.actorName).toBe("Store OWNER");
    expect(input.actorEmail).toBe("su_owner@store.test");
    expect(input.platformUserId).toBeUndefined();
    expect(input.storeId).toBe(STORE_ID);
  });
});
