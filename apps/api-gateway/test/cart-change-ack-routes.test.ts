/**
 * TODO-168 (ADR-267) — Authenticated cart-change + ack route entegrasyon testleri.
 *
 * Bare Fastify + in-memory CartData/AckData + fiyatı KONFIGURE edilebilir projectCart. Kapsam:
 * add sonrası baseline (ilk resolve değişiklik üretmez) · fiyat artışı → WARN + requiresAck · tek
 * fingerprint ack → acknowledged · yeni fiyat → yeni fingerprint resurface · acknowledge-all ·
 * tenant guard (başka müşteri). Snapshot/ack DB'den (cross-device) gelir.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { PublicCart } from "@commerce-os/contracts";
import { createInMemoryCartData } from "./helpers/in-memory-cart-data.js";
import { registerCustomerCartRoutes } from "../src/cart/routes.js";

const STORE = { id: "store-a-id", slug: "store-a" };
const sessions: Record<string, { storeId: string; customerId: string }> = {
  "tok-a": { storeId: STORE.id, customerId: "cust-a" },
};

// variantId → güncel birim fiyat (mutable; fiyat hareketini simüle eder).
const priceMap = new Map<string, number>();

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
    resolvePublicStore: async (slug) => (slug === STORE.slug ? STORE : null),
    data,
    ackData: createInMemoryAckData(),
    catalog: { findVariantsByIds: async (storeId, ids) => ids.map((id) => ({ id, storeId })) },
    resolveCustomer: async (request, storeId) => {
      const header = request.headers["x-customer-session"];
      const token = Array.isArray(header) ? header[0] : header;
      const s = token ? sessions[token] : undefined;
      return s && s.storeId === storeId ? { id: s.customerId, storeId } : null;
    },
    // Güncel fiyatları priceMap'ten üretir (server-authoritative reprice simülasyonu).
    projectCart: async ({ store, items }) =>
      ({
        storeSlug: store.slug,
        currency: "TRY",
        lines: items.map((i) => {
          const unit = priceMap.get(i.variantId) ?? 10_000;
          return {
            variantId: i.variantId,
            productSlug: `p-${i.variantId}`,
            title: `Ürün ${i.variantId}`,
            variantTitle: "Standart",
            sku: `SKU-${i.variantId}`,
            quantity: i.quantity,
            availableQuantity: i.quantity,
            unitPriceMinor: unit,
            lineTotalMinor: unit * i.quantity,
            currency: "TRY",
            minOrderQuantity: 1,
            maxOrderQuantity: null,
            inStock: true,
            status: "OK",
            imageUrl: null,
            selected: true,
            compareAtMinor: null,
            discountedUnitPriceMinor: null,
            discountedLineTotalMinor: null,
            change: null,
          };
        }),
        subtotalMinor: 0,
        itemCount: items.length,
        checkoutReady: true,
        summary: {},
        shipping: {},
        changes: [],
        unacknowledgedChangeCount: 0,
        hasBlockingChanges: false,
        hasWarnings: false,
        requiresAcknowledgement: false,
      }) as unknown as PublicCart,
  });
  return app;
}

const A = { "x-customer-session": "tok-a" };
const base = "/public/stores/store-a/customer/cart";

let app: FastifyInstance;
beforeEach(async () => {
  priceMap.clear();
  app = buildApp();
});

async function addV1(qty = 1, version = 1) {
  return app.inject({ method: "POST", url: `${base}/lines`, headers: A, payload: { variantId: "v1", quantity: qty, cartVersion: version } });
}
async function getCart() {
  const res = await app.inject({ method: "GET", url: base, headers: A });
  return res.json().data.cart as PublicCart;
}

describe("auth cart-change: baseline + WARN + ack lifecycle", () => {
  it("add captures baseline → first resolve shows NO change", async () => {
    priceMap.set("v1", 8_000);
    await addV1();
    const cart = await getCart();
    expect(cart.changes).toHaveLength(0);
    expect(cart.requiresAcknowledgement).toBe(false);
  });

  it("price increase after baseline → WARN + requiresAcknowledgement", async () => {
    priceMap.set("v1", 8_000);
    await addV1();
    await getCart(); // baseline persisted
    priceMap.set("v1", 10_000); // fiyat yükseldi
    const cart = await getCart();
    expect(cart.changes[0]?.changeType).toBe("PRICE_INCREASED");
    expect(cart.hasWarnings).toBe(true);
    expect(cart.requiresAcknowledgement).toBe(true);
  });

  it("acknowledge one fingerprint clears the checkout WARN gate", async () => {
    priceMap.set("v1", 8_000);
    await addV1();
    await getCart();
    priceMap.set("v1", 10_000);
    const before = await getCart();
    const fp = before.changes[0]!.fingerprint;
    const ackRes = await app.inject({ method: "POST", url: `${base}/changes/${fp}/acknowledge`, headers: A });
    const acked = ackRes.json().data.cart as PublicCart;
    expect(acked.requiresAcknowledgement).toBe(false);
    expect(acked.changes[0]?.acknowledged).toBe(true);
    // Kalıcı (cross-device): tekrar GET'te hâlâ acknowledged.
    expect((await getCart()).requiresAcknowledgement).toBe(false);
  });

  it("a NEW price move after ack re-surfaces (new fingerprint, not acked)", async () => {
    priceMap.set("v1", 8_000);
    await addV1();
    await getCart();
    priceMap.set("v1", 10_000);
    const first = await getCart();
    const fp = first.changes[0]!.fingerprint;
    await app.inject({ method: "POST", url: `${base}/changes/${fp}/acknowledge`, headers: A });
    priceMap.set("v1", 12_000); // yeni artış
    const second = await getCart();
    expect(second.requiresAcknowledgement).toBe(true);
    expect(second.changes[0]?.fingerprint).not.toBe(fp);
    expect(second.changes[0]?.acknowledged).toBe(false);
  });

  it("acknowledge-all clears INFO+WARN", async () => {
    priceMap.set("v1", 8_000);
    await addV1();
    await getCart();
    priceMap.set("v1", 10_000);
    await getCart();
    const res = await app.inject({ method: "POST", url: `${base}/changes/acknowledge-all`, headers: A });
    const cart = res.json().data.cart as PublicCart;
    expect(cart.requiresAcknowledgement).toBe(false);
    expect(cart.unacknowledgedChangeCount).toBe(0);
  });

  it("unknown/other session cannot read the cart (401)", async () => {
    const res = await app.inject({ method: "GET", url: base, headers: { "x-customer-session": "nope" } });
    expect(res.statusCode).toBe(401);
  });
});
