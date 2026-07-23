import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "@commerce-os/config";
import {
  registerCustomerListRoutes,
  type CustomerListRoutesDeps,
} from "../src/customer-lists/routes.js";
import type {
  CustomerListData,
  CustomerListItemRecord,
  CustomerListRecord,
} from "../src/customer-lists/data.js";
import type { CustomerDataAccess } from "../src/customers/index.js";

/**
 * TODO-159D (ADR-093) — Customer Lists & Wishlist gateway route testleri.
 *
 * Gerçek route'lar (registerCustomerListRoutes) IN-MEMORY CustomerListData + sahte katalog
 * ile app.inject üzerinden çağrılır (DB'siz). Doğrulananlar: varsayılan wishlist lazy-create,
 * özel liste CRUD + isim çakışması, idempotent add/remove, toggle/status, cross-customer +
 * cross-store izolasyonu, taşı/kopyala, toplu sepete ekleme sonuç özeti (stok/uygunluk),
 * guest merge (idempotent + bozuk id eleme), sayfalama, varsayılan liste değişmezliği.
 *
 * DB-seviyesi invariant'lar (tek default wishlist + item dedup kısmi unique) migration'da
 * PostgreSQL'de doğrulanmıştır (ADR-093); bu test route iş mantığına odaklanır.
 */

const SECRET = "test-session-secret-with-enough-length";
const STORE = { id: "store_a", slug: "store-a" };
const STORE_B = { id: "store_b", slug: "store-b" };

function hash(token: string): string {
  return createHash("sha256").update(`${token}.${SECRET}`).digest("hex");
}

// ── Sahte katalog seed'i ──────────────────────────────────────────────────────
interface SeedProduct {
  id: string;
  storeId: string;
  slug: string;
  title: string;
  status: string;
  salesMode: string;
  purchasable: boolean;
  priceVisibility: string;
}
interface SeedVariant {
  id: string;
  productId: string;
  storeId: string;
  title: string;
  sku: string;
  status: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
}

const products = new Map<string, SeedProduct>();
const variants = new Map<string, SeedVariant>();
const stock = new Map<string, { onHand: number; reserved: number }>();

function seedCatalog() {
  products.clear();
  variants.clear();
  stock.clear();
  // p1: aktif, stokta
  products.set("p1", { id: "p1", storeId: STORE.id, slug: "p1", title: "Product 1", status: "ACTIVE", salesMode: "ONLINE", purchasable: true, priceVisibility: "VISIBLE" });
  variants.set("v1", { id: "v1", productId: "p1", storeId: STORE.id, title: "V1", sku: "SKU1", status: "ACTIVE", priceMinor: 1000, compareAtMinor: 1500, currency: "TRY" });
  stock.set("v1", { onHand: 5, reserved: 0 });
  // p2: aktif, stok yok
  products.set("p2", { id: "p2", storeId: STORE.id, slug: "p2", title: "Product 2", status: "ACTIVE", salesMode: "ONLINE", purchasable: true, priceVisibility: "VISIBLE" });
  variants.set("v2", { id: "v2", productId: "p2", storeId: STORE.id, title: "V2", sku: "SKU2", status: "ACTIVE", priceMinor: 2000, compareAtMinor: null, currency: "TRY" });
  stock.set("v2", { onHand: 0, reserved: 0 });
  // p3: arşivlenmiş (pasif)
  products.set("p3", { id: "p3", storeId: STORE.id, slug: "p3", title: "Product 3", status: "ARCHIVED", salesMode: "ONLINE", purchasable: true, priceVisibility: "VISIBLE" });
  variants.set("v3", { id: "v3", productId: "p3", storeId: STORE.id, title: "V3", sku: "SKU3", status: "ARCHIVED", priceMinor: 3000, compareAtMinor: null, currency: "TRY" });
}

