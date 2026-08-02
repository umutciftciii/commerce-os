// TODO-165B (recovery) — ProductMediaFrame kontrat testi.
//
// Ortak medya primitive'i `variant`'a göre aspect/fit/pad/bg kararını TEK yerde toplar
// (FRAME_CONFIG). Bu test yalnız görsel-yolu img'inin `object-fit` sınıfını (kart/PDP ana
// görsel = contain; thumbnail = cover) + overlay (children) + img'e uygulanan mediaClassName
// sözleşmesini doğrular. imageUrl verilir ki placeholder yerine gerçek <img> render edilsin
// (bkz. product-media.tsx: src çözülünce <img className="… object-contain/cover …">).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductMediaFrame } from "../components/ui/product-media";

const IMG = "/media/x.webp";

describe("ProductMediaFrame — object-fit sözleşmesi", () => {
  it("variant=product-card görsel img'i object-contain taşır (cover DEĞİL)", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="product-card" handle="p" title="Ürün" imageUrl={IMG} />,
    );
    expect(html).toContain("<img");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });

  it("variant=gallery-main görsel img'i object-contain taşır (cover DEĞİL)", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="gallery-main" handle="p" title="Ürün" imageUrl={IMG} />,
    );
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });

  it("variant=gallery-thumbnail görsel img'i object-cover taşır (contain DEĞİL)", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="gallery-thumbnail" handle="p" title="Ürün" imageUrl={IMG} />,
    );
    expect(html).toContain("object-cover");
    expect(html).not.toContain("object-contain");
  });

  it("variant=variant-card görsel img'i object-contain taşır", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="variant-card" handle="p" title="Ürün" imageUrl={IMG} />,
    );
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });

  it("children (overlay) çerçeve içine render edilir", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="product-card" handle="p" title="Ürün" imageUrl={IMG}>
        <span>OVERLAY_ROZET</span>
      </ProductMediaFrame>,
    );
    expect(html).toContain("OVERLAY_ROZET");
  });

  it("mediaClassName img'e uygulanır (ör. hover zoom)", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame
        variant="product-card"
        handle="p"
        title="Ürün"
        imageUrl={IMG}
        mediaClassName="hover-zoom-marker"
      />,
    );
    // Sınıf gerçek <img> öğesine düşer (çerçeve div'ine değil).
    const imgTag = html.slice(html.indexOf("<img"));
    expect(imgTag).toContain("hover-zoom-marker");
  });

  it("imageUrl yoksa placeholder (monogram) gösterir — img YOK", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="product-card" handle="p" title="Ürün" />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain('role="img"');
  });

  // TD-173 — Sepet/sipariş/wishlist satır thumbnail'i: kare, contain, tutarlı placeholder.
  it("variant=line-thumbnail img'i object-contain + kare (aspect-square) çerçeve taşır", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="line-thumbnail" handle="p" title="Ürün" imageUrl={IMG} />,
    );
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).toContain("aspect-square");
  });

  it("variant=line-thumbnail görselsiz ortak placeholder (monogram) gösterir — beyaz boş kart yok", () => {
    const html = renderToStaticMarkup(
      <ProductMediaFrame variant="line-thumbnail" handle="p" title="Örnek" />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain('role="img"');
    // Deterministik monogram (başlığın ilk harfi).
    expect(html).toContain(">Ö<");
  });
});
