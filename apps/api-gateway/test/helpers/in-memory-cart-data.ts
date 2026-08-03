/**
 * TODO-167 (ADR-266) — In-memory CartData test double (route testleri icin).
 *
 * CartData sozlesmesini sadik semantikle uygular (version bump, CART_STALE, 100-satir,
 * quantity kelepcesi, tenant-scoped satir sahipligi, deterministik guest-merge). Route
 * testleri bunu enjekte eder; gercek Prisma modulu (createCartData) ayni sozlesmeyi tutar.
 */
import {
  CART_MAX_LINES,
  clampQuantity,
  mergeCartLines,
  type CartLineRef,
} from "../../src/cart/cart-core.js";
import {
  CartInactiveError,
  CartLineLimitError,
  CartLineNotFoundError,
  CartStaleError,
  type CartData,
  type CartRecord,
} from "../../src/cart/data.js";

interface MemCart {
  id: string;
  storeId: string;
  customerId: string;
  status: "ACTIVE" | "CONVERTED" | "MERGED" | "EXPIRED";
  version: number;
  currency: string;
  lastActivityAt: Date;
  convertedAt: Date | null;
  mergedAt: Date | null;
  expiredAt: Date | null;
  lines: Array<{
    id: string;
    variantId: string;
    quantity: number;
    addedUnitPriceMinor: number | null;
    addedListPriceMinor: number | null;
    addedDiscountedUnitPriceMinor: number | null;
    addedCurrency: string | null;
    addedInStock: boolean | null;
    addedOrderable: boolean | null;
    addedAt: Date | null;
  }>;
}

/** Yeni bir mem-satır (snapshot alanlari null; baseline sonradan yazilir). */
function memLine(id: string, variantId: string, quantity: number) {
  return {
    id,
    variantId,
    quantity,
    addedUnitPriceMinor: null,
    addedListPriceMinor: null,
    addedDiscountedUnitPriceMinor: null,
    addedCurrency: null,
    addedInStock: null,
    addedOrderable: null,
    addedAt: null,
  };
}

