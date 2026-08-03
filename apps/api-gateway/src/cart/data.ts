/**
 * TODO-167 (ADR-266) — Persistent Cart veri katmani (Prisma).
 *
 * Cart yalniz REFERANS tutar (variant + quantity). Mutation'lar ATOMIK version-conditional
 * update ile korunur (iki-cihaz yaris → 409 CART_STALE). Deterministik login-merge + quantity
 * kelepcesi + 100-satir siniri kararlari SAF cart-core'dan gelir. Store/customer scoping her
 * sorguya islenir (tenant fail-closed). DB-seviyesi "tek ACTIVE cart" invariant'i partial-unique
 * index + P2002 yutma ile idempotenttir.
 */
import type { PrismaClient } from "@prisma/client";
import {
  CART_MAX_LINES,
  type CartLineRef,
  clampQuantity,
  mergeCartLines,
  type MergeResult,
} from "./cart-core.js";

export type CartStatusValue = "ACTIVE" | "CONVERTED" | "MERGED" | "EXPIRED";

export interface CartLineRecord {
  id: string;
  storeId: string;
  cartId: string;
  variantId: string;
  quantity: number;
  // TODO-168 (ADR-267) — add-time REFERANS snapshot (baseline yoksa hepsi null).
  addedUnitPriceMinor: number | null;
  addedListPriceMinor: number | null;
  addedDiscountedUnitPriceMinor: number | null;
  addedCurrency: string | null;
  addedInStock: boolean | null;
  addedOrderable: boolean | null;
  addedAt: Date | null;
}

/** TODO-168 — Bir satır için baseline snapshot yazımı girdisi (addedAt null olanlar için). */
export interface CartLineBaselineInput {
  variantId: string;
  unitPriceMinor: number;
  listPriceMinor: number | null;
  discountedUnitPriceMinor: number | null;
  currency: string;
  inStock: boolean;
  orderable: boolean;
}

export interface CartRecord {
  id: string;
  storeId: string;
  customerId: string;
  status: CartStatusValue;
  version: number;
  currency: string;
  lastActivityAt: Date;
  convertedAt: Date | null;
  mergedAt: Date | null;
  expiredAt: Date | null;
  lines: CartLineRecord[];
}

export class CartStaleError extends Error {
  constructor() {
    super("CART_STALE");
    this.name = "CartStaleError";
  }
}
export class CartInactiveError extends Error {
  constructor() {
    super("CART_INACTIVE");
    this.name = "CartInactiveError";
  }
}
export class CartLineLimitError extends Error {
  constructor() {
    super("CART_LINE_LIMIT");
    this.name = "CartLineLimitError";
  }
}
export class CartLineNotFoundError extends Error {
  constructor() {
    super("CART_LINE_NOT_FOUND");
    this.name = "CartLineNotFoundError";
  }
}

