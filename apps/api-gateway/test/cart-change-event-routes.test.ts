/**
 * TODO-168 (ADR-267) — Cart-change analytics ingest route testleri (Fastify inject; fakes).
 * Kapsam: kayıt · (storeId, dedupeKey) idempotent dedupe · bot elenir · KVKK hash (ham cart id saklanmaz) ·
 * rate limit 429 · geçersiz body → recorded:false · store 404.
 */
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@commerce-os/db", () => ({ prisma: {} }));
let mockCustomer: { id: string } | null = null;
vi.mock("../src/customers/index.js", () => ({
  resolveCustomerFromRequest: async () => mockCustomer,
}));

const { registerCartChangeEventRoutes } = await import("../src/cart-changes/event-routes.js");
type Deps = Parameters<typeof registerCartChangeEventRoutes>[1];

const CONFIG = { SESSION_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz" } as unknown as Deps["config"];

interface Inserted {
  storeId: string;
  cartIdHash: string;
  customerIdHash?: string | null;
  changeType: string;
  eventType: string;
  fingerprint: string;
  dedupeKey: string;
}

function buildApp(over?: { dedupeKeyExists?: boolean; rateLimitAllow?: boolean }) {
  const inserted: Inserted[] = [];
  const data = {
    dedupeKeyExists: vi.fn(async () => over?.dedupeKeyExists ?? false),
    insertEvent: vi.fn(async (input: Inserted) => {
      inserted.push(input);
    }),
  };
  const rateLimiter = { hit: () => over?.rateLimitAllow ?? true, prune: () => {} };
  const app = Fastify();
  registerCartChangeEventRoutes(app, {
    config: CONFIG,
    customers: {} as Deps["customers"],
    logger: { warn: () => {} },
    resolvePublicStore: async (slug: string) => (slug === "demo" ? { id: "store_1", slug } : null),
    data: data as unknown as Deps["data"],
    rateLimiter,
  });
  return { app, inserted, data };
}

const URL = "/public/stores/demo/cart-change-events";
const validBody = {
  cartId: "cart-cookie-123",
  changeType: "PRICE_INCREASED",
  eventType: "detected",
  fingerprint: "fp-abc",
  severity: "WARN",
  placement: "CART_BAR",
};

beforeEach(() => {
  mockCustomer = null;
});

describe("cart-change-event ingest", () => {
  it("records a valid event (KVKK: cartIdHash is HMAC, not the raw cart id)", async () => {
    const { app, inserted } = buildApp();
    const res = await app.inject({ method: "POST", url: URL, payload: validBody });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.cartIdHash).not.toBe(validBody.cartId);
    expect(inserted[0]?.cartIdHash.length).toBeGreaterThan(16);
    expect(inserted[0]?.dedupeKey).toBe("detected:fp-abc");
  });

  it("dedupe: same (eventType, fingerprint) → not recorded, deduped:true", async () => {
    const { app, inserted } = buildApp({ dedupeKeyExists: true });
    const res = await app.inject({ method: "POST", url: URL, payload: validBody });
    expect(res.json().data).toEqual({ recorded: false, deduped: true });
    expect(inserted).toHaveLength(0);
  });

  it("bot user-agent → not recorded (no row)", async () => {
    const { app, inserted } = buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: { "user-agent": "Googlebot/2.1" },
      payload: validBody,
    });
    expect(res.json().data.recorded).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("customer identity → customerIdHash hashed", async () => {
    mockCustomer = { id: "cust-x" };
    const { app, inserted } = buildApp();
    await app.inject({ method: "POST", url: URL, payload: validBody });
    expect(inserted[0]?.customerIdHash).toBeTruthy();
    expect(inserted[0]?.customerIdHash).not.toBe("cust-x");
  });

  it("rate limited → 429", async () => {
    const { app } = buildApp({ rateLimitAllow: false });
    const res = await app.inject({ method: "POST", url: URL, payload: validBody });
    expect(res.statusCode).toBe(429);
  });

  it("invalid body → recorded:false (best-effort, no throw)", async () => {
    const { app, inserted } = buildApp();
    const res = await app.inject({ method: "POST", url: URL, payload: { cartId: "x" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("unknown store → 404", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "POST", url: "/public/stores/nope/cart-change-events", payload: validBody });
    expect(res.statusCode).toBe(404);
  });
});