// ── In-memory CustomerListData ────────────────────────────────────────────────
function createMemoryData(): CustomerListData {
  let seq = 0;
  const lists: CustomerListRecord[] = [];
  const items: CustomerListItemRecord[] = [];
  const nextId = (p: string) => `${p}_${++seq}`;

  return {
    async ensureDefaultWishlist(storeId, customerId) {
      let wl = lists.find((l) => l.storeId === storeId && l.customerId === customerId && l.type === "WISHLIST" && l.isDefault);
      if (!wl) {
        wl = { id: nextId("list"), storeId, customerId, name: "Favorilerim", type: "WISHLIST", visibility: "PRIVATE", isDefault: true, createdAt: new Date(), updatedAt: new Date() };
        lists.push(wl);
      }
      return wl;
    },
    async listListsWithCounts(storeId, customerId) {
      return lists
        .filter((l) => l.storeId === storeId && l.customerId === customerId)
        .sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1))
        .map((l) => ({ ...l, itemCount: items.filter((i) => i.listId === l.id).length }));
    },
    async countCustomerLists(storeId, customerId) {
      return lists.filter((l) => l.storeId === storeId && l.customerId === customerId).length;
    },
    async findListByNameCI(storeId, customerId, name) {
      return (
        lists.find(
          (l) => l.storeId === storeId && l.customerId === customerId && !l.isDefault && l.name.toLowerCase() === name.toLowerCase(),
        ) ?? null
      );
    },
    async createList(storeId, customerId, name) {
      const l: CustomerListRecord = { id: nextId("list"), storeId, customerId, name, type: "SHOPPING_LIST", visibility: "PRIVATE", isDefault: false, createdAt: new Date(), updatedAt: new Date() };
      lists.push(l);
      return l;
    },
    async findList(storeId, customerId, listId) {
      return lists.find((l) => l.id === listId && l.storeId === storeId && l.customerId === customerId) ?? null;
    },
    async renameList(listId, name) {
      const l = lists.find((x) => x.id === listId)!;
      l.name = name;
      return l;
    },
    async deleteList(listId) {
      const idx = lists.findIndex((l) => l.id === listId);
      if (idx >= 0) lists.splice(idx, 1);
      for (let i = items.length - 1; i >= 0; i--) if (items[i].listId === listId) items.splice(i, 1);
    },
    async countItems(listId) {
      return items.filter((i) => i.listId === listId).length;
    },
    async listItemsPage(listId, limit, offset) {
      const all = items.filter((i) => i.listId === listId);
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    async listAllItems(listId, cap) {
      return items.filter((i) => i.listId === listId).slice(0, cap);
    },
    async findItemById(listId, itemId) {
      return items.find((i) => i.id === itemId && i.listId === listId) ?? null;
    },
    async findItemByProductVariant(listId, productId, variantId) {
      return items.find((i) => i.listId === listId && i.productId === productId && (i.variantId ?? null) === (variantId ?? null)) ?? null;
    },
    async addItemIdempotent(input) {
      const existing = items.find(
        (i) => i.listId === input.listId && i.productId === input.productId && (i.variantId ?? null) === (input.variantId ?? null),
      );
      if (existing) return { item: existing, alreadyExisted: true };
      const item: CustomerListItemRecord = { id: nextId("item"), storeId: input.storeId, listId: input.listId, productId: input.productId, variantId: input.variantId ?? null, note: input.note, quantity: input.quantity, sortOrder: 0, addedAt: new Date() };
      items.push(item);
      return { item, alreadyExisted: false };
    },
    async deleteItem(itemId) {
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx >= 0) items.splice(idx, 1);
    },
    async moveItem(itemId, targetListId) {
      const it = items.find((i) => i.id === itemId)!;
      it.listId = targetListId;
    },
    async listActiveVariantsByProductIds(storeId, productIds) {
      return [...variants.values()]
        .filter((v) => v.storeId === storeId && productIds.includes(v.productId) && v.status === "ACTIVE")
        .sort((a, b) => a.priceMinor - b.priceMinor)
        .map((v) => ({ id: v.id, productId: v.productId, title: v.title, sku: v.sku, priceMinor: v.priceMinor, compareAtMinor: v.compareAtMinor, currency: v.currency }));
    },
    async wishlistProductIdSet(wishlistId, productIds) {
      const set = new Set<string>();
      for (const i of items) {
        if (i.listId === wishlistId && i.variantId === null && productIds.includes(i.productId)) set.add(i.productId);
      }
      return set;
    },
    async adminSummary() {
      return { listCount: 0, wishlistItemCount: 0, totalItemCount: 0, lastAddedAt: null };
    },
  };
}

