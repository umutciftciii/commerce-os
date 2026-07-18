import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { ProductGallery } from "../components/product-gallery.js";
import {
  resolveImageAlt,
  shouldShowThumbnailStrip,
  type GalleryImage,
} from "../lib/gallery.js";

const t = getDictionary("tr").storefront.detail;

const img = (url: string, altText: string | null = null): GalleryImage => ({
  url,
  altText,
  variantOptionId: null,
});

describe("shouldShowThumbnailStrip", () => {
  it("gorselsiz urunde serit gosterilmez", () => {
    expect(shouldShowThumbnailStrip([])).toBe(false);
  });
  it("tek gorselde serit gosterilmez (mevcut tek-gorsel davranisi korunur)", () => {
    expect(shouldShowThumbnailStrip([img("/media/a.webp")])).toBe(false);
  });
  it("birden fazla gorselde serit gosterilir", () => {
    expect(shouldShowThumbnailStrip([img("/media/a.webp"), img("/media/b.webp")])).toBe(true);
  });
});

describe("resolveImageAlt", () => {
  it("altText doluysa (bosluk temizlenmis) onu kullanir", () => {
    expect(resolveImageAlt("  Kirmizi tisort onden  ", "yedek")).toBe("Kirmizi tisort onden");
  });
  it("altText null ise yedege duser", () => {
    expect(resolveImageAlt(null, "Demo Hoodie")).toBe("Demo Hoodie");
  });
  it("altText yalnizca bosluksa yedege duser", () => {
    expect(resolveImageAlt("   ", "Demo Hoodie")).toBe("Demo Hoodie");
  });
});

describe("<ProductGallery> statik render", () => {
  const images = [
    img("/media/cover.webp", "Kapak gorseli"),
    img("/media/side.webp"),
    img("/media/back.webp"),
  ];
  const html = renderToStaticMarkup(
    <ProductGallery images={images} title="Demo Hoodie" t={t} />,
  );

  it("ana gorsel ilk gorseli (kapak) gosterir", () => {
    expect(html).toContain('src="/media/cover.webp"');
    // Ana gorselin alt metni ilk gorselin altText'inden turetilir.
    expect(html).toContain('alt="Kapak gorseli"');
  });

  it("her gorsel icin bir thumbnail butonu render eder", () => {
    const buttonCount = (html.match(/<button/g) ?? []).length;
    expect(buttonCount).toBe(3);
  });

  it("altText'siz thumbnail icin baslik + indeksten yedek aria-label turetir", () => {
    // format(t.galleryThumbAlt, { title, n }) → "Demo Hoodie küçük görseli 2"
    expect(html).toContain('aria-label="Demo Hoodie küçük görseli 2"');
  });

  it("ilk thumbnail aktif isaretlenir (aria-pressed)", () => {
    expect(html).toContain('aria-pressed="true"');
  });
});
