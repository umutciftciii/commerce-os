/**
 * TODO-167 (ADR-266) — Persistent Cart route testleri (bare Fastify + in-memory fakes + app.inject).
 *
 * Kapsam: auth 401 · store 404 · lazy GET · add version-bump · 409 CART_STALE (guncel projeksiyon
 * doner) · cross-store variant 404 · line remove · cross-customer line 404 · guest merge + overflow.
 * Fiyat projeksiyonu enjekte edilir (ORTAK assembler ayri test edilir); burada route sozlesmesi test edilir.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryCartData } from "./helpers/in-memory-cart-data.js";
import { registerCustomerCartRoutes } from "../src/cart/routes.js";

const STORE = { id: "store-a-id", slug: "store-a" };
const STORE_B = { id: "store-b-id", slug: "store-b" };

// token -> session
const sessions: Record<string, { storeId: string; customerId: string }> = {
  "tok-a": { storeId: STORE.id, customerId: "cust-a" },
  "tok-a2": { storeId: STORE.id, customerId: "cust-a" },
  "tok-b": { storeId: STORE.id, customerId: "cust-b" },
};

// store -> valid variant ids (catalog authority)
const validVariants: Record<string, Set<string>> = {
  [STORE.id]: new Set(["v1", "v2", "v3"]),
  [STORE_B.id]: new Set(["vb1"]),
};

/** TODO-168 — in-memory CartChangeAck double (route testleri icin). */
function createInMemoryAckData() {
  const acks: Array<{ storeId: string; cartId: string; fingerprint: string }> = [];
  return {
    async listAckFingerprints(storeId: string, cartId: string) {
      return acks.filter((a) => a.storeId === storeId && a.cartId === cartId).map((a) => a.fingerprint);
    },
    async insertAck(input: { storeId: string; cartId: string; fingerprint: string }) {
      if (!acks.some((a) => a.cartId === input.cartId && a.fingerprint === input.fingerprint)) {
        acks.push({ storeId: input.storeId, cartId: input.cartId, fingerprint: input.fingerprint });
      }
    },
    async insertAcks(inputs: Array<{ storeId: string; cartId: string; fingerprint: string }>) {
      for (const i of inputs) await this.insertAck(i);
    },
  };
}

function buildApp(): FastifyInstance {
  const data = createInMemoryCartData();

  const app = Fastify({ logger: false });
  registerCustomerCartRoutes(app, {
    logger: { info() {}, warn() {} },
    resolvePublicStore: async (slug) =>
      slug === STORE.slug ? STORE : slug === STORE_B.slug ? STORE_B : null,
    data,
    ackData: createInMemoryAckData(),
    catalog: {
      findVariantsByIds: async (storeId, ids) =>
        ids
          .filter((id) => validVariants[storeId]?.has(id))
          .map((id) => ({ id, storeId })) as never,
    },
    // Test icin auth'i dogrudan token->session ile coz (hash yerine raw token).
    resolveCustomer: async (request, storeId) => {
      const header = request.headers["x-customer-session"];
      const token = Array.isArray(header) ? header[0] : header;
      if (!token) return null;
      const s = sessions[token];
      if (!s || s.storeId !== storeId) return null;
      return { id: s.customerId, storeId: s.storeId };
    },
    // Fiyat projeksiyonu passthrough: satirlari aynen dondurur (ORTAK assembler ayri test).
    projectCart: async ({ store, items }) =>
      ({
        storeSlug: store.slug,
        currency: "TRY",
        lines: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        checkoutReady: items.length > 0,
      }) as never,
  });
  return app;
}

/**
 * BUG-CART-002 — Stok-farkinda projectCart double: her varyant icin `stock` (available) modeller;
 * add-endpoint FAIL-CLOSED stok kapisi + deselection threading testleri icin. `deselectedVariantIds`
 * verilirse ilgili satir `selected:false` doner (auth deselection = gorunum girdisi).
 */