// ── Sahte müşteri oturumu (findSessionByTokenHash) ────────────────────────────
// token-a → store_a/customer_a, token-a2 → store_a/customer_b, token-b → store_b/customer_c
const sessions: Record<string, { storeId: string; customerId: string }> = {
  [hash("token-a")]: { storeId: STORE.id, customerId: "customer_a" },
  [hash("token-a2")]: { storeId: STORE.id, customerId: "customer_b" },
  [hash("token-b")]: { storeId: STORE_B.id, customerId: "customer_c" },
};

function buildApp(): FastifyInstance {
  seedCatalog();
  const data = createMemoryData();
  const customers = {
    async findSessionByTokenHash(tokenHash: string) {
      const s = sessions[tokenHash];
      if (!s) return null;
      return {
        id: "sess",
        storeId: s.storeId,
        customerId: s.customerId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        customer: { id: s.customerId, storeId: s.storeId, status: "ACTIVE" as const },
      };
    },
  } as unknown as CustomerDataAccess;

  const deps: CustomerListRoutesDeps = {
    config: { SESSION_SECRET: SECRET, MEDIA_PUBLIC_BASE_URL: "" } as unknown as AppConfig,
    customers,
    logger: { info() {}, warn() {} },
    resolvePublicStore: async (slug) =>
      slug === STORE.slug ? STORE : slug === STORE_B.slug ? STORE_B : null,
    data,
    catalog: {
      findProductsByIds: async (storeId, ids) =>
        ids.map((id) => products.get(id)).filter((p): p is SeedProduct => !!p && p.storeId === storeId) as never,
      findVariantsByIds: async (storeId, ids) =>
        ids.map((id) => variants.get(id)).filter((v): v is SeedVariant => !!v && v.storeId === storeId) as never,
      findInventoryByVariantIds: async (_storeId, ids) =>
        ids
          .filter((id) => stock.has(id))
          .map((id) => ({ variantId: id, quantityOnHand: stock.get(id)!.onHand, quantityReserved: stock.get(id)!.reserved })) as never,
      listProductImages: async () => new Map(),
    },
  };

  const app = Fastify({ logger: false });
  registerCustomerListRoutes(app, deps);
  return app;
}

const A = { "x-customer-session": "token-a" };
const A2 = { "x-customer-session": "token-a2" };
const B = { "x-customer-session": "token-b" };
const base = "/public/stores/store-a/customer";

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp();
});

