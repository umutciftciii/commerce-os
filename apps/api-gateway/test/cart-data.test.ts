/**
 * TODO-167 (ADR-266) — Persistent Cart veri katmani testleri (fake PrismaClient).
 *
 * Atomik version-conditional mutation (stale/inactive), quantity kelepcesi, 100-satir
 * siniri, lazy ACTIVE cart, deterministik guest-merge (cart-core), convert, expiry sweep.
 * DB-seviyesi partial-unique invariant'i Postgres'te dogrulanir (migration); burada
 * modul is-mantigi test edilir.
 */
import { describe, expect, it } from "vitest";
import { CartLineNotFoundError, CartStaleError, createCartData } from "../src/cart/data.js";

// ── Kompakt in-memory Prisma fake (yalniz modulun kullandigi cagrilar) ──────────────
interface FakeCart {
  id: string;
  storeId: string;
  customerId: string;
  status: "ACTIVE" | "CONVERTED" | "MERGED" | "EXPIRED";
  version: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  convertedAt: Date | null;
  mergedAt: Date | null;
  expiredAt: Date | null;
}
interface FakeLine {
  id: string;
  storeId: string;
  cartId: string;
  variantId: string;
  quantity: number;
  createdAt: Date;
}

function fakeDb() {
  const carts: FakeCart[] = [];
  const lines: FakeLine[] = [];
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const withLines = (cart: FakeCart | undefined) =>
    cart
      ? {
          ...cart,
          lines: lines
            .filter((l) => l.cartId === cart.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
        }
      : null;

  const cart = {
    findFirst: async ({ where, include }: any) => {
      const found = carts.find(
        (c) =>
          (where.id === undefined || c.id === where.id) &&
          (where.storeId === undefined || c.storeId === where.storeId) &&
          (where.customerId === undefined || c.customerId === where.customerId) &&
          (where.status === undefined || c.status === where.status),
      );
      return include?.lines ? withLines(found) : (found ?? null);
    },
    findMany: async ({ where, take }: any) => {
      let rows = carts.filter(
        (c) =>
          (where.status === undefined || c.status === where.status) &&
          (where.lastActivityAt?.lt === undefined || c.lastActivityAt < where.lastActivityAt.lt),
      );
      if (take) rows = rows.slice(0, take);
      return rows.map((c) => ({ id: c.id }));
    },
    create: async ({ data, include }: any) => {
      const now = new Date();
      const row: FakeCart = {
        id: id("cart"),
        storeId: data.storeId,
        customerId: data.customerId,
        status: data.status ?? "ACTIVE",
        version: data.version ?? 1,
        currency: data.currency,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        convertedAt: null,
        mergedAt: null,
        expiredAt: null,
      };
      carts.push(row);
      return include?.lines ? withLines(row) : row;
    },
    updateMany: async ({ where, data }: any) => {
      const idOk = (c: FakeCart) =>
        where.id === undefined
          ? true
          : typeof where.id === "object"
            ? where.id.in.includes(c.id)
            : c.id === where.id;
      const matches = carts.filter(
        (c) =>
          idOk(c) &&
          (where.version === undefined || c.version === where.version) &&
          (where.status === undefined || c.status === where.status) &&
          (where.lastActivityAt?.lt === undefined || c.lastActivityAt < where.lastActivityAt.lt),
      );
      for (const c of matches) {
        if (data.version?.increment) c.version += data.version.increment;
        if (data.status) c.status = data.status;
        if (data.lastActivityAt) c.lastActivityAt = data.lastActivityAt;
        if (data.convertedAt !== undefined) c.convertedAt = data.convertedAt;
        if (data.mergedAt !== undefined) c.mergedAt = data.mergedAt;
        if (data.expiredAt !== undefined) c.expiredAt = data.expiredAt;
      }
      return { count: matches.length };
    },
  };

  const cartLine = {
    findFirst: async ({ where }: any) =>
      lines.find(
        (l) =>
          (where.cartId === undefined || l.cartId === where.cartId) &&
          (where.id === undefined || l.id === where.id) &&
          (where.storeId === undefined || l.storeId === where.storeId) &&
          (where.variantId === undefined || l.variantId === where.variantId),
      ) ?? null,
    create: async ({ data }: any) => {
      const row: FakeLine = {
        id: id("line"),
        storeId: data.storeId,
        cartId: data.cartId,
        variantId: data.variantId,
        quantity: data.quantity,
        createdAt: new Date(Date.now() + seq),
      };
      lines.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = lines.find((l) => l.id === where.id)!;
      if (data.quantity !== undefined) row.quantity = data.quantity;
      return row;
    },
    delete: async ({ where }: any) => {
      const idx = lines.findIndex((l) => l.id === where.id);
      if (idx >= 0) lines.splice(idx, 1);
      return {};
    },
    deleteMany: async ({ where }: any) => {
      const before = lines.length;
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        const cartMatch = where.cartId === undefined || l.cartId === where.cartId;
        const notInKeep = where.variantId?.notIn ? !where.variantId.notIn.includes(l.variantId) : true;
        if (cartMatch && notInKeep) lines.splice(i, 1);
      }
      return { count: before - lines.length };
    },
    count: async ({ where }: any) => lines.filter((l) => l.cartId === where.cartId).length,
  };

  const db = {
    cart,
    cartLine,
    $transaction: async (fn: any) => fn({ cart, cartLine }),
  };
  return { db, carts, lines };
}

const S = "store-1";
const C = "cust-1";

