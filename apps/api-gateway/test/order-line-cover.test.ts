/**
 * BUG-CART-005 (Part 1) — Siparis GECMISI satir thumbnail'i.
 *
 * Sepetten FARKLI: siparis gecmisi tarihsel kayittir. Oncelik:
 *   1. satin alma ani SNAPSHOT'i (OrderLine.mediaStorageKey) — urun medyasi sonradan degisse bile SABIT,
 *   2. snapshot yoksa (eski siparis) MEVCUT efektif varyant medyasi (pickVariantCoverImage),
 *   3. o da yoksa urun birincil kapagi.
 * Anahtar = OrderLine.id (ayni variant iki farkli sipariste FARKLI snapshot tasiyabilir).
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildOrderLineCoverUrlMap,
  type ListProductImagesRichFn,
  type ResolveVariantMediaOptionsFn,
} from "../src/media/cover.js";

type Img = { storageKey: string; position: number; optionId: string | null };

const RED = "opt-red";
const BLUE = "opt-blue";
const AXIS = "attr-color";

describe("buildOrderLineCoverUrlMap (BUG-CART-005 / Part 1)", () => {
  it("prefers the purchase-time snapshot and does NOT query product images", async () => {
    const listProductImages = vi.fn<ListProductImagesRichFn>(async () => new Map());
    const resolveVariantMediaOptions = vi.fn<ResolveVariantMediaOptionsFn>(async () => new Map());

    const map = await buildOrderLineCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [
        {
          lineId: "line-a",
          productId: "prod-shoe",
          variantId: "v-red",
          mediaStorageKey: "snapshot-red.svg",
          mediaDefiningAttributeId: AXIS,
        },
      ],
    );

    expect(map.get("line-a")).toBe("/media/snapshot-red.svg");
    // Snapshot varsa gorsel sorgusu HIC yapilmaz (tarihsel sabitlik + N+1 yok).
    expect(listProductImages).not.toHaveBeenCalled();
    expect(resolveVariantMediaOptions).not.toHaveBeenCalled();
  });

  it("snapshot survives even if the CURRENT product media changed (immutability)", async () => {
    // Urun medyasi degismis (kirmizi->yesil) olsa bile snapshot'li satir eski gorseli korur.
    const listProductImages = vi.fn<ListProductImagesRichFn>(async () =>
      new Map<string, Img[]>([["prod-shoe", [{ storageKey: "green-now.svg", position: 0, optionId: RED }]]]),
    );
    const resolveVariantMediaOptions = vi.fn<ResolveVariantMediaOptionsFn>(async () =>
      new Map<string, string>([["v-red", RED]]),
    );

    const map = await buildOrderLineCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [
        {
          lineId: "line-hist",
          productId: "prod-shoe",
          variantId: "v-red",
          mediaStorageKey: "purchased-red.svg",
          mediaDefiningAttributeId: AXIS,
        },
      ],
    );

    expect(map.get("line-hist")).toBe("/media/purchased-red.svg");
  });

  it("legacy line (no snapshot) resolves the CURRENT effective variant media per color", async () => {
    const listProductImages = vi.fn<ListProductImagesRichFn>(async () =>
      new Map<string, Img[]>([
        [
          "prod-shoe",
          [
            { storageKey: "red.svg", position: 0, optionId: RED },
            { storageKey: "blue.svg", position: 1, optionId: BLUE },
          ],
        ],
      ]),
    );
    const resolveVariantMediaOptions = vi.fn<ResolveVariantMediaOptionsFn>(async () =>
      new Map<string, string>([
        ["v-red", RED],
        ["v-blue", BLUE],
      ]),
    );

    const map = await buildOrderLineCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [
        { lineId: "l-red", productId: "prod-shoe", variantId: "v-red", mediaStorageKey: null, mediaDefiningAttributeId: AXIS },
        { lineId: "l-blue", productId: "prod-shoe", variantId: "v-blue", mediaStorageKey: null, mediaDefiningAttributeId: AXIS },
      ],
    );

    expect(map.get("l-red")).toBe("/media/red.svg");
    expect(map.get("l-blue")).toBe("/media/blue.svg");
    // Snapshot'siz satirlarin urunleri icin TEK batched gorsel sorgusu (N+1 yok).
    expect(listProductImages).toHaveBeenCalledTimes(1);
    expect(listProductImages.mock.calls[0][2]).toBe(false);
  });

  it("legacy line without a media axis falls back to the product primary cover", async () => {
    const listProductImages = vi.fn<ListProductImagesRichFn>(async () =>
      new Map<string, Img[]>([["prod-mug", [{ storageKey: "mug.svg", position: 0, optionId: null }]]]),
    );
    const resolveVariantMediaOptions = vi.fn<ResolveVariantMediaOptionsFn>(async () => new Map());

    const map = await buildOrderLineCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [{ lineId: "l-mug", productId: "prod-mug", variantId: "v-mug", mediaStorageKey: null, mediaDefiningAttributeId: null }],
    );

    expect(map.get("l-mug")).toBe("/media/mug.svg");
    expect(resolveVariantMediaOptions).not.toHaveBeenCalled();
  });

  it("keys by lineId so the same variant in two orders can differ (snapshot vs legacy)", async () => {
    const listProductImages = vi.fn<ListProductImagesRichFn>(async () =>
      new Map<string, Img[]>([["prod-shoe", [{ storageKey: "current-red.svg", position: 0, optionId: RED }]]]),
    );
    const resolveVariantMediaOptions = vi.fn<ResolveVariantMediaOptionsFn>(async () =>
      new Map<string, string>([["v-red", RED]]),
    );

    const map = await buildOrderLineCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [
        // Eski siparis: snapshot ile "o gunku" gorsel.
        { lineId: "old", productId: "prod-shoe", variantId: "v-red", mediaStorageKey: "old-red.svg", mediaDefiningAttributeId: AXIS },
        // Yeni/legacy: snapshot yok → guncel efektif medya.
        { lineId: "new", productId: "prod-shoe", variantId: "v-red", mediaStorageKey: null, mediaDefiningAttributeId: AXIS },
      ],
    );

    expect(map.get("old")).toBe("/media/old-red.svg");
    expect(map.get("new")).toBe("/media/current-red.svg");
  });

  it("returns an empty map for no entries and never queries", async () => {
    const listProductImages = vi.fn<ListProductImagesRichFn>(async () => new Map());
    const resolveVariantMediaOptions = vi.fn<ResolveVariantMediaOptionsFn>(async () => new Map());
    const map = await buildOrderLineCoverUrlMap(listProductImages, resolveVariantMediaOptions, undefined, "s", []);
    expect(map.size).toBe(0);
    expect(listProductImages).not.toHaveBeenCalled();
  });
});
