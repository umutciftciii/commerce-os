// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorField } from "../app/(app)/theme/color-field.js";

afterEach(cleanup);

/**
 * TODO-164B — Brand Customizer ColorField: kullanıcı-dostu etiket + açıklama +
 * kontrast göstergesi + preview highlight; teknik token adı GÖSTERMEZ; locked alan
 * pasiftir.
 */
describe("ColorField (Marka ve Görünüm renk seçici)", () => {
  it("kullanıcı-dostu etiket + açıklama gösterir, teknik token adı GÖSTERMEZ", () => {
    render(
      <ColorField
        label="Ana buton rengi"
        description="Sepete ekle, Satın al ve ana CTA butonlarında kullanılır."
        usage="“Sepete ekle” butonu."
        value="#735389"
        invalid={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Ana buton rengi")).toBeTruthy();
    expect(screen.getAllByText(/Sepete ekle/).length).toBeGreaterThan(0);
    // Teknik token adları UI'da geçmemeli.
    expect(screen.queryByText(/brand\.primary|primaryColor|token/i)).toBeNull();
  });

  it("kontrast göstergesi AA sonucunu gösterir", () => {
    render(
      <ColorField
        label="Ana metin"
        description="Başlık ve gövde metni."
        usage="Ürün adı."
        value="#111111"
        invalid={false}
        contrastAgainst="#ffffff"
        contrastThreshold={4.5}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/AA ✓/)).toBeTruthy();
  });

  it("düşük kontrastı uyarır", () => {
    render(
      <ColorField
        label="Ana metin"
        description="Başlık ve gövde metni."
        usage="Ürün adı."
        value="#dddddd"
        invalid={false}
        contrastAgainst="#ffffff"
        contrastThreshold={4.5}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Düşük kontrast/)).toBeTruthy();
  });

  it("locked alan girişi pasif + Kilitli rozeti", () => {
    render(
      <ColorField
        label="Ana buton rengi"
        description="x"
        usage="y"
        value="#735389"
        invalid={false}
        locked
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Kilitli")).toBeTruthy();
    expect((screen.getByLabelText("Ana buton rengi hex/rgb") as HTMLInputElement).disabled).toBe(true);
  });

  it("Önizlemede göster butonu onHighlight tetikler", async () => {
    const onHighlight = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(
      <ColorField
        label="Ana buton rengi"
        description="x"
        usage="y"
        value="#735389"
        invalid={false}
        onChange={() => {}}
        onHighlight={onHighlight}
      />,
    );
    await user.click(screen.getByText("Önizlemede göster"));
    expect(onHighlight).toHaveBeenCalledOnce();
  });
});