export function createInMemoryCartData(): CartData {
  const carts: MemCart[] = [];
  let seq = 0;
  const key = (s: string, c: string) => `${s}::${c}`;

  const active = (storeId: string, customerId: string) =>
    carts.find((c) => c.storeId === storeId && c.customerId === customerId && c.status === "ACTIVE");

  const toRecord = (c: MemCart): CartRecord => ({
    id: c.id,
    storeId: c.storeId,
    customerId: c.customerId,
    status: c.status,
    version: c.version,
    currency: c.currency,
    lastActivityAt: c.lastActivityAt,
    convertedAt: c.convertedAt,
    mergedAt: c.mergedAt,
    expiredAt: c.expiredAt,
    lines: c.lines.map((l) => ({
      id: l.id,
      storeId: c.storeId,
      cartId: c.id,
      variantId: l.variantId,
      quantity: l.quantity,
      addedUnitPriceMinor: l.addedUnitPriceMinor,
      addedListPriceMinor: l.addedListPriceMinor,
      addedDiscountedUnitPriceMinor: l.addedDiscountedUnitPriceMinor,
      addedCurrency: l.addedCurrency,
      addedInStock: l.addedInStock,
      addedOrderable: l.addedOrderable,
      addedAt: l.addedAt,
    })),
  });

  function ensure(storeId: string, customerId: string, currency: string): MemCart {
    let cart = active(storeId, customerId);
    if (!cart) {
      cart = {
        id: `cart-${key(storeId, customerId)}-${++seq}`,
        storeId,
        customerId,
        status: "ACTIVE",
        version: 1,
        currency,
        lastActivityAt: new Date(),
        convertedAt: null,
        mergedAt: null,
        expiredAt: null,
        lines: [],
      };
      carts.push(cart);
    }
    return cart;
  }

  function mutate(storeId: string, customerId: string, expectedVersion: number, op: (c: MemCart) => void): CartRecord {
    const cart = active(storeId, customerId);
    if (!cart) throw new CartInactiveError();
    if (cart.version !== expectedVersion) throw new CartStaleError();
    op(cart);
    cart.version += 1;
    cart.lastActivityAt = new Date();
    return toRecord(cart);
  }

  return {
    async findActiveCart(storeId, customerId) {
      const c = active(storeId, customerId);
      return c ? toRecord(c) : null;
    },
    async ensureActiveCart(storeId, customerId, currency) {
      return toRecord(ensure(storeId, customerId, currency));
    },
    async addOrIncrementLine({ storeId, customerId, expectedVersion, variantId, quantity }) {
      return mutate(storeId, customerId, expectedVersion, (cart) => {
        const existing = cart.lines.find((l) => l.variantId === variantId);
        if (existing) {
          existing.quantity = clampQuantity(existing.quantity + quantity);
          return;
        }
        if (cart.lines.length >= CART_MAX_LINES) throw new CartLineLimitError();
        cart.lines.push(memLine(`line-${++seq}`, variantId, clampQuantity(quantity)));
      });
    },
    async setLineQuantity({ storeId, customerId, expectedVersion, lineId, quantity }) {
      return mutate(storeId, customerId, expectedVersion, (cart) => {
        const line = cart.lines.find((l) => l.id === lineId);
        if (!line) throw new CartLineNotFoundError();
        if (quantity <= 0) {
          cart.lines = cart.lines.filter((l) => l.id !== lineId);
          return;
        }
        line.quantity = clampQuantity(quantity);
      });
    },
    async deleteLine({ storeId, customerId, expectedVersion, lineId }) {
      return mutate(storeId, customerId, expectedVersion, (cart) => {
        const line = cart.lines.find((l) => l.id === lineId);
        if (!line) throw new CartLineNotFoundError();
        cart.lines = cart.lines.filter((l) => l.id !== lineId);
      });
    },
    async reconcile({ storeId, customerId, expectedVersion, keepVariantIds }) {
      return mutate(storeId, customerId, expectedVersion, (cart) => {
        const keep = new Set(keepVariantIds);
        cart.lines = cart.lines.filter((l) => keep.has(l.variantId));
      });
    },
    async mergeGuestItems({ storeId, customerId, currency, guestItems, validVariantIds }) {
      const cart = ensure(storeId, customerId, currency);
      const existing: CartLineRef[] = cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
      const validGuest = guestItems.filter((g) => validVariantIds.has(g.variantId));
      const result = mergeCartLines(existing, validGuest);
      cart.lines = result.lines.map((l) => memLine(`line-${++seq}`, l.variantId, l.quantity));
      cart.version += 1;
      cart.lastActivityAt = new Date();
      return { cart: toRecord(cart), result };
    },
    async markConverted({ storeId, customerId }) {
      const cart = active(storeId, customerId);
      if (!cart) return;
      cart.status = "CONVERTED";
      cart.convertedAt = new Date();
      cart.lines = [];
    },
    async baselineLineSnapshots({ storeId, cartId, baselines, now }) {
      const cart = carts.find((c) => c.id === cartId && c.storeId === storeId);
      if (!cart) return;
      const at = now ?? new Date();
      for (const b of baselines) {
        const line = cart.lines.find((l) => l.variantId === b.variantId && l.addedAt === null);
        if (!line) continue;
        line.addedUnitPriceMinor = b.unitPriceMinor;
        line.addedListPriceMinor = b.listPriceMinor;
        line.addedDiscountedUnitPriceMinor = b.discountedUnitPriceMinor;
        line.addedCurrency = b.currency;
        line.addedInStock = b.inStock;
        line.addedOrderable = b.orderable;
        line.addedAt = at;
      }
    },
    async sweepExpired({ olderThan, limit }) {
      const stale = carts
        .filter((c) => c.status === "ACTIVE" && c.lastActivityAt < olderThan)
        .slice(0, limit);
      for (const c of stale) {
        c.status = "EXPIRED";
        c.expiredAt = new Date();
      }
      return stale.length;
    },
  };
}
