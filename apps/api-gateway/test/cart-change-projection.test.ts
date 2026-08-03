/**
 * TODO-168 (ADR-267) — Cart-change projeksiyon köprüsü testleri.
 * Kapsam: PublicCart satırından snapshot/projeksiyon türetme · baseline üretimi (snapshot yoksa) ·
 * line.change + cart.changes/özet bayrak işleme · DB satırından snapshot türetme (null-guard).
 */
import { describe, expect, it } from "vitest";
import type { PublicCart, PublicCartLine } from "@commerce-os/contracts";
import {
  attachChangesToCart,
  currentProjectionFromLine,
  snapshotFromDbLine,
  snapshotFromLine,
} from "../src/cart-changes/projection.js";
import type { CartLineSnapshot } from "../src/cart-changes/change-engine.js";

function line(over: Partial<PublicCartLine> = {}): PublicCartLine {
  return {
    variantId: "v1",
    productSlug: "p-1",
    title: "Ürün",
    variantTitle: "Standart",
    sku: "SKU-1",
    quantity: 1,
    availableQuantity: 1,
    unitPriceMinor: 10_000,
    lineTotalMinor: 10_000,
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
    ...over,
  };
}

function cart(lines: PublicCartLine[]): PublicCart {
  return {
    storeSlug: "store-a",
    currency: "TRY",
    lines,
    subtotalMinor: 0,
    itemCount: 0,
    checkoutReady: true,
    summary: {} as never,
    shipping: {} as never,
    changes: [],
    unacknowledgedChangeCount: 0,
    hasBlockingChanges: false,
    hasWarnings: false,
    requiresAcknowledgement: false,
  };
}

const NONE: ReadonlySet<string> = new Set();

describe("projection: derive from line", () => {
  it("UNAVAILABLE line → not orderable", () => {
    expect(currentProjectionFromLine(line({ status: "UNAVAILABLE" })).orderable).toBe(false);
    expect(snapshotFromLine(line({ status: "UNAVAILABLE" })).orderable).toBe(false);
  });
  it("OUT_OF_STOCK line → orderable but not in stock", () => {
    const proj = currentProjectionFromLine(line({ status: "OUT_OF_STOCK", inStock: false }));
    expect(proj.orderable).toBe(true);
    expect(proj.inStock).toBe(false);
  });
  it("QUANTITY_ADJUSTED surfaced with requested/available", () => {
    const proj = currentProjectionFromLine(line({ status: "QUANTITY_ADJUSTED", quantity: 5, availableQuantity: 2 }));
    expect(proj.quantityAdjusted).toBe(true);
    expect(proj.requestedQuantity).toBe(5);
    expect(proj.availableQuantity).toBe(2);
  });
});

describe("projection: attachChangesToCart", () => {
  it("no snapshot → no change, but baseline produced for the line", () => {
    const res = attachChangesToCart(cart([line()]), { storeId: "s", cartId: "c" }, new Map(), NONE);
    expect(res.cart.changes).toHaveLength(0);
    expect(res.cart.lines[0]?.change).toBeNull();
    expect(res.baselines).toHaveLength(1);
    expect(res.baselines[0]).toMatchObject({ variantId: "v1", unitPriceMinor: 10_000, currency: "TRY" });
  });

  it("price increase → WARN change on line + cart flags; no baseline (snapshot present)", () => {
    const snap = new Map<string, CartLineSnapshot>([
      ["v1", { unitPriceMinor: 8_000, listPriceMinor: null, discountedUnitPriceMinor: null, currency: "TRY", inStock: true, orderable: true }],
    ]);
    const res = attachChangesToCart(cart([line({ unitPriceMinor: 10_000 })]), { storeId: "s", cartId: "c" }, snap, NONE);
    expect(res.cart.lines[0]?.change?.changeType).toBe("PRICE_INCREASED");
    expect(res.cart.hasWarnings).toBe(true);
    expect(res.cart.requiresAcknowledgement).toBe(true);
    expect(res.cart.unacknowledgedChangeCount).toBe(1);
    expect(res.baselines).toHaveLength(0);
    expect(res.cart.changes[0]?.variantId).toBe("v1");
  });

  it("acknowledged fingerprint clears the WARN gate", () => {
    const snap = new Map<string, CartLineSnapshot>([
      ["v1", { unitPriceMinor: 8_000, listPriceMinor: null, discountedUnitPriceMinor: null, currency: "TRY", inStock: true, orderable: true }],
    ]);
    const first = attachChangesToCart(cart([line({ unitPriceMinor: 10_000 })]), { storeId: "s", cartId: "c" }, snap, NONE);
    const fp = first.cart.changes[0]!.fingerprint;
    const acked = attachChangesToCart(cart([line({ unitPriceMinor: 10_000 })]), { storeId: "s", cartId: "c" }, snap, new Set([fp]));
    expect(acked.cart.requiresAcknowledgement).toBe(false);
    expect(acked.cart.lines[0]?.change?.acknowledged).toBe(true);
  });
});

describe("projection: snapshotFromDbLine null-guard", () => {
  it("returns null when addedAt missing (legacy line)", () => {
    expect(
      snapshotFromDbLine({
        addedUnitPriceMinor: 100,
        addedListPriceMinor: null,
        addedDiscountedUnitPriceMinor: null,
        addedCurrency: "TRY",
        addedInStock: true,
        addedOrderable: true,
        addedAt: null,
      }),
    ).toBeNull();
  });
  it("returns snapshot when baseline present", () => {
    const s = snapshotFromDbLine({
      addedUnitPriceMinor: 100,
      addedListPriceMinor: 200,
      addedDiscountedUnitPriceMinor: null,
      addedCurrency: "TRY",
      addedInStock: true,
      addedOrderable: false,
      addedAt: new Date(0),
    });
    expect(s).toMatchObject({ unitPriceMinor: 100, listPriceMinor: 200, orderable: false });
  });
});
