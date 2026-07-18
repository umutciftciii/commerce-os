// @vitest-environment jsdom
// TODO-151A (ADR-075) — Fiyatlandırma çalışma alanı testleri (tam genişlik ticari UX).
// Motor/kontrat değişmedi; bu testler yalnız yeniden tasarlanan SUNUM + dil + akışı doğrular.
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { PricingWorkspace } from "../app/(app)/products/pricing/pricing-workspace.js";

const { storeApiMock, MockUiError } = vi.hoisted(() => {
  class MockUiError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    MockUiError,
    storeApiMock: {
      getCommercialMatrix: vi.fn(),
      previewCommercial: vi.fn(),
      applyCommercial: vi.fn(),
    },
  };
});

vi.mock("../lib/client/api.js", () => ({ storeApi: storeApiMock, UiError: MockUiError }));

const calc = (over: Record<string, unknown> = {}) => ({
  grossProfitMinor: 4000,
  marginPct: 40,
  markupPct: 66.7,
  discountPct: null,
  ...over,
});

function makeRow(over: Record<string, unknown> = {}) {
  return {
    variantId: "v1",
    sku: "SKU-1",
    title: "Siyah / M",
    status: "ACTIVE",
    currency: "TRY",
    attributes: [],
    current: { priceMinor: 10000, compareAtMinor: null, costMinor: 6000, vatRateBps: 2000 },
    currentCalc: calc(),
    target: { priceMinor: 10000, compareAtMinor: null, costMinor: 6000, vatRateBps: 2000 },
    targetCalc: calc(),
    changedFields: [],
    changed: false,
    warnings: [],
    errors: [],
    ...over,
  };
}

function makeMatrix(rows: unknown[], summaryOver: Record<string, unknown> = {}) {
  const changed = (rows as { changed: boolean }[]).filter((r) => r.changed).length;
  return {
    fingerprint: "fp-1",
    source: "DIRECT_EDIT",
    blocked: false,
    rows,
    summary: {
      totalVariants: rows.length,
      changedVariants: changed,
      unchangedVariants: rows.length - changed,
      changedFieldCount: changed,
      warningCount: 0,
      errorCount: 0,
      minNewPriceMinor: 10000,
      maxNewPriceMinor: 12000,
      avgPriceChangePct: 20,
      negativeMarginCount: 0,
      compareAtBelowPriceCount: 0,
      ...summaryOver,
    },
  };
}

function renderWorkspace(locale: "tr" | "en" = "tr") {
  return render(
    <LocaleProvider locale={locale}>
      <PricingWorkspace productId="p1" />
    </LocaleProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("Pricing workspace — terminology & layout", () => {
  it("renders the 'Fiyatlandırma' heading and full-width workspace root, not 'Ticari matris'", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    const { container } = renderWorkspace();

    expect(await screen.findByRole("heading", { name: "Fiyatlandırma" })).toBeTruthy();
    await screen.findByRole("table");
    // Teknik "ticari matris" dili ana UI'da GÖRÜNMEZ.
    expect(screen.queryByText(/Ticari matris/i)).toBeNull();
    // Semantik token kapsamı kök sınıfı ile açılır (hardcoded dark-only yüzey yerine).
    expect(container.querySelector(".pricing-workspace")).toBeTruthy();
  });

  it("shows the renamed calculated column 'Liste fiyatına göre indirim' (not bare 'İndirim')", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const discountHeaders = screen.getAllByText("Liste fiyatına göre indirim");
    expect(discountHeaders.length).toBeGreaterThan(0);
    // "İndirim" tek başına bir başlık olarak görünmez.
    expect(screen.queryByText(/^İndirim$/)).toBeNull();
  });

  it("exposes accessible column tooltips (sales/list/cost/vat/margin/markup/discount)", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    const { container } = renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const tips = Array.from(container.querySelectorAll('[role="tooltip"]')).map((n) => n.textContent ?? "");
    expect(tips.some((t) => t.includes("siparişte kullanılan satış fiyatıdır"))).toBe(true);
    expect(tips.some((t) => t.includes("karşılaştırma fiyatıdır"))).toBe(true);
    expect(tips.some((t) => t.includes("Müşteriye gösterilmez"))).toBe(true);
    expect(tips.some((t) => t.includes("dahil KDV oranıdır"))).toBe(true);
    expect(tips.some((t) => t.includes("kampanya veya indirim değildir"))).toBe(true);
  });
});

