import { describe, expect, it } from "vitest";
import { galleryImagesForVariant, type StorefrontProductDetail } from "../lib/catalog-types.js";

// Faz 2C-7 (ADR-078) — Variant Media Engine: secili varyanta gore galeri filtreleme (saf).
type Img = StorefrontProductDetail["images"][number];
const img = (url: string, variantOptionId: string | null): Img => ({ url, altText: null, variantOptionId });

describe("galleryImagesForVariant", () => {
  const shared = img("/media/shared.webp", null);
  const red1 = img("/media/red1.webp", "opt_red");
  const red2 = img("/media/red2.webp", "opt_red");
  const blue = img("/media/blue.webp", "opt_blue");
  const all = [shared, red1, red2, blue];

  it("media ekseni YOKKEN tum gorseller doner (klasik galeri = mevcut davranis)", () => {
    expect(galleryImagesForVariant(all, null, "opt_red")).toEqual(all);
    // Eksen null iken secili option ne olursa olsun degismez.
    expect(galleryImagesForVariant(all, null, null)).toEqual(all);
  });

  it("eksen VARKEN secili rengin gorselleri + paylasilan (etiketsiz) gorseller doner", () => {
    // Kirmizi secili → kirmizi (2) + paylasilan (1); mavi HARIC. Sira korunur.
    expect(galleryImagesForVariant(all, "attr_color", "opt_red")).toEqual([shared, red1, red2]);
    // Mavi secili → mavi (1) + paylasilan (1).
    expect(galleryImagesForVariant(all, "attr_color", "opt_blue")).toEqual([shared, blue]);
  });

  it("varyantin rengi yoksa (null) yalniz paylasilan gorseller doner", () => {
    expect(galleryImagesForVariant(all, "attr_color", null)).toEqual([shared]);
  });

  it("guvenli fallback: hic eslesme yoksa TUM gorseller doner (gorselsiz PDP'yi onle)", () => {
    // Secili renk yesil; yesil de paylasilan da yok → fallback tum dizi.
    const onlyTagged = [red1, blue];
    expect(galleryImagesForVariant(onlyTagged, "attr_color", "opt_green")).toEqual(onlyTagged);
  });
});
