import { describe, expect, it } from "vitest";
import {
  addWishlistRef,
  decodeWishlistToken,
  encodeWishlistToken,
  removeWishlistRef,
  sanitizeWishlist,
  toggleWishlistRef,
  wishlistTokenLimits,
} from "../lib/wishlist-token";

/**
 * TODO-159D (ADR-093) — Misafir wishlist token'ı (SAF) birim testleri.
 * encode/decode roundtrip + imza doğrulama + sanitize (dedup/boş/taşma) + toggle idempotency.
 */
const SECRET = "test-secret";

describe("wishlist-token", () => {
  it("encode/decode roundtrip korunur", () => {
    const items = [{ productId: "a" }, { productId: "b" }];
    const token = encodeWishlistToken(items, SECRET);
    expect(decodeWishlistToken(token, SECRET)).toEqual(items);
  });

  it("kurcalanmış/yanlış imza → boş", () => {
    const token = encodeWishlistToken([{ productId: "a" }], SECRET);
    expect(decodeWishlistToken(token, "wrong-secret")).toEqual([]);
    expect(decodeWishlistToken(`${token}x`, SECRET)).toEqual([]);
    expect(decodeWishlistToken(undefined, SECRET)).toEqual([]);
  });

  it("sanitize: boş id atılır, tekrarlar birleşir", () => {
    expect(sanitizeWishlist([{ productId: "a" }, { productId: " " }, { productId: "a" }])).toEqual([
      { productId: "a" },
    ]);
  });

  it("sanitize: MAX_ITEMS taşmasında en yeniler korunur", () => {
    const many = Array.from({ length: wishlistTokenLimits.MAX_ITEMS + 5 }, (_, i) => ({ productId: `p${i}` }));
    const result = sanitizeWishlist(many);
    expect(result).toHaveLength(wishlistTokenLimits.MAX_ITEMS);
    expect(result[result.length - 1].productId).toBe(`p${many.length - 1}`);
  });

  it("add idempotent + remove", () => {
    let items = addWishlistRef([], "a");
    items = addWishlistRef(items, "a");
    expect(items).toEqual([{ productId: "a" }]);
    items = removeWishlistRef(items, "a");
    expect(items).toEqual([]);
  });

  it("toggle: durum belirtilmezse ters çevirir; belirtilirse idempotent", () => {
    const t1 = toggleWishlistRef([], "a");
    expect(t1.saved).toBe(true);
    const t2 = toggleWishlistRef(t1.items, "a");
    expect(t2.saved).toBe(false);
    const t3 = toggleWishlistRef([], "a", true);
    expect(t3.saved).toBe(true);
    const t4 = toggleWishlistRef(t3.items, "a", true);
    expect(t4.saved).toBe(true);
    expect(t4.items).toHaveLength(1);
  });
});