describe("Pricing workspace — quick edit (default mode)", () => {
  it("defaults to quick edit with editable sales/list/cost inputs and previews an old→new change", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(
      makeMatrix(
        [
          makeRow({
            changed: true,
            changedFields: ["PRICE"],
            target: { priceMinor: 12000, compareAtMinor: null, costMinor: 6000, vatRateBps: 2000 },
            targetCalc: calc({ grossProfitMinor: 6000, marginPct: 50 }),
          }),
        ],
        { changedVariants: 1, unchangedVariants: 0, changedFieldCount: 1 },
      ),
    );
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    // Satış fiyatı hücresi gerçek bir input olarak açık.
    const priceInput = screen.getByLabelText("Siyah / M — Satış fiyatı gir");
    await user.clear(priceInput);
    await user.type(priceInput, "120");

    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));
    await waitFor(() => expect(storeApiMock.previewCommercial).toHaveBeenCalledTimes(1));

    // Önizleme özeti alan-bazlı; satış fiyatı eski→yeni gösterir.
    const summary = await screen.findByTestId("preview-summary");
    expect(within(summary).getByText(/güncellenecek/)).toBeTruthy();
    expect(within(summary).getAllByText(/₺100,00/).length).toBeGreaterThan(0); // eski
    expect(within(summary).getAllByText(/₺120,00/).length).toBeGreaterThan(0); // yeni

    // Apply etkin ve özeti yazar.
    storeApiMock.applyCommercial.mockResolvedValue({
      batchId: "b1",
      updatedVariants: 1,
      updatedFields: 1,
      skippedVariants: 0,
      auditCount: 1,
      source: "DIRECT_EDIT",
      preview: makeMatrix([makeRow()]),
    });
    await user.click(screen.getByRole("button", { name: "Değişiklikleri uygula" }));
    expect(await screen.findByText("1 varyant başarıyla güncellendi.")).toBeTruthy();
  });

  it("offers 'Düzenlemeye dön' after preview to restore editable cells (no stuck state)", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(
      makeMatrix(
        [makeRow({ changed: true, changedFields: ["PRICE"], target: { priceMinor: 12000, compareAtMinor: null, costMinor: 6000, vatRateBps: 2000 } })],
        { changedVariants: 1 },
      ),
    );
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const priceInput = screen.getByLabelText("Siyah / M — Satış fiyatı gir");
    await user.clear(priceInput);
    await user.type(priceInput, "120");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));
    await screen.findByTestId("preview-summary");
    // Önizlemede hücre input değil (old→new); geri dönüş butonu görünür.
    expect(screen.queryByLabelText("Siyah / M — Satış fiyatı gir")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Düzenlemeye dön" }));
    // Önizleme temizlenir, input geri gelir.
    expect(screen.getByLabelText("Siyah / M — Satış fiyatı gir")).toBeTruthy();
  });

  it("shows a field-based single-variant preview summary with 'Değişmedi' for untouched fields", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(
      makeMatrix(
        [
          makeRow({
            changed: true,
            changedFields: ["COMPARE_AT_PRICE"],
            target: { priceMinor: 10000, compareAtMinor: 18000, costMinor: 6000, vatRateBps: 2000 },
            targetCalc: calc({ discountPct: 44.4 }),
          }),
        ],
        { changedVariants: 1, unchangedVariants: 0, changedFieldCount: 1 },
      ),
    );
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const listInput = screen.getByLabelText("Siyah / M — Liste fiyatı gir");
    await user.type(listInput, "180");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));

    const summary = await screen.findByTestId("preview-summary");
    // Yalnız liste fiyatı değişti → satış fiyatı "Değişmedi".
    expect(within(summary).getAllByText("Değişmedi").length).toBeGreaterThan(0);
    expect(within(summary).getByText(/₺180,00/)).toBeTruthy();
  });
});

describe("Pricing workspace — bulk operation (guided)", () => {
  it("switches to bulk, shows guided operations, and requires a selection before preview", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow(), makeRow({ variantId: "v2", sku: "SKU-2", title: "Siyah / L" })]));
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /Toplu işlem/ }));
    // Yönlendirmeli soru + senaryolar.
    expect(screen.getByText("Ne yapmak istiyorsunuz?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Liste fiyatı oluştur/ })).toBeTruthy();

    // Seçim yokken uyarı + önizle pasif.
    expect(screen.getByText("Önce en az bir varyant seçin")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Değişiklikleri önizle" }) as HTMLButtonElement).disabled).toBe(true);

    // Bir varyant seçince sayaç güncellenir ve önizle etkinleşir.
    await user.click(screen.getByLabelText("Seç — Siyah / M"));
    expect(screen.getByText("1 varyant seçildi")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Değişiklikleri önizle" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("guides 'Create list price' with an explanatory helper and example, and previews", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(
      makeMatrix(
        [
          makeRow({
            changed: true,
            changedFields: ["COMPARE_AT_PRICE"],
            target: { priceMinor: 10000, compareAtMinor: 14000, costMinor: 6000, vatRateBps: 2000 },
            targetCalc: calc({ discountPct: 28.6 }),
          }),
        ],
        { changedVariants: 1, unchangedVariants: 0, changedFieldCount: 1 },
      ),
    );
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /Toplu işlem/ }));
    await user.click(screen.getByRole("button", { name: /Liste fiyatı oluştur/ }));

    // Açıklayıcı yardım + örnek.
    expect(screen.getByText(/karşılaştırma fiyatı oluşturulur/)).toBeTruthy();
    expect(screen.getByText(/₺140,00 olur/)).toBeTruthy();

    await user.click(screen.getByLabelText("Seç — Siyah / M"));
    await user.type(screen.getByLabelText(/Satış fiyatının üzerine eklenecek oran/), "40");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));

    await waitFor(() => expect(storeApiMock.previewCommercial).toHaveBeenCalledTimes(1));
    // Kural doğru kontrata çevrildi: COMPARE_AT_PRICE + fiyattan-yüzde markup.
    const [, req] = storeApiMock.previewCommercial.mock.calls[0];
    expect(req.rule.targetField).toBe("COMPARE_AT_PRICE");
    expect(req.rule.operation).toBe("SET_COMPARE_AT_FROM_PRICE");
    expect(req.rule.percentBps).toBe(4000);
    expect(req.selectedVariantIds).toEqual(["v1"]);
  });

  it("changes VAT via guided operation → SET_FIXED on VAT_RATE", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(makeMatrix([makeRow()], { changedVariants: 0 }));
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /Toplu işlem/ }));
    await user.click(screen.getByRole("button", { name: /KDV oranını değiştir/ }));
    await user.click(screen.getByLabelText("Seç — Siyah / M"));
    await user.selectOptions(screen.getByLabelText("Yeni KDV oranı"), "1000");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));

    await waitFor(() => expect(storeApiMock.previewCommercial).toHaveBeenCalledTimes(1));
    const [, req] = storeApiMock.previewCommercial.mock.calls[0];
    expect(req.rule.targetField).toBe("VAT_RATE");
    expect(req.rule.operation).toBe("SET_FIXED");
    expect(req.rule.valueBps).toBe(1000);
  });
});

