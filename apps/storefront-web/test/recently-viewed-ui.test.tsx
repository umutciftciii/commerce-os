/**
 * TODO-161B (ADR-137/140/141) — Öneri yüzeyleri SSR (loading/empty) davranışı.
 *
 * renderToStaticMarkup (effects ÇALIŞMAZ; fetch useEffect'te → tetiklenmez) ile başlangıç durumları:
 * SimilarProducts loading (başlık + iskelet), RecentlyViewedRail null (geçmiş yok → hiç yer kaplamaz),
 * ViewHistorySection loading (başlık + iskelet). TR/EN + a11y aria-label kontrolü.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { SimilarProducts } from "../components/recently-viewed/similar-products";
import { RecentlyViewedRail } from "../components/recently-viewed/recently-viewed-rail";
import { ViewHistorySection } from "../components/account/sections/view-history-section";

const tr = getDictionary("tr").storefront;
const en = getDictionary("en").storefront;

describe("TODO-161B · öneri yüzeyleri (SSR başlangıç durumu)", () => {
  it("SimilarProducts loading durumunda başlık + iskelet render eder (TR)", () => {
    const html = renderToStaticMarkup(<SimilarProducts productId="p1" t={tr} />);
    expect(html).toContain(tr.related.title); // "Benzer ürünler"
    expect(html).toContain('aria-label="' + tr.related.title + '"');
    // İskelet (loading) — kart yok, aria-hidden iskelet bloğu var.
    expect(html).toContain("aria-hidden");
  });

  it("SimilarProducts EN başlığı gösterir", () => {
    const html = renderToStaticMarkup(<SimilarProducts productId="p1" t={en} />);
    expect(html).toContain(en.related.title); // "Similar products"
  });

  it("RecentlyViewedRail başlangıçta (geçmiş çözülmeden) DOM'da yer kaplamaz", () => {
    const html = renderToStaticMarkup(<RecentlyViewedRail t={tr} />);
    expect(html).toBe("");
  });

  it("ViewHistorySection loading durumunda başlık + iskelet render eder (TR)", () => {
    const html = renderToStaticMarkup(<ViewHistorySection t={tr} />);
    expect(html).toContain(tr.account.viewHistory.title); // "Son İncelediklerim"
    expect(html).toContain("aria-hidden");
  });

  it("ViewHistorySection EN başlığı gösterir", () => {
    const html = renderToStaticMarkup(<ViewHistorySection t={en} />);
    expect(html).toContain(en.account.viewHistory.title); // "Recently viewed"
  });
});