export interface CartData {
  findActiveCart(storeId: string, customerId: string): Promise<CartRecord | null>;
  ensureActiveCart(storeId: string, customerId: string, currency: string): Promise<CartRecord>;
  addOrIncrementLine(p: {
    storeId: string;
    customerId: string;
    expectedVersion: number;
    variantId: string;
    quantity: number;
  }): Promise<CartRecord>;
  setLineQuantity(p: {
    storeId: string;
    customerId: string;
    expectedVersion: number;
    lineId: string;
    quantity: number;
  }): Promise<CartRecord>;
  deleteLine(p: {
    storeId: string;
    customerId: string;
    expectedVersion: number;
    lineId: string;
  }): Promise<CartRecord>;
  reconcile(p: {
    storeId: string;
    customerId: string;
    expectedVersion: number;
    keepVariantIds: string[];
  }): Promise<CartRecord>;
  mergeGuestItems(p: {
    storeId: string;
    customerId: string;
    currency: string;
    guestItems: CartLineRef[];
    validVariantIds: Set<string>;
  }): Promise<{ cart: CartRecord; result: MergeResult }>;
  markConverted(p: { storeId: string; customerId: string }): Promise<void>;
  sweepExpired(p: { olderThan: Date; limit: number }): Promise<number>;
  /**
   * TODO-168 (ADR-267) — Snapshot'ı OLMAYAN (addedAt IS NULL) satırlara baseline yazar (idempotent:
   * yalnız null'ları set eder). add/re-add → yeni baseline; quantity/increment DOKUNMAZ (snapshot korunur).
   */
  baselineLineSnapshots(p: {
    storeId: string;
    cartId: string;
    baselines: CartLineBaselineInput[];
    now?: Date;
  }): Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Prisma cart+lines satirini domain CartRecord'a cevirir (satirlar createdAt sirali). */
function toRecord(row: {
  id: string;
  storeId: string;
  customerId: string;
  status: string;
  version: number;
  currency: string;
  lastActivityAt: Date;
  convertedAt: Date | null;
  mergedAt: Date | null;
  expiredAt: Date | null;
  lines: Array<{
    id: string;
    storeId: string;
    cartId: string;
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
}): CartRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    customerId: row.customerId,
    status: row.status as CartStatusValue,
    version: row.version,
    currency: row.currency,
    lastActivityAt: row.lastActivityAt,
    convertedAt: row.convertedAt,
    mergedAt: row.mergedAt,
    expiredAt: row.expiredAt,
    lines: row.lines.map((l) => ({
      id: l.id,
      storeId: l.storeId,
      cartId: l.cartId,
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
  };
}

const includeLines = { lines: { orderBy: { createdAt: "asc" as const } } };

export function createCartData(db: PrismaClient): CartData {
  async function findActiveRow(storeId: string, customerId: string) {
    return db.cart.findFirst({
      where: { storeId, customerId, status: "ACTIVE" },
      include: includeLines,
    });
  }

  async function ensureActiveCart(storeId: string, customerId: string, currency: string): Promise<CartRecord> {
    const existing = await findActiveRow(storeId, customerId);
    if (existing) return toRecord(existing);
    try {
      const created = await db.cart.create({
        data: { storeId, customerId, currency, status: "ACTIVE", version: 1 },
        include: includeLines,
      });
      return toRecord(created);
    } catch (error) {
      // Partial-unique yarisi (iki es-zamanli ilk-erisim): mevcut ACTIVE cart'i yeniden oku.
      if (isUniqueViolation(error)) {
        const row = await findActiveRow(storeId, customerId);
        if (row) return toRecord(row);
      }
      throw error;
    }
  }

  /**
   * ATOMIK version-conditional mutation. `updateMany(where version=expected AND status=ACTIVE)`
   * kilidi altinda: count 0 → stale/inactive ayirt et; degilse satir op'unu calistir ve guncel
   * cart'i (lines dahil) yeniden oku. Throw → tum txn rollback (version artisi geri alinir).
   */
  async function mutate(
    storeId: string,
    customerId: string,
    expectedVersion: number,
    op: (tx: PrismaClient, cartId: string) => Promise<void>,
  ): Promise<CartRecord> {
    const active = await db.cart.findFirst({ where: { storeId, customerId, status: "ACTIVE" } });
    if (!active) throw new CartInactiveError();
    const cartId = active.id;
    return db.$transaction(async (tx) => {
      const now = new Date();
      const bumped = await tx.cart.updateMany({
        where: { id: cartId, version: expectedVersion, status: "ACTIVE" },
        data: { version: { increment: 1 }, lastActivityAt: now },
      });
      if (bumped.count === 0) {
        const current = await tx.cart.findFirst({ where: { id: cartId } });
        if (!current || current.status !== "ACTIVE") throw new CartInactiveError();
        throw new CartStaleError();
      }
      await op(tx as unknown as PrismaClient, cartId);
      const updated = await tx.cart.findFirst({ where: { id: cartId }, include: includeLines });
      return toRecord(updated!);
    });
  }

  return {
    async findActiveCart(storeId, customerId) {
      const row = await findActiveRow(storeId, customerId);
      return row ? toRecord(row) : null;
    },

    ensureActiveCart,

    async addOrIncrementLine({ storeId, customerId, expectedVersion, variantId, quantity }) {
      return mutate(storeId, customerId, expectedVersion, async (tx, cartId) => {
        const existing = await tx.cartLine.findFirst({ where: { cartId, variantId } });
        if (existing) {
          await tx.cartLine.update({
            where: { id: existing.id },
            data: { quantity: clampQuantity(existing.quantity + quantity) },
          });
          return;
        }
        const count = await tx.cartLine.count({ where: { cartId } });
        if (count >= CART_MAX_LINES) throw new CartLineLimitError();
        await tx.cartLine.create({
          data: { storeId, cartId, variantId, quantity: clampQuantity(quantity) },
        });
      });
    },

    async setLineQuantity({ storeId, customerId, expectedVersion, lineId, quantity }) {
      return mutate(storeId, customerId, expectedVersion, async (tx, cartId) => {
        const line = await tx.cartLine.findFirst({ where: { id: lineId, cartId, storeId } });
        if (!line) throw new CartLineNotFoundError();
        if (quantity <= 0) {
          await tx.cartLine.delete({ where: { id: line.id } });
          return;
        }
        await tx.cartLine.update({ where: { id: line.id }, data: { quantity: clampQuantity(quantity) } });
      });
    },

    async deleteLine({ storeId, customerId, expectedVersion, lineId }) {
      return mutate(storeId, customerId, expectedVersion, async (tx, cartId) => {
        const line = await tx.cartLine.findFirst({ where: { id: lineId, cartId, storeId } });
        if (!line) throw new CartLineNotFoundError();
        await tx.cartLine.delete({ where: { id: line.id } });
      });
    },

    async reconcile({ storeId, customerId, expectedVersion, keepVariantIds }) {
      return mutate(storeId, customerId, expectedVersion, async (tx, cartId) => {
        // Cozulemeyen (silinmis/pasif/baska-store) varyant satirlarini budar; keep listesi
        // route'ta catalog otoritesinden turetilir (istemci kalemine guvenilmez).
        await tx.cartLine.deleteMany({ where: { cartId, variantId: { notIn: keepVariantIds } } });
      });
    },

    async mergeGuestItems({ storeId, customerId, currency, guestItems, validVariantIds }) {
      const cart = await ensureActiveCart(storeId, customerId, currency);
      const existingRefs: CartLineRef[] = cart.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      }));
      const validGuest = guestItems.filter((g) => validVariantIds.has(g.variantId));
      const result = mergeCartLines(existingRefs, validGuest);
      const updated = await db.$transaction(async (tx) => {
        const now = new Date();
        await tx.cart.updateMany({
          where: { id: cart.id, status: "ACTIVE" },
          data: { version: { increment: 1 }, lastActivityAt: now },
        });
        await tx.cartLine.deleteMany({ where: { cartId: cart.id } });
        for (const ref of result.lines) {
          await tx.cartLine.create({
            data: { storeId, cartId: cart.id, variantId: ref.variantId, quantity: ref.quantity },
          });
        }
        const row = await tx.cart.findFirst({ where: { id: cart.id }, include: includeLines });
        return toRecord(row!);
      });
      return { cart: updated, result };
    },

    async markConverted({ storeId, customerId }) {
      const active = await db.cart.findFirst({ where: { storeId, customerId, status: "ACTIVE" } });
      if (!active) return;
      await db.$transaction(async (tx) => {
        const now = new Date();
        await tx.cart.updateMany({
          where: { id: active.id, status: "ACTIVE" },
          data: { status: "CONVERTED", convertedAt: now },
        });
        await tx.cartLine.deleteMany({ where: { cartId: active.id } });
      });
    },

    async baselineLineSnapshots({ storeId, cartId, baselines, now }) {
      if (baselines.length === 0) return;
      const at = now ?? new Date();
      for (const b of baselines) {
        // addedAt IS NULL guard → idempotent: mevcut baseline'i ASLA ezmez (yeni fiyat baseline'i kaydırmaz).
        await db.cartLine.updateMany({
          where: { cartId, storeId, variantId: b.variantId, addedAt: null },
          data: {
            addedUnitPriceMinor: b.unitPriceMinor,
            addedListPriceMinor: b.listPriceMinor,
            addedDiscountedUnitPriceMinor: b.discountedUnitPriceMinor,
            addedCurrency: b.currency,
            addedInStock: b.inStock,
            addedOrderable: b.orderable,
            addedAt: at,
          },
        });
      }
    },

    async sweepExpired({ olderThan, limit }) {
      const stale = await db.cart.findMany({
        where: { status: "ACTIVE", lastActivityAt: { lt: olderThan } },
        select: { id: true },
        take: limit,
      });
      if (stale.length === 0) return 0;
      const ids = stale.map((c) => c.id);
      const now = new Date();
      const res = await db.cart.updateMany({
        where: { id: { in: ids }, status: "ACTIVE" },
        data: { status: "EXPIRED", expiredAt: now },
      });
      return res.count;
    },
  };
}