describe("Pricing workspace — warning / blocking UX", () => {
  it("renders a humanized blocking error with technical code detail (not the raw code as main text)", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(
      makeMatrix(
        [makeRow({ changed: true, changedFields: ["PRICE"], errors: ["NEGATIVE_PRICE"] })],
        { changedVariants: 1, errorCount: 1 },
      ),
    );
    const blocked = makeMatrix(
      [makeRow({ changed: true, changedFields: ["PRICE"], errors: ["NEGATIVE_PRICE"] })],
      { changedVariants: 1, errorCount: 1 },
    );
    blocked.blocked = true;
    storeApiMock.previewCommercial.mockResolvedValue(blocked);
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const priceInput = screen.getByLabelText("Siyah / M — Satış fiyatı gir");
    await user.clear(priceInput);
    await user.type(priceInput, "50");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));

    // Ana metin insan-dostu; ham kod yalnız "Teknik detay" olarak.
    expect((await screen.findAllByText("Satış fiyatı negatif olamaz.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Teknik detay: NEGATIVE_PRICE/).length).toBeGreaterThan(0);
    // Engelleyici başlık görünür ve apply pasif.
    expect(screen.getAllByText("Engelleyici hata").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Değişiklikleri uygula" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders a warning that still allows apply (negative margin)", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    storeApiMock.previewCommercial.mockResolvedValue(
      makeMatrix(
        [
          makeRow({
            changed: true,
            changedFields: ["PRICE"],
            target: { priceMinor: 5000, compareAtMinor: null, costMinor: 6000, vatRateBps: 2000 },
            targetCalc: calc({ marginPct: -20, grossProfitMinor: -1000 }),
            warnings: ["NEGATIVE_MARGIN"],
          }),
        ],
        { changedVariants: 1, warningCount: 1, negativeMarginCount: 1 },
      ),
    );
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const wInput = screen.getByLabelText("Siyah / M — Satış fiyatı gir");
    await user.clear(wInput);
    await user.type(wInput, "50");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri önizle" }));

    expect((await screen.findAllByText("Satış fiyatı maliyetin altında kalıyor.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Uyarı").length).toBeGreaterThan(0);
    // Warning apply'ı engellemez.
    expect((screen.getByRole("button", { name: "Değişiklikleri uygula" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Pricing workspace — states & theme", () => {
  it("shows an empty state when the product has no variants", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([]));
    renderWorkspace();
    expect(await screen.findByText(/henüz varyant bulunmuyor/)).toBeTruthy();
  });

  it("shows a load-error state with retry", async () => {
    storeApiMock.getCommercialMatrix.mockRejectedValue(new MockUiError("ERROR"));
    renderWorkspace();
    expect(await screen.findByText("Ticari veriler yüklenemedi.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeTruthy();
  });

  it("uses semantic theme tokens (no hard-coded dark-only text-white surfaces on the root)", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    const { container } = renderWorkspace();
    await screen.findByRole("heading", { name: "Fiyatlandırma" });
    await screen.findByRole("table");

    const root = container.querySelector(".pricing-workspace") as HTMLElement;
    // Başlık semantik token sınıfı kullanır, hardcoded text-white/xx DEĞİL.
    const heading = within(root).getByRole("heading", { name: "Fiyatlandırma" });
    expect(heading.className).toContain("var(--pw-ink)");
  });

  it("renders in English under an en locale", async () => {
    storeApiMock.getCommercialMatrix.mockResolvedValue(makeMatrix([makeRow()]));
    renderWorkspace("en");
    expect(await screen.findByRole("heading", { name: "Pricing" })).toBeTruthy();
    await screen.findByRole("table");
    expect(screen.getAllByText("Discount vs. list price").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Preview changes" })).toBeTruthy();
  });
});
