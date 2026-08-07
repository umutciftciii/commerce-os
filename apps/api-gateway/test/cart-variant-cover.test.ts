/**
 * BUG-CART-003 (BUG 1) — Sepet satiri thumbnail'i SECILI VARYANTIN efektif medyasindan cozulmeli.
 *
 * Onceki hata: sepet kapagi productId ile (en dusuk position) cozuluyordu → renk varyanti
 * secilse bile urunun position-0 gorseli (baska renk) gorunuyordu. Bu testler Variant Media
 * Engine (galleryImagesForVariant) ile TUTARLI oncelik dogrular:
 *   1. media ekseni + varyantin secili renk option'ina etiketli gorsel,
 *   2. urun birincil kapagi (erken fallback YOK).
 */
import { describe, expect, it, vi } from "vitest";
import {
  pickVariantCoverImage,
  buildCartVariantCoverUrlMap,
  type ListProductImagesRichFn,
  type ResolveVariantMediaOptionsFn,
} from "../src/media/cover.js";

type Img = { storageKey: string; position: number; optionId: string | null };

const RED = "opt-red";
const BLUE = "opt-blue";
const AXIS = "attr-color";

describe("pickVariantCoverImage (BUG-CART-003 / BUG 1)", () => {
  it("returns the product cover (lowest position) when the product has no media axis", () => {
    const images: Img[] = [
      { storageKey: "cover.svg", position: 0, optionId: null },
      { storageKey: "alt.svg", position: 1, optionId: null },
    ];
    expect(pickVariantCoverImage(images, null, null)?.storageKey).toBe("cover.svg");
  });

  it("returns the selected color's image over the product cover (does not fall back early)", () => {
    const images: Img[] = [
      { storageKey: "shared-cover.svg", position: 0, optionId: null },
      { storageKey: "red.svg", position: 1, optionId: RED },
      { storageKey: "blue.svg", position: 2, optionId: BLUE },
    ];
    expect(pickVariantCoverImage(images, AXIS, RED)?.storageKey).toBe("red.svg");
    expect(pickVariantCoverImage(images, AXIS, BLUE)?.storageKey).toBe("blue.svg");
  });

  it("resolves distinct thumbnails for two color variants of the same product", () => {
    const images: Img[] = [
      { storageKey: "red.svg", position: 0, optionId: RED },
      { storageKey: "blue.svg", position: 1, optionId: BLUE },
    ];
    const red = pickVariantCoverImage(images, AXIS, RED)?.storageKey;
    const blue = pickVariantCoverImage(images, AXIS, BLUE)?.storageKey;
    expect(red).toBe("red.svg");
    expect(blue).toBe("blue.svg");
    expect(red).not.toBe(blue);
  });

  it("falls back to the product cover when the selected color has no tagged image", () => {
    const images: Img[] = [
      { storageKey: "shared-cover.svg", position: 0, optionId: null },
      { storageKey: "red.svg", position: 1, optionId: RED },
    ];
    // BLUE has no tagged image → product cover fallback (not the red image).
    expect(pickVariantCoverImage(images, AXIS, BLUE)?.storageKey).toBe("shared-cover.svg");
  });

  it("returns null for a product with no images", () => {
    expect(pickVariantCoverImage([], AXIS, RED)).toBeNull();
  });
});

describe("buildCartVariantCoverUrlMap (BUG-CART-003 / BUG 1)", () => {
  it("keys covers by variantId with per-color media, in a single batched image query (no N+1)", async () => {
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

    const map = await buildCartVariantCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [
        { variantId: "v-red", productId: "prod-shoe", mediaDefiningAttributeId: AXIS },
        { variantId: "v-blue", productId: "prod-shoe", mediaDefiningAttributeId: AXIS },
      ],
    );

    expect(map.get("v-red")).toBe("/media/red.svg");
    expect(map.get("v-blue")).toBe("/media/blue.svg");
    // Tek batched gorsel sorgusu (N+1 yok).
    expect(listProductImages).toHaveBeenCalledTimes(1);
    // Tum gorseller (coverOnly=false) istenmeli — renk esleme icin.
    expect(listProductImages.mock.calls[0][2]).toBe(false);
  });

  it("uses the product cover for a classic product without a media axis", async () => {
    const listProductImages = vi.fn(async () =>
      new Map<string, Img[]>([
        ["prod-mug", [{ storageKey: "mug.svg", position: 0, optionId: null }]],
      ]),
    );
    const resolveVariantMediaOptions = vi.fn(async () => new Map<string, string>());

    const map = await buildCartVariantCoverUrlMap(
      listProductImages,
      resolveVariantMediaOptions,
      undefined,
      "store-1",
      [{ variantId: "v-mug", productId: "prod-mug", mediaDefiningAttributeId: null }],
    );

    expect(map.get("v-mug")).toBe("/media/mug.svg");
    // Media ekseni olmayan urun icin varyant-option cozumu CAGRILMAZ.
    expect(resolveVariantMediaOptions).not.toHaveBeenCalled();
  });
});
