import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { SiteHeader } from "../components/site/site-header.js";

// SiteHeader ic-ice AccountMenu client bileseni useRouter() cagirir; statik
// render'da app-router context yok → hafif stub (marka gosterimini test ediyoruz).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}));

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Site-kabugu UI birim testleri (statik render;
 * repo konvansiyonu — jsdom yok). Etkilesim (auto-gecis/pause) `campaign-bar`
 * mekaniginin birebir kopyasidir ve canli smoke'ta dogrulanir; burada YAPISAL
 * davranislar kanitlanir: logo/kelime-isareti secimi, coklu/tek/bos hero.
 */
const dict = getDictionary("tr");
const t = dict.storefront;
const shell = t.shell;
const headerProps = {
  locale: "tr" as const,
  t,
  languageLabels: dict.common.language,
  cartCount: 0,
  customer: null,
};

describe("<SiteHeader> marka gosterimi", () => {
  it("logoUrl doluysa <img> (alt=storeName); kelime-isareti YOK", () => {
    const html = renderToStaticMarkup(
      <SiteHeader {...headerProps} storeName="Butik X" logoUrl="/media/stores/s1/branding/logo.webp" />,
    );
    expect(html).toContain('src="/media/stores/s1/branding/logo.webp"');
    expect(html).toContain('alt="Butik X"');
    // Kelime-isareti serif span'i logo varken render EDILMEZ (marka metni <img> alt'inda).
    expect(html).not.toContain(`>Butik X<`);
  });

  it("logoUrl null → serif kelime-isareti; metin storeName", () => {
    const html = renderToStaticMarkup(
      <SiteHeader {...headerProps} storeName="Butik X" logoUrl={null} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("Butik X");
    expect(html).toContain("font-serif");
  });

  it("storeName da null → i18n shell.brand fallback (mevcut davranis)", () => {
    const html = renderToStaticMarkup(<SiteHeader {...headerProps} storeName={null} logoUrl={null} />);
    expect(html).not.toContain("<img");
    expect(html).toContain(shell.brand);
  });
});
