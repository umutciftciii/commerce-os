import { describe, expect, it } from "vitest";
import {
  addItem,
  decodeCartToken,
  encodeCartToken,
  removeItem,
  sanitizeItems,
  upsertItem,
} from "../lib/cart-token";

/**
 * Vitrin sepet token'i (F3B.1). Saf encode/decode + imza ve kalem mutasyon
 * yardimcilari. Cookie yalnizca {variantId, quantity} REFERANSI tutar; fiyat/
 * stok/uygunluk burada YOKTUR (gateway'de cozulur). Imza, kurcalanmis cookie'yi
 * reddeder; nihai guvenlik order aninda sunucu dogrulamasidir.
 */
const SECRET = "test-cart-secret";

describe("storefront-web · cart token", () => {
  it("encodes and decodes a signed cart round-trip", () => {
    const items = [{ variantId: "v1", quantity: 2 }];
    const token = encodeCartToken(items, SECRET);
    expect(decodeCartToken(token, SECRET)).toEqual(items);
  });

  it("rejects a tampered payload (signature mismatch -> empty cart)", () => {
    const token = encodeCartToken([{ variantId: "v1", quantity: 2 }], SECRET);
    const [payload, signature] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify([{ variantId: "v1", quantity: 999 }])).toString("base64url")}.${signature}`;
    expect(decodeCartToken(tampered, SECRET)).toEqual([]);
    // Yanlis secret de reddedilir.
    expect(decodeCartToken(`${payload}.${signature}`, "other-secret")).toEqual([]);
  });

  it("treats missing/garbage cookie as an empty cart", () => {
    expect(decodeCartToken(undefined, SECRET)).toEqual([]);
    expect(decodeCartToken("", SECRET)).toEqual([]);
    expect(decodeCartToken("garbage-no-dot", SECRET)).toEqual([]);
  });

  it("sanitizes invalid quantities and merges duplicate variants", () => {
    const result = sanitizeItems([
      { variantId: "v1", quantity: 2 },
      { variantId: "v1", quantity: 3 },
      { variantId: "v2", quantity: 0 },
      { variantId: "", quantity: 5 },
      { variantId: "v3", quantity: -4 },
    ]);
    expect(result).toEqual([{ variantId: "v1", quantity: 5 }]);
  });

  it("updates a line quantity and removes it when quantity <= 0", () => {
    const items = [{ variantId: "v1", quantity: 2 }];
    expect(upsertItem(items, "v1", 5)).toEqual([{ variantId: "v1", quantity: 5 }]);
    expect(upsertItem(items, "v1", 0)).toEqual([]);
  });

  it("removes a variant entirely", () => {
    const items = [
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1 },
    ];
    expect(removeItem(items, "v1")).toEqual([{ variantId: "v2", quantity: 1 }]);
  });

  it("adds to the existing quantity for the same variant", () => {
    const items = [{ variantId: "v1", quantity: 2 }];
    expect(addItem(items, "v1", 3)).toEqual([{ variantId: "v1", quantity: 5 }]);
    expect(addItem(items, "v2", 1)).toEqual([
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1 },
    ]);
  });

  it("caps quantity at the per-line maximum", () => {
    expect(addItem([{ variantId: "v1", quantity: 998 }], "v1", 50)).toEqual([
      { variantId: "v1", quantity: 999 },
    ]);
  });
});
