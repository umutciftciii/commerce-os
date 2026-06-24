import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageSwitcher, LocaleProvider, useLocale } from "../src/index";

const labels = { ariaLabel: "Arayüz dili", turkish: "Türkçe", english: "İngilizce" };

describe("LanguageSwitcher", () => {
  it("renders both locale options with an accessible group label", () => {
    const html = renderToStaticMarkup(<LanguageSwitcher value="tr" labels={labels} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Arayüz dili"');
    expect(html).toContain(">TR<");
    expect(html).toContain(">EN<");
  });

  it("marks the active locale with aria-pressed and brand styling", () => {
    const html = renderToStaticMarkup(<LanguageSwitcher value="en" labels={labels} />);
    // EN aktif: aria-pressed true + brand arka plan; TR pasif.
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="İngilizce"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*aria-label="Türkçe"/);
    expect(html).toContain("bg-brand-600");
  });

  it("exposes localized full names as accessible labels", () => {
    const html = renderToStaticMarkup(<LanguageSwitcher value="tr" labels={labels} />);
    expect(html).toContain('aria-label="Türkçe"');
    expect(html).toContain('aria-label="İngilizce"');
  });
});

function LocaleProbe() {
  return <span>{useLocale()}</span>;
}

describe("LocaleProvider / useLocale", () => {
  it("provides the active locale to descendants", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <LocaleProbe />
      </LocaleProvider>,
    );
    expect(html).toBe("<span>en</span>");
  });

  it("falls back to Turkish without a provider", () => {
    const html = renderToStaticMarkup(<LocaleProbe />);
    expect(html).toBe("<span>tr</span>");
  });
});
