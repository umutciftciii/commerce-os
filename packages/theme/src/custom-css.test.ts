import { describe, expect, it } from "vitest";
import { sanitizeCustomCss, CUSTOM_CSS_MAX_LENGTH } from "./custom-css.js";

describe("sanitizeCustomCss", () => {
  it("meşru CSS'i korur (child combinator '>' dahil)", () => {
    const r = sanitizeCustomCss(".promo { color: red; }\n.nav > .item { padding: 4px; }");
    expect(r.css).toContain(".promo { color: red; }");
    expect(r.css).toContain(".nav > .item");
    expect(r.removed).toEqual([]);
  });

  it("</style> breakout tamamen kaldırılır", () => {
    const r = sanitizeCustomCss("a{}</style><script>alert(1)</script>");
    expect(r.css).not.toContain("<");
    expect(r.css).not.toContain("</style>");
    expect(r.css).not.toContain("<script");
  });

  it("yorum-obfuscation ile @import bypass'ı kapatılır", () => {
    const r = sanitizeCustomCss("@/**/import url(https://evil/x.css);");
    expect(r.css.toLowerCase()).not.toContain("import url");
  });

  it("boşluk-toleranslı @import / @charset", () => {
    const r = sanitizeCustomCss("@import  url(https://evil/x.css); @charset 'utf-8';");
    expect(r.css.toLowerCase()).not.toContain("@import");
    expect(r.css.toLowerCase()).not.toContain("@charset");
  });

  it("fixpoint: iç içe yeniden oluşan token", () => {
    // 'javascjavascript:ript:' → iç 'javascript:' kalkınca dış yeniden oluşur.
    const r = sanitizeCustomCss("x{background:urljavascjavascript:ript:(1)}");
    expect(r.css.toLowerCase()).not.toContain("javascript:");
  });

  it("expression() / behavior / -moz-binding", () => {
    const r = sanitizeCustomCss("a{width:expression(alert(1));behavior:url(x);-moz-binding:url(y)}");
    expect(r.css.toLowerCase()).not.toContain("expression(");
    expect(r.css.toLowerCase()).not.toContain("behavior:");
    expect(r.css.toLowerCase()).not.toContain("-moz-binding");
  });

  it("boş/uzun girdi güvenli", () => {
    expect(sanitizeCustomCss(null).css).toBe("");
    expect(sanitizeCustomCss(undefined).css).toBe("");
    const long = "a".repeat(CUSTOM_CSS_MAX_LENGTH + 1000);
    expect(sanitizeCustomCss(long).css.length).toBeLessThanOrEqual(CUSTOM_CSS_MAX_LENGTH);
  });
});
