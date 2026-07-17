// @vitest-environment jsdom
// Faz 2C-2 (ADR-071) — "Oluşacak Kombinasyonlar" önizleme bölümü (SALT-OKUNUR) UI testi.
// Kanıtlanan: kombinasyon listesi + sayı, guard aşımı uyarısı, hata durumu, boş/0 → hiçbir şey
// render edilmez (legacy korunur), yükleme spinner'ı. DÜZENLEME/YAZMA YOK.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CombinationPreview } from "../app/(app)/products/variant-attributes/combination-preview";
import type { VariantCombinationPreviewState } from "../app/(app)/products/variant-attributes/use-variant-combination-preview";

const labels = {
  sectionTitle: "Oluşacak kombinasyonlar",
  sectionSubtitle: "Alt başlık",
  loadingLabel: "Hesaplanıyor…",
  errorLabel: "Yüklenemedi.",
  limitLabel: "Sınır aşıldı.",
  countLabel: (count: number) => `${count} kombinasyon oluşacak.`,
  emptyLabel: "Henüz kombinasyon yok.",
};

function renderState(state: VariantCombinationPreviewState) {
  return render(<CombinationPreview state={state} labels={labels} />);
}

afterEach(() => cleanup());

describe("Faz 2C-2 — CombinationPreview (salt-okunur önizleme)", () => {
  it("kombinasyonları etiketleriyle listeler + sayıyı gösterir", () => {
    renderState({
      loading: false,
      errorCode: null,
      data: {
        axisCount: 2,
        totalCombinations: 2,
        combinations: [
          {
            previewId: "pv_a",
            combinationKey: "v1|color:black|size:s",
            attributes: [],
            optionIds: ["black", "s"],
            optionLabels: ["Siyah", "S"],
          },
          {
            previewId: "pv_b",
            combinationKey: "v1|color:black|size:m",
            attributes: [],
            optionIds: ["black", "m"],
            optionLabels: ["Siyah", "M"],
          },
        ],
      },
    });
    expect(screen.getByText("2 kombinasyon oluşacak.")).toBeTruthy();
    expect(screen.getByText("Siyah · S")).toBeTruthy();
    expect(screen.getByText("Siyah · M")).toBeTruthy();
  });

  it("etiket null ise optionId'ye düşer", () => {
    renderState({
      loading: false,
      errorCode: null,
      data: {
        axisCount: 1,
        totalCombinations: 1,
        combinations: [
          {
            previewId: "pv_a",
            combinationKey: "v1|color:black",
            attributes: [],
            optionIds: ["black"],
            optionLabels: [null],
          },
        ],
      },
    });
    expect(screen.getByText("black")).toBeTruthy();
  });

  it("guard aşımı → uyarı gösterir (liste YOK)", () => {
    renderState({ loading: false, errorCode: "PREVIEW_LIMIT_EXCEEDED", data: null });
    expect(screen.getByText("Sınır aşıldı.")).toBeTruthy();
  });

  it("hata → hata mesajı gösterir", () => {
    renderState({ loading: false, errorCode: "ERROR", data: null });
    expect(screen.getByText("Yüklenemedi.")).toBeTruthy();
  });

  it("yükleme → spinner etiketi", () => {
    renderState({ loading: true, errorCode: null, data: null });
    expect(screen.getByText("Hesaplanıyor…")).toBeTruthy();
  });

  it("0 kombinasyon → hiçbir şey render edilmez (legacy korunur)", () => {
    const { container } = renderState({
      loading: false,
      errorCode: null,
      data: { axisCount: 0, totalCombinations: 0, combinations: [] },
    });
    expect(container.firstChild).toBeNull();
  });

  it("veri yok (henüz kaydedilmemiş) → hiçbir şey render edilmez", () => {
    const { container } = renderState({ loading: false, errorCode: null, data: null });
    expect(container.firstChild).toBeNull();
  });
});
