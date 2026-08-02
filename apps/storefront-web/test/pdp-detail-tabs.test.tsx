import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { PdpDetailTabs } from "../components/pdp-detail-tabs.js";
import type { StorefrontProductDetail } from "../lib/catalog-types.js";

const dict = getDictionary("tr").storefront;

// Minimal ama tip-uyumlu ürün detayı (yalnız sekmelerin okuduğu alanlar).
const detail = {
  id: "p1",
  handle: "demo",
  title: "Demo Ürün",
  description: "Açıklama metni",
  brand: "DemoMarka",
  categoryLabel: "Kategori",
  sku: "SKU-1",
  variants: [],
  images: [],
  commerce: { salesMode: "DIRECT" },
  fashion: null,
} as unknown as StorefrontProductDetail;

describe("<PdpDetailTabs> — Final Polish §4", () => {
  it("REVIEWS kapalıysa (reviewsSlot yok) yalnız 3 sekme, Değerlendirmeler yok", () => {
    const html = renderToStaticMarkup(<PdpDetailTabs detail={detail} t={dict} />);
    const tabCount = (html.match(/role="tab"/g) ?? []).length;
    expect(tabCount).toBe(3);
    expect(html).not.toContain(dict.detail.reviewsTabTitle);
  });

  it("reviewsSlot verilince 4. sekme (Değerlendirmeler) + yorum sayısı etiketi eklenir", () => {
    const html = renderToStaticMarkup(
      <PdpDetailTabs
        detail={detail}
        t={dict}
        reviewCount={12}
        reviewsSlot={<div>gömülü-yorumlar</div>}
      />,
    );
    expect((html.match(/role="tab"/g) ?? []).length).toBe(4);
    expect(html).toContain(`${dict.detail.reviewsTabTitle} (12)`);
    // Yorum bloğu değerlendirmeler panelinde (aynı panelde form+liste).
    expect(html).toContain("gömülü-yorumlar");
  });

  it("yorum sayısı 0 iken sekme etiketinde sayaç gösterilmez", () => {
    const html = renderToStaticMarkup(
      <PdpDetailTabs detail={detail} t={dict} reviewCount={0} reviewsSlot={<div>x</div>} />,
    );
    expect(html).toContain(`>${dict.detail.reviewsTabTitle}<`);
    expect(html).not.toContain(`${dict.detail.reviewsTabTitle} (`);
  });

  it("erişilebilir tablist: her tab bir tabpanel'i kontrol eder + #reviews çapası vardır", () => {
    const html = renderToStaticMarkup(
      <PdpDetailTabs detail={detail} t={dict} reviewCount={3} reviewsSlot={<div>y</div>} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-controls');
    // Eski deep-link'ler (#reviews) için sabit çapa.
    expect(html).toContain('id="reviews"');
  });
});