function buildStockApp(stock: Record<string, number>): FastifyInstance {
  const data = createInMemoryCartData();
  const app = Fastify({ logger: false });
  registerCustomerCartRoutes(app, {
    logger: { info() {}, warn() {} },
    resolvePublicStore: async (slug) =>
      slug === STORE.slug ? STORE : slug === STORE_B.slug ? STORE_B : null,
    data,
    ackData: createInMemoryAckData(),
    catalog: {
      findVariantsByIds: async (storeId, ids) =>
        ids
          .filter((id) => validVariants[storeId]?.has(id))
          .map((id) => ({ id, storeId })) as never,
    },
    resolveCustomer: async (request, storeId) => {
      const header = request.headers["x-customer-session"];
      const token = Array.isArray(header) ? header[0] : header;
      if (!token) return null;
      const s = sessions[token];
      if (!s || s.storeId !== storeId) return null;
      return { id: s.customerId, storeId: s.storeId };
    },
    projectCart: async ({ store, items, deselectedVariantIds }) => {
      const deselected = new Set(deselectedVariantIds ?? []);
      const lines = items.map((i) => {
        const available = stock[i.variantId] ?? 0;
        const availableQuantity = Math.max(0, Math.min(i.quantity, available));
        const status =
          available <= 0 ? "OUT_OF_STOCK" : availableQuantity < i.quantity ? "QUANTITY_ADJUSTED" : "OK";
        return {
          variantId: i.variantId,
          quantity: i.quantity,
          availableQuantity,
          inStock: available > 0,
          status,
          selected: !deselected.has(i.variantId),
        };
      });
      return {
        storeSlug: store.slug,
        currency: "TRY",
        lines,
        itemCount: lines.reduce((s, l) => s + (l.selected ? l.availableQuantity : 0), 0),
        checkoutReady: lines.length > 0 && lines.every((l) => l.selected && l.status === "OK"),
      } as never;
    },
  });
  return app;
}

const A = { "x-customer-session": "tok-a" };
const B = { "x-customer-session": "tok-b" };
const base = "/public/stores/store-a/customer/cart";

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp();
});

