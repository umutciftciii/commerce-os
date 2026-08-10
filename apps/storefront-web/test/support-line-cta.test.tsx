import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupportLineCta } from "../components/account/support/support-line-cta";

/**
 * TODO-177 (ADR-289) Faz D — Order-line "Ürün desteği al" giriş noktası. Bağlam (order + line)
 * query ile taşınır; backend orderLineId+customerId'yi yeniden doğrular. CTA order-line
 * bağlamlıdır (PDP genel destek YOK — Faz 1 satın alınmış kalem kapsamı).
 */
describe("SupportLineCta", () => {
  it("order + orderLineId ile guided başlangıcına linkler; etiket görünür", () => {
    const html = renderToStaticMarkup(
      <SupportLineCta orderNumber="OS-1" orderLineId="ol-9" label="Ürün desteği al" />,
    );
    expect(html).toContain('href="/account/support/new?order=OS-1&amp;line=ol-9"');
    expect(html).toContain("Ürün desteği al");
  });

  it("özel karakterli order/line değerlerini encode eder", () => {
    const html = renderToStaticMarkup(
      <SupportLineCta orderNumber="OS 1/A" orderLineId="ol/9" label="Destek" />,
    );
    expect(html).toContain("order=OS%201%2FA");
    expect(html).toContain("line=ol%2F9");
  });
});
