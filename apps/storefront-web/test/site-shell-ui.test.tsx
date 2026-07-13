import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { SiteHeader } from "../components/site/site-header.js";
import { HeroCarousel } from "../components/site/hero-carousel.js";
import type { StorefrontHeroSlide } from "../lib/catalog-types.js";

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

const slide = (over: Partial<StorefrontHeroSlide> & { key: string }): StorefrontHeroSlide => ({
  mediaUrl: "/media/x.webp",
  headline: null,
  subtext: null,
  ctaLabel: null,
  ctaHref: null,
  ...over,
});

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

describe("<HeroCarousel> hero paneli", () => {
  const two = [
    slide({ key: "a", headline: "İlk", ctaLabel: "Keşfet", ctaHref: "/products" }),
    slide({ key: "b", headline: "İkinci" }),
  ];

  it("bos dizi → hicbir sey render etmez (page statik fallback'e duser)", () => {
    const html = renderToStaticMarkup(<HeroCarousel slides={[]} t={shell} brandLabel="Marka" />);
    expect(html).toBe("");
  });

  it("tek slide → statik (ok/nokta YOK); gorsel + basligi gosterir", () => {
    const html = renderToStaticMarkup(
      <HeroCarousel slides={[two[0]]} t={shell} brandLabel="Marka" />,
    );
    expect(html).toContain('src="/media/x.webp"');
    expect(html).toContain("İlk");
    // Tek slide → kontrol yok.
    expect(html).not.toContain(`aria-label="${shell.heroPrev}"`);
    expect(html).not.toContain(`aria-label="${shell.heroNext}"`);
  });

  it("coklu slide → oklar + nokta gostergeleri; aktif ilk slide", () => {
    const html = renderToStaticMarkup(<HeroCarousel slides={two} t={shell} brandLabel="Marka" />);
    expect(html).toContain(`aria-label="${shell.heroPrev}"`);
    expect(html).toContain(`aria-label="${shell.heroNext}"`);
    // Iki nokta (1/2, 2/2).
    expect(html).toContain('aria-label="1 / 2"');
    expect(html).toContain('aria-label="2 / 2"');
    // Ilk slide aktif render edilir.
    expect(html).toContain('src="/media/x.webp"');
    expect(html).toContain("İlk");
  });

  it("CTA yalniz ctaLabel+ctaHref varsa; accent (variant=cta) buton stili", () => {
    const html = renderToStaticMarkup(
      <HeroCarousel slides={[two[0]]} t={shell} brandLabel="Marka" />,
    );
    expect(html).toContain('href="/products"');
    expect(html).toContain("Keşfet");
    // variant="cta" → tek-accent token (bg-accent). Hero'ya ozel farkli stil YOK.
    expect(html).toContain("bg-accent");
  });

  it("CTA'siz slide → buton render edilmez", () => {
    const html = renderToStaticMarkup(
      <HeroCarousel slides={[slide({ key: "c", headline: "Sade" })]} t={shell} brandLabel="Marka" />,
    );
    expect(html).not.toContain("bg-accent");
  });
});