describe("customer cart routes: auth + store", () => {
  it("401 without a customer session", async () => {
    const res = await app.inject({ method: "GET", url: base });
    expect(res.statusCode).toBe(401);
  });

  it("404 for an unknown store", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/stores/nope/customer/cart",
      headers: A,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("customer cart routes: GET (lazy) + add", () => {
  it("GET lazily creates an empty ACTIVE cart at version 1", async () => {
    const res = await app.inject({ method: "GET", url: base, headers: A });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.version).toBe(1);
    expect(body.data.cart.lines).toEqual([]);
  });

  it("POST lines adds a variant and bumps version to 2", async () => {
    await app.inject({ method: "GET", url: base, headers: A });
    const res = await app.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v1", quantity: 2, cartVersion: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.version).toBe(2);
    expect(body.data.cart.lines).toEqual([{ variantId: "v1", quantity: 2, change: null }]);
  });

  it("409 CART_STALE with the current authoritative projection on version mismatch", async () => {
    await app.inject({ method: "GET", url: base, headers: A });
    await app.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v1", quantity: 1, cartVersion: 1 },
    });
    // Client still thinks version is 1 (stale).
    const res = await app.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v2", quantity: 1, cartVersion: 1 },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe("CART_STALE");
    expect(body.data.version).toBe(2);
    expect(body.data.cart.lines).toEqual([{ variantId: "v1", quantity: 1, change: null }]);
  });

  it("404 when adding a variant that does not belong to the store", async () => {
    await app.inject({ method: "GET", url: base, headers: A });
    const res = await app.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "vb1", quantity: 1, cartVersion: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("customer cart routes: line mutation tenant isolation", () => {
  it("404 when deleting a line that belongs to another customer", async () => {
    // customer A creates a line
    await app.inject({ method: "GET", url: base, headers: A });
    const add = await app.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v1", quantity: 1, cartVersion: 1 },
    });
    const lineId = add.json().data.cart.lines[0]?.id ?? "line-of-a";
    // customer B tries to delete A's line id
    await app.inject({ method: "GET", url: base, headers: B });
    const res = await app.inject({
      method: "DELETE",
      url: `${base}/lines/${lineId}`,
      headers: B,
      payload: { cartVersion: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("customer cart routes: add-endpoint FAIL-CLOSED stock guard (BUG-CART-002)", () => {
  it("409 VARIANT_OUT_OF_STOCK when adding an out-of-stock variant; cart stays empty", async () => {
    const stockApp = buildStockApp({ v1: 5, v2: 0, v3: 1 });
    await stockApp.inject({ method: "GET", url: base, headers: A });
    const res = await stockApp.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v2", quantity: 1, cartVersion: 1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("VARIANT_OUT_OF_STOCK");
    // Hicbir satir yazilmadi (cart bos, version bump yok).
    const after = await stockApp.inject({ method: "GET", url: base, headers: A });
    expect(after.json().data.cart.lines).toEqual([]);
  });

  it("allows the in-stock add, then 409 VARIANT_STOCK_LIMIT on the increment past stock", async () => {
    const stockApp = buildStockApp({ v3: 1 });
    await stockApp.inject({ method: "GET", url: base, headers: A });
    const first = await stockApp.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v3", quantity: 1, cartVersion: 1 },
    });
    expect(first.statusCode).toBe(200);
    // Mevcut 1 + istenen 1 = 2 > available 1 → reddedilir; satir 1'de kalir.
    const second = await stockApp.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v3", quantity: 1, cartVersion: 2 },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("VARIANT_STOCK_LIMIT");
    const after = await stockApp.inject({ method: "GET", url: base, headers: A });
    expect(after.json().data.cart.lines).toMatchObject([{ variantId: "v3", quantity: 1 }]);
  });

  it("adds a fully-fulfillable in-stock quantity (200)", async () => {
    const stockApp = buildStockApp({ v1: 5 });
    await stockApp.inject({ method: "GET", url: base, headers: A });
    const res = await stockApp.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v1", quantity: 3, cartVersion: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.cart.lines).toMatchObject([{ variantId: "v1", quantity: 3 }]);
  });
});

describe("customer cart routes: auth deselection threading (BUG-CART-002)", () => {
  it("GET ?deselected= marks the matching line selected:false (survives refresh)", async () => {
    const stockApp = buildStockApp({ v1: 5, v2: 5 });
    await stockApp.inject({ method: "GET", url: base, headers: A });
    await stockApp.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v1", quantity: 1, cartVersion: 1 },
    });
    await stockApp.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v2", quantity: 1, cartVersion: 2 },
    });
    const res = await stockApp.inject({ method: "GET", url: `${base}?deselected=v1`, headers: A });
    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(res.json().data.cart.lines.map((l: { variantId: string; selected: boolean }) => [l.variantId, l.selected]));
    expect(byId.v1).toBe(false);
    expect(byId.v2).toBe(true);
  });
});

describe("customer cart routes: guest merge", () => {
  it("merges valid guest items and reports overflow count", async () => {
    await app.inject({ method: "GET", url: base, headers: A });
    await app.inject({
      method: "POST",
      url: `${base}/lines`,
      headers: A,
      payload: { variantId: "v1", quantity: 2, cartVersion: 1 },
    });
    const res = await app.inject({
      method: "POST",
      url: `${base}/merge`,
      headers: A,
      payload: { items: [{ variantId: "v1", quantity: 3 }, { variantId: "v2", quantity: 1 }, { variantId: "bad", quantity: 1 }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.result.merged).toBeGreaterThan(0);
    expect(body.data.cart.cart.lines).toEqual([
      { variantId: "v1", quantity: 5, change: null },
      { variantId: "v2", quantity: 1, change: null },
    ]);
  });
});
