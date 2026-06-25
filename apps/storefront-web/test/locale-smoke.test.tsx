import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Sunucu vitrin sayfalari locale'i `commerce_os_locale` cookie'sinden cozer.
// next/headers cookies()'i sahteleyip her iki dili de dogrularız.
const cookie = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "commerce_os_locale" && cookie.value ? { value: cookie.value } : undefined,
  }),
}));

// Ana sayfa canli katalogu cozer; smoke testte resolver sahtelenir (ag yok).
vi.mock("../lib/server/catalog", () => ({
  getFeaturedProducts: async () => ({ ok: true, data: [] }),
}));

import HomePage from "../app/page.js";

afterEach(() => {
  cookie.value = undefined;
});

describe("storefront-web · runtime locale switch", () => {
  it("renders the Turkish home by default (no locale cookie)", async () => {
    cookie.value = undefined;
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Günlük yaşamın özenle üretilmiş parçaları.");
    expect(html).not.toContain("Everyday essentials");
  });

  it("renders the English home with a locale=en cookie", async () => {
    cookie.value = "en";
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Everyday essentials, thoughtfully made.");
    expect(html).not.toContain("Günlük yaşamın özenle üretilmiş parçaları.");
  });

  it("falls back to Turkish for an invalid locale cookie", async () => {
    cookie.value = "de";
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Günlük yaşamın özenle üretilmiş parçaları.");
  });
});
