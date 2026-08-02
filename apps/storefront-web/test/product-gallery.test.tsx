import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { ProductGallery } from "../components/product-gallery.js";
import {
  containZoomOrigin,
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

describe("containZoomOrigin — hover zoom görsel-sınırı farkındalığı (§2 regresyon)", () => {
  // Kare frame (500x500). Yatay görsel (1000x500 → aspect 2): üst-alt letterbox.
  it("yatay görselde dikey eksende letterbox'a taşan işaretçiyi görsel kenarına kelepçeler (beyaz boşlukta zoom yok)", () => {
    // Görsel yüksekliği = 500/2 = 250, offY = 125 → görsel [y:125..375].
    // İşaretçi y=10 (üst beyaz boşluk) → cy=125 → %25.
    const o = containZoomOrigin(250, 10, 500, 500, 1000, 500);
    expect(o.x).toBe(50);
    expect(o.y).toBe(25);
  });

  // Dikey görsel (500x1000 → aspect 0.5): sol-sağ letterbox.
  it("dikey görselde yatay eksende letterbox'a taşan işaretçiyi kelepçeler", () => {
    // Görsel genişliği = 500*0.5 = 250, offX = 125 → görsel [x:125..375].
    // İşaretçi x=490 (sağ beyaz boşluk) → cx=375 → %75.
    const o = containZoomOrigin(490, 250, 500, 500, 500, 1000);
    expect(o.x).toBe(75);
    expect(o.y).toBe(50);
  });

  it("görsel içindeki işaretçi doğrudan yüzdeye çevrilir (kelepçe yok)", () => {
    const o = containZoomOrigin(300, 250, 500, 500, 1000, 500);
    expect(o.x).toBe(60);
    expect(o.y).toBe(50);
  });

  it("geçersiz boyutlarda güvenli merkeze (50/50) düşer", () => {
    expect(containZoomOrigin(10, 10, 0, 500, 1000, 500)).toEqual({ x: 50, y: 50 });
    expect(containZoomOrigin(10, 10, 500, 500, 0, 500)).toEqual({ x: 50, y: 50 });
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
    // TODO-165B (ADR-259): galeri artik thumbnail + zoom-trigger + share butonlari icerir; thumbnail'lar
    // aria-pressed (secim state) tasir, zoom/share tasimaz → thumbnail sayimini aria-pressed ile yap.
    const thumbnailCount = (html.match(/aria-pressed/g) ?? []).length;
    expect(thumbnailCount).toBe(3);
  });

  it("altText'siz thumbnail icin baslik + indeksten yedek aria-label turetir", () => {
    // format(t.galleryThumbAlt, { title, n }) → "Demo Hoodie küçük görseli 2"
    expect(html).toContain('aria-label="Demo Hoodie küçük görseli 2"');
  });

  it("ilk thumbnail aktif isaretlenir (aria-pressed)", () => {
    expect(html).toContain('aria-pressed="true"');
  });

  // Final Polish §2 — çerçeve-içi hover zoom + opsiyonel tam-ekran aksiyonu.
  it("çerçeve-içi zoom katmanı (transform-origin) ve overflow-hidden çerçeve render eder", () => {
    expect(html).toContain("overflow-hidden");
    expect(html).toContain("transform-origin");
  });

  it("opsiyonel tam-ekran (büyüt) aksiyonu açık etiketle render edilir", () => {
    expect(html).toContain(`aria-label="${t.galleryZoom}"`);
  });
});

describe("<ProductGallery> tek görsel — hover zoom yine çalışır, şerit gizli (§2)", () => {
  const html = renderToStaticMarkup(
    <ProductGallery images={[img("/media/only.webp", "Tek")]} title="Tekli" t={t} />,
  );

  it("tek görselde thumbnail şeridi render edilmez", () => {
    expect((html.match(/aria-pressed/g) ?? []).length).toBe(0);
  });

  it("tek görselde de ana görsel + zoom katmanı vardır", () => {
    expect(html).toContain('src="/media/only.webp"');
    expect(html).toContain("transform-origin");
  });
});
