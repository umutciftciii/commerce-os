// @vitest-environment jsdom
// Faz 2C-3 (ADR-072) — "Varyantları Oluştur" aksiyonu UI testi.
// Kanıtlanan: görünürlük (visible), disabled durumları, yükleme, başarı özeti, hata mesajı,
// buton tıklaması generate() çağırır (refetch bunun sonucudur), i18n TR/EN etiketleri.
import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerateVariantsAction } from "../app/(app)/products/variant-attributes/generate-variants-action";
import type { VariantGenerationController } from "../app/(app)/products/variant-attributes/use-variant-generation";
import { getDictionary } from "@commerce-os/i18n";

const tr = getDictionary("tr").storeAdmin.products.variantAttributes;
const en = getDictionary("en").storeAdmin.products.variantAttributes;

function labelsFrom(va: typeof tr) {
  return {
    sectionTitle: va.generateTitle,
    sectionSubtitle: va.generateSubtitle,
    button: va.generateButton,
    generating: va.generating,
    summaryTitle: va.generateSummaryTitle,
    createdLabel: (n: number) => va.generatedCreated.replace("{value}", String(n)),
    keptLabel: (n: number) => va.generatedKept.replace("{value}", String(n)),
    restoredLabel: (n: number) => va.generatedRestored.replace("{value}", String(n)),
    archivedLabel: (n: number) => va.generatedArchived.replace("{value}", String(n)),
    manualLabel: (n: number) => va.generatedManual.replace("{value}", String(n)),
    serverErrors: va.generateServerErrors,
  };
}

function controller(overrides: Partial<VariantGenerationController> = {}): VariantGenerationController {
  return {
    generating: false,
    summary: null,
    errorCode: null,
    generate: vi.fn(async () => {}),
    reset: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("Faz 2C-3 — GenerateVariantsAction", () => {
  it("visible=false → hiçbir şey render edilmez", () => {
    const { container } = render(
      <GenerateVariantsAction visible={false} disabled={false} controller={controller()} labels={labelsFrom(tr)} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("visible=true → buton görünür (TR)", () => {
    render(
      <GenerateVariantsAction visible disabled={false} controller={controller()} labels={labelsFrom(tr)} />,
    );
    expect(screen.getByText("Varyantları oluştur", { selector: "button" })).toBeTruthy();
  });

  it("disabled=true → buton pasif", () => {
    render(
      <GenerateVariantsAction visible disabled controller={controller()} labels={labelsFrom(tr)} />,
    );
    const btn = screen.getByText("Varyantları oluştur", { selector: "button" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("generating=true → yükleme etiketi + pasif", () => {
    render(
      <GenerateVariantsAction visible disabled={false} controller={controller({ generating: true })} labels={labelsFrom(tr)} />,
    );
    const btn = screen.getByText("Varyantlar oluşturuluyor…", { selector: "button" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("buton tıklaması generate() çağırır", () => {
    const generate = vi.fn(async () => {});
    render(
      <GenerateVariantsAction visible disabled={false} controller={controller({ generate })} labels={labelsFrom(tr)} />,
    );
    fireEvent.click(screen.getByText("Varyantları oluştur", { selector: "button" }));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("başarı özeti → oluşturulan/korunan/geri yüklenen/arşivlenen gösterir", () => {
    render(
      <GenerateVariantsAction
        visible
        disabled={false}
        controller={controller({
          summary: {
            totalTarget: 4,
            created: 2,
            kept: 1,
            restored: 1,
            archived: 3,
            manualVariantsUntouched: 5,
            variants: [],
          },
        })}
        labels={labelsFrom(tr)}
      />,
    );
    expect(screen.getByText("Oluşturulan: 2")).toBeTruthy();
    expect(screen.getByText("Korunan: 1")).toBeTruthy();
    expect(screen.getByText("Geri yüklenen: 1")).toBeTruthy();
    expect(screen.getByText("Arşivlenen: 3")).toBeTruthy();
    expect(screen.getByText("Manuel (dokunulmadı): 5")).toBeTruthy();
  });

  it("hata kodu → i18n mesajı (VARIANT_SELECTION_EMPTY)", () => {
    render(
      <GenerateVariantsAction
        visible
        disabled={false}
        controller={controller({ errorCode: "VARIANT_SELECTION_EMPTY" })}
        labels={labelsFrom(tr)}
      />,
    );
    expect(screen.getByText(tr.generateServerErrors.VARIANT_SELECTION_EMPTY)).toBeTruthy();
  });

  it("bilinmeyen hata kodu → default mesaj", () => {
    render(
      <GenerateVariantsAction
        visible
        disabled={false}
        controller={controller({ errorCode: "SOMETHING_ELSE" })}
        labels={labelsFrom(tr)}
      />,
    );
    expect(screen.getByText(tr.generateServerErrors.default)).toBeTruthy();
  });

  it("i18n EN → İngilizce buton etiketi", () => {
    render(
      <GenerateVariantsAction visible disabled={false} controller={controller()} labels={labelsFrom(en)} />,
    );
    expect(screen.getByText("Generate variants", { selector: "button" })).toBeTruthy();
  });
});
