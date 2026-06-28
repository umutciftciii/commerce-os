import { describe, expect, it } from "vitest";
import { maxPurchasableQuantity } from "../lib/catalog-types";

/**
 * Stok-duyarli PDP adet limiti (TODO-072 Kapsam 1). Saf turetme: kullanici
 * stoktan fazla adet secemez; varyant degisince yeni stok limitine clamp edilir.
 * Server reconcile yine son guvenliktir; bu yalniz istemci clamp'idir.
 */
describe("storefront · maxPurchasableQuantity (inventory-aware PDP quantity)", () => {
  it("caps the quantity at the variant's available stock when stock is the binding limit", () => {
    // Stok 2, magaza siniri yok → en fazla 2 (kullanici 3 secemez).
    expect(maxPurchasableQuantity({ minQuantity: 1, storeMax: null, available: 2 })).toBe(2);
  });

  it("uses the lower of store max and available stock", () => {
    expect(maxPurchasableQuantity({ minQuantity: 1, storeMax: 5, available: 2 })).toBe(2);
    expect(maxPurchasableQuantity({ minQuantity: 1, storeMax: 2, available: 9 })).toBe(2);
  });

  it("falls back to the store max (or default 99) when stock is unknown", () => {
    expect(maxPurchasableQuantity({ minQuantity: 1, storeMax: 4, available: null })).toBe(4);
    expect(maxPurchasableQuantity({ minQuantity: 1, storeMax: null, available: null })).toBe(99);
  });

  it("never drops below the minimum order quantity", () => {
    // Stok 0 olsa bile fonksiyon min'in altina inmez (out-of-stock UI ayrica engeller).
    expect(maxPurchasableQuantity({ minQuantity: 1, storeMax: 10, available: 0 })).toBe(1);
  });

  it("clamps a higher selection down when switching to a lower-stock variant", () => {
    // Onceki varyant stok 5 → adet 3 secildi; yeni varyant stok 1 → max 1'e duser.
    const previousQty = 3;
    const newMax = maxPurchasableQuantity({ minQuantity: 1, storeMax: null, available: 1 });
    const clamped = Math.min(Math.max(previousQty, 1), newMax);
    expect(clamped).toBe(1);
  });
});