describe("customer lists — wishlist temeli", () => {
  it("GET /lists varsayılan wishlist'i lazy-create eder (tam bir tane)", async () => {
    const res = await app.inject({ method: "GET", url: `${base}/lists`, headers: A });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].isDefault).toBe(true);
    expect(body.data[0].type).toBe("WISHLIST");
    // İkinci çağrı yine tek liste (yeniden oluşturmaz).
    const res2 = await app.inject({ method: "GET", url: `${base}/lists`, headers: A });
    expect(res2.json().data).toHaveLength(1);
  });

  it("oturumsuz istek 401", async () => {
    const res = await app.inject({ method: "GET", url: `${base}/lists` });
    expect(res.statusCode).toBe(401);
  });

  it("wishlist toggle + batched status", async () => {
    const on = await app.inject({ method: "POST", url: `${base}/wishlist/toggle`, headers: A, payload: { productId: "p1" } });
    expect(on.statusCode).toBe(200);
    expect(on.json().data.saved).toBe(true);
    const status = await app.inject({ method: "POST", url: `${base}/wishlist/status`, headers: A, payload: { productIds: ["p1", "p2"] } });
    expect(status.json().data.savedProductIds).toEqual(["p1"]);
    // idempotent: saved=true tekrar → yine true, çift kayıt yok
    await app.inject({ method: "POST", url: `${base}/wishlist/toggle`, headers: A, payload: { productId: "p1", saved: true } });
    const status2 = await app.inject({ method: "POST", url: `${base}/wishlist/status`, headers: A, payload: { productIds: ["p1"] } });
    expect(status2.json().data.savedProductIds).toEqual(["p1"]);
    // kapat
    const off = await app.inject({ method: "POST", url: `${base}/wishlist/toggle`, headers: A, payload: { productId: "p1", saved: false } });
    expect(off.json().data.saved).toBe(false);
  });

  it("nonexistent ürün toggle → 404", async () => {
    const res = await app.inject({ method: "POST", url: `${base}/wishlist/toggle`, headers: A, payload: { productId: "nope" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("özel liste CRUD + öğeler", () => {
  it("liste oluşturma, isim çakışması 409, idempotent öğe ekleme", async () => {
    const create = await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "Yaz" } });
    expect(create.statusCode).toBe(201);
    const listId = create.json().data.id;
    // aynı isim (case-insensitive) → 409
    const dup = await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "yaz" } });
    expect(dup.statusCode).toBe(409);
    // öğe ekle → 201 alreadyExisted false
    const add1 = await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p1", variantId: "v1" } });
    expect(add1.statusCode).toBe(201);
    expect(add1.json().data.alreadyExisted).toBe(false);
    // aynı öğe tekrar → 200 alreadyExisted true (dedup)
    const add2 = await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p1", variantId: "v1" } });
    expect(add2.statusCode).toBe(200);
    expect(add2.json().data.alreadyExisted).toBe(true);
    // detay 1 öğe
    const detail = await app.inject({ method: "GET", url: `${base}/lists/${listId}`, headers: A });
    expect(detail.json().data.items).toHaveLength(1);
    expect(detail.json().pagination.totalItems).toBe(1);
  });

  it("cross-store: store-a token'ı store-b yolunda 401", async () => {
    const res = await app.inject({ method: "GET", url: `/public/stores/store-b/customer/lists`, headers: A });
    expect(res.statusCode).toBe(401);
  });

  it("cross-customer: B, A'nın listesine erişemez (404)", async () => {
    const create = await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "Gizli" } });
    const listId = create.json().data.id;
    const asB = await app.inject({ method: "GET", url: `${base}/lists/${listId}`, headers: A2 });
    expect(asB.statusCode).toBe(404);
  });

  it("varsayılan wishlist silinemez/yeniden-adlandırılamaz (422)", async () => {
    const lists = await app.inject({ method: "GET", url: `${base}/lists`, headers: A });
    const defaultId = lists.json().data[0].id;
    const del = await app.inject({ method: "DELETE", url: `${base}/lists/${defaultId}`, headers: A });
    expect(del.statusCode).toBe(422);
    const rename = await app.inject({ method: "PATCH", url: `${base}/lists/${defaultId}`, headers: A, payload: { name: "X" } });
    expect(rename.statusCode).toBe(422);
  });

  it("öğe kaldırma idempotent (yok → yine ok)", async () => {
    const listId = (await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "L" } })).json().data.id;
    const add = await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p1" } });
    const itemId = (await app.inject({ method: "GET", url: `${base}/lists/${listId}`, headers: A })).json().data.items[0].id;
    void add;
    const del1 = await app.inject({ method: "DELETE", url: `${base}/lists/${listId}/items/${itemId}`, headers: A });
    expect(del1.statusCode).toBe(200);
    const del2 = await app.inject({ method: "DELETE", url: `${base}/lists/${listId}/items/${itemId}`, headers: A });
    expect(del2.statusCode).toBe(200);
  });

  it("taşıma + kopyalama listeler arasında", async () => {
    const l1 = (await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "L1" } })).json().data.id;
    const l2 = (await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "L2" } })).json().data.id;
    await app.inject({ method: "POST", url: `${base}/lists/${l1}/items`, headers: A, payload: { productId: "p1", variantId: "v1" } });
    const itemId = (await app.inject({ method: "GET", url: `${base}/lists/${l1}`, headers: A })).json().data.items[0].id;
    // kopyala → her iki listede
    const copy = await app.inject({ method: "POST", url: `${base}/lists/${l1}/items/${itemId}/copy`, headers: A, payload: { targetListId: l2 } });
    expect(copy.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `${base}/lists/${l1}`, headers: A })).json().data.items).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: `${base}/lists/${l2}`, headers: A })).json().data.items).toHaveLength(1);
  });
});