describe("cart data: ensureActiveCart", () => {
  it("lazy creates an ACTIVE cart, then reuses it", async () => {
    const { db, carts } = fakeDb();
    const data = createCartData(db as never);
    const a = await data.ensureActiveCart(S, C, "TRY");
    expect(a.status).toBe("ACTIVE");
    expect(a.version).toBe(1);
    expect(carts).toHaveLength(1);
    const b = await data.ensureActiveCart(S, C, "TRY");
    expect(b.id).toBe(a.id);
    expect(carts).toHaveLength(1);
  });
});

describe("cart data: addOrIncrementLine", () => {
  it("adds a new line and bumps version", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    const cart = await data.ensureActiveCart(S, C, "TRY");
    const next = await data.addOrIncrementLine({
      storeId: S, customerId: C, expectedVersion: cart.version, variantId: "v1", quantity: 2,
    });
    expect(next.version).toBe(2);
    expect(next.lines).toEqual([expect.objectContaining({ variantId: "v1", quantity: 2 })]);
  });

  it("increments an existing line and clamps to 999", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    let cart = await data.ensureActiveCart(S, C, "TRY");
    cart = await data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: cart.version, variantId: "v1", quantity: 995 });
    cart = await data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: cart.version, variantId: "v1", quantity: 20 });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(999);
    expect(cart.version).toBe(3);
  });

  it("rejects a stale version with CartStaleError (no mutation)", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    const cart = await data.ensureActiveCart(S, C, "TRY");
    await expect(
      data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: cart.version + 5, variantId: "v1", quantity: 1 }),
    ).rejects.toBeInstanceOf(CartStaleError);
    const reread = await data.findActiveCart(S, C);
    expect(reread?.version).toBe(1);
    expect(reread?.lines).toHaveLength(0);
  });

  it("rejects a 101st distinct line with CartLineLimit (cap)", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    let cart = await data.ensureActiveCart(S, C, "TRY");
    for (let i = 0; i < 100; i++) {
      cart = await data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: cart.version, variantId: `v${i}`, quantity: 1 });
    }
    await expect(
      data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: cart.version, variantId: "overflow", quantity: 1 }),
    ).rejects.toThrow(/CART_LINE_LIMIT/);
  });
});

describe("cart data: setLineQuantity / deleteLine (tenant-scoped)", () => {
  it("sets quantity, and quantity 0 removes the line", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    let cart = await data.ensureActiveCart(S, C, "TRY");
    cart = await data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: cart.version, variantId: "v1", quantity: 3 });
    const lineId = cart.lines[0].id;
    cart = await data.setLineQuantity({ storeId: S, customerId: C, expectedVersion: cart.version, lineId, quantity: 7 });
    expect(cart.lines[0].quantity).toBe(7);
    cart = await data.setLineQuantity({ storeId: S, customerId: C, expectedVersion: cart.version, lineId, quantity: 0 });
    expect(cart.lines).toHaveLength(0);
  });

  it("404s a line that belongs to another customer's cart", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    let mine = await data.ensureActiveCart(S, C, "TRY");
    mine = await data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: mine.version, variantId: "v1", quantity: 1 });
    const otherCart = await data.ensureActiveCart(S, "cust-2", "TRY");
    const other = await data.addOrIncrementLine({ storeId: S, customerId: "cust-2", expectedVersion: otherCart.version, variantId: "v9", quantity: 1 });
    const foreignLineId = other.lines[0].id;
    await expect(
      data.deleteLine({ storeId: S, customerId: C, expectedVersion: mine.version, lineId: foreignLineId }),
    ).rejects.toBeInstanceOf(CartLineNotFoundError);
  });
});

describe("cart data: mergeGuestItems (deterministic)", () => {
  it("merges valid guest items into the active cart and reports overflow", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    const seeded = await data.ensureActiveCart(S, C, "TRY");
    await data.addOrIncrementLine({ storeId: S, customerId: C, expectedVersion: seeded.version, variantId: "v1", quantity: 2 });
    const { cart: merged, result } = await data.mergeGuestItems({
      storeId: S, customerId: C, currency: "TRY",
      guestItems: [{ variantId: "v1", quantity: 3 }, { variantId: "v2", quantity: 1 }, { variantId: "bad", quantity: 1 }],
      validVariantIds: new Set(["v1", "v2"]),
    });
    expect(merged.lines).toEqual([
      expect.objectContaining({ variantId: "v1", quantity: 5 }),
      expect.objectContaining({ variantId: "v2", quantity: 1 }),
    ]);
    expect(result.skipped).toBe(0);
    expect(merged.version).toBeGreaterThan(1);
  });
});

describe("cart data: markConverted + sweepExpired", () => {
  it("marks the active cart CONVERTED and a new ensure lazily creates a fresh one", async () => {
    const { db } = fakeDb();
    const data = createCartData(db as never);
    const cart = await data.ensureActiveCart(S, C, "TRY");
    await data.markConverted({ storeId: S, customerId: C });
    expect(await data.findActiveCart(S, C)).toBeNull();
    const fresh = await data.ensureActiveCart(S, C, "TRY");
    expect(fresh.id).not.toBe(cart.id);
    expect(fresh.status).toBe("ACTIVE");
  });

  it("marks stale ACTIVE carts EXPIRED via sweep (idempotent second pass = 0)", async () => {
    const { db, carts } = fakeDb();
    const data = createCartData(db as never);
    await data.ensureActiveCart(S, C, "TRY");
    carts[0].lastActivityAt = new Date("2020-01-01");
    const n = await data.sweepExpired({ olderThan: new Date("2021-01-01"), limit: 50 });
    expect(n).toBe(1);
    expect(carts[0].status).toBe("EXPIRED");
    const again = await data.sweepExpired({ olderThan: new Date("2021-01-01"), limit: 50 });
    expect(again).toBe(0);
  });
});
