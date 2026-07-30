import { describe, it, expect } from "vitest";
import { generateBuilderCss, builderBaseVariables } from "./builder-css.js";
import { parseThemeBuilderConfig } from "./builder-config.js";

function cfg(input: unknown) {
  return parseThemeBuilderConfig(input);
}

describe("builderBaseVariables", () => {
  it("boş config → boş", () => {
    expect(builderBaseVariables(cfg({}))).toEqual([]);
  });

  it("container/listing/hero → doğru değişkenler", () => {
    const vars = builderBaseVariables(
      cfg({ container: { width: "1440px", gutter: "wide" }, listing: { columnsDesktop: 4 }, hero: { height: "tall" } }),
    );
    const map = Object.fromEntries(vars);
    expect(map["--tb-container-max"]).toBe("1440px");
    expect(map["--tb-gutter"]).toBe("40px");
    expect(map["--tb-listing-cols"]).toBe("4");
    expect(map["--tb-hero-h"]).toBe("38rem");
  });

  it("radius scale → --radius-sm/md/lg override", () => {
    const map = Object.fromEntries(builderBaseVariables(cfg({ radius: { scale: "sharp" } })));
    expect(map["--radius-sm"]).toBe("0px");
    expect(map["--radius-lg"]).toBe("2px");
  });
});

describe("generateBuilderCss", () => {
  it("boş config → boş string", () => {
    expect(generateBuilderCss(cfg({}))).toBe("");
  });

  it("responsive override → sistem-tanımlı @media blokları", () => {
    const css = generateBuilderCss(
      cfg({ responsiveOverrides: { tablet: { columns: 3 }, mobile: { columns: 2, heroHeight: "compact" } } }),
    );
    expect(css).toContain("@media (max-width: 1024px)");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("--tb-listing-cols: 2");
    // mobile bloğu tablet'ten SONRA (küçük ekran kazanır)
    expect(css.indexOf("640px")).toBeGreaterThan(css.indexOf("1024px"));
  });

  it("kullanıcı arbitrary CSS/selector ENJEKTE EDEMEZ (yalnız sabit değişkenler)", () => {
    const css = generateBuilderCss(cfg({ container: { width: "1200px" } }));
    // yalnız :root[data-theme] seçici + --tb-* değişkeni
    expect(css).toMatch(/^:root\[data-theme\] \{/);
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("expression(");
  });

  it("geçersiz uzunluk render-time'da ATLANIR (parse başarısız değer downstream'e geçse bile)", () => {
    // parseThemeBuilderConfig geçersizi zaten düşürür; base default döner → boş
    const css = generateBuilderCss(cfg({ container: { width: "url(evil)" } }));
    expect(css).toBe("");
  });
});