describe("toplu sepete ekleme + hidrasyon uygunluğu", () => {
  it("stokta olan aday; stok yok / pasif atlanır (sebepli özet)", async () => {
    const listId = (await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "Karma" } })).json().data.id;
    await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p1" } }); // stokta
    await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p2" } }); // stok yok
    await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p3" } }); // pasif
    const res = await app.inject({ method: "POST", url: `${base}/lists/${listId}/add-to-cart`, headers: A, payload: {} });
    expect(res.statusCode).toBe(200);
    const { candidates, skipped } = res.json().data;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].productId).toBe("p1");
    expect(candidates[0].variantId).toBe("v1");
    const reasons = Object.fromEntries(skipped.map((s: { productId?: string; itemId: string; reason: string; productTitle: string }) => [s.productTitle, s.reason]));
    expect(reasons["Product 2"]).toBe("OUT_OF_STOCK");
    expect(reasons["Product 3"]).toBe("UNAVAILABLE");
  });

  it("liste detayı hidrasyonu: fiyat/compareAt/uygunluk", async () => {
    const listId = (await app.inject({ method: "POST", url: `${base}/lists`, headers: A, payload: { name: "H" } })).json().data.id;
    await app.inject({ method: "POST", url: `${base}/lists/${listId}/items`, headers: A, payload: { productId: "p1" } });
    const item = (await app.inject({ method: "GET", url: `${base}/lists/${listId}`, headers: A })).json().data.items[0];
    expect(item.priceMinor).toBe(1000);
    expect(item.compareAtMinor).toBe(1500);
    expect(item.availability).toBe("AVAILABLE");
    expect(item.addableVariantId).toBe("v1");
  });
});

describe("guest merge", () => {
  it("geçerli ürünler merge; bozuk id skipped; idempotent", async () => {
    const merge1 = await app.inject({ method: "POST", url: `${base}/wishlist/merge`, headers: A, payload: { items: [{ productId: "p1" }, { productId: "nope" }] } });
    expect(merge1.statusCode).toBe(200);
    expect(merge1.json().data.merged).toBe(1);
    expect(merge1.json().data.skipped).toBe(1);
    // idempotent: tekrar merge → yine merged=1 (zaten var; çift kayıt yok)
    const merge2 = await app.inject({ method: "POST", url: `${base}/wishlist/merge`, headers: A, payload: { items: [{ productId: "p1" }] } });
    expect(merge2.json().data.merged).toBe(1);
    const status = await app.inject({ method: "POST", url: `${base}/wishlist/status`, headers: A, payload: { productIds: ["p1"] } });
    expect(status.json().data.savedProductIds).toEqual(["p1"]);
  });
});

// B store'unda hidrasyon/izolasyon sağlıklı: B kendi (boş) listesini görür.
describe("tenant izolasyonu", () => {
  it("B store müşterisi kendi boş wishlist'ini görür", async () => {
    const res = await app.inject({ method: "GET", url: `/public/stores/store-b/customer/lists`, headers: B });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].isDefault).toBe(true);
  });
});
