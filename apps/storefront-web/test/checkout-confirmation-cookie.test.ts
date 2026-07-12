import { describe, expect, it, vi } from "vitest";

// cart-cookie.ts top-level'da next/headers'i import eder (cookies). Saf fonksiyonlar
// (build/decode) cookies() cagirmaz; import'un cozulmesi icin hafif mock yeterli.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import {
  buildConfirmationCookieValue,
  decodeConfirmationCookieValue,
} from "../lib/server/cart-cookie.js";
import type { OrderConfirmationView } from "../lib/server/cart.js";

function confirmation(lineCount: number, imageUrl: string | null): OrderConfirmationView {
  return {
    orderNumber: "CO-1001",
    paymentPending: false,
    subtotalLabel: "₺1.299,00",
    shippingLabel: "₺49,90",
    shippingIsFree: false,
    discountLabel: null,
    taxIncludedLabel: "₺216,50",
    taxRatePercent: 20,
    totalLabel: "₺1.348,90",
    couponCode: null,
    couponStatus: "NONE",
    contactEmail: "ada@example.com",
    lines: Array.from({ length: lineCount }, (_, i) => ({
      title: `Ürün ${i + 1}`,
      variantTitle: "Black / M",
      quantity: 1,
      unitPriceLabel: "₺1.299,00",
      lineTotalLabel: "₺1.299,00",
      imageUrl,
    })),
    shippingAddress: null,
    billing: null,
    shippingOption: null,
  };
}

describe("storefront-web · Dilim 6a checkout confirmation cookie boyut guard", () => {
  it("preserves imageUrl for a small order and round-trips through a valid signature", () => {
    const model = confirmation(1, "/media/stores/store_demo/products/cover.webp");
    const value = buildConfirmationCookieValue(model);
    const decoded = decodeConfirmationCookieValue(value);
    expect(decoded).not.toBeNull();
    expect(decoded!.lines[0]!.imageUrl).toBe("/media/stores/store_demo/products/cover.webp");
    expect(decoded!.orderNumber).toBe("CO-1001");
  });

  it("drops line imageUrls when the value exceeds the size cap; order data stays intact", () => {
    // Cok kalemli + uzun URL'li siparis → gorsellerle deger tavani asar.
    const longUrl = `/media/stores/store_demo/products/${"x".repeat(90)}.webp`;
    const model = confirmation(40, longUrl);
    const value = buildConfirmationCookieValue(model);
    const decoded = decodeConfirmationCookieValue(value);
    expect(decoded).not.toBeNull();
    // Gorseller dusuruldu (thumbnail yer tutucuya iner)...
    expect(decoded!.lines.every((line) => line.imageUrl === null)).toBe(true);
    // ...ama onay verisi (siparis no + satir basliklari/tutarlari) BUTUN kalir.
    expect(decoded!.orderNumber).toBe("CO-1001");
    expect(decoded!.lines).toHaveLength(40);
    expect(decoded!.lines[0]!.title).toBe("Ürün 1");
    expect(decoded!.lines[39]!.lineTotalLabel).toBe("₺1.299,00");
  });

  it("keeps imageUrls for a small order below the cap (guard does not strip unnecessarily)", () => {
    const model = confirmation(1, "/media/stores/store_demo/products/cover.webp");
    const decoded = decodeConfirmationCookieValue(buildConfirmationCookieValue(model));
    expect(decoded!.lines[0]!.imageUrl).toBe("/media/stores/store_demo/products/cover.webp");
  });

  it("rejects a tampered value (signature mismatch → null)", () => {
    const value = buildConfirmationCookieValue(confirmation(1, null));
    const [payload] = value.split(".");
    // İmza dogru payload'a ait degil → decode null.
    expect(decodeConfirmationCookieValue(`${payload}.deadbeef`)).toBeNull();
    // Payload kurcalandi → imza uymaz.
    expect(decodeConfirmationCookieValue(`${payload}X.${value.split(".")[1]}`)).toBeNull();
  });
});
