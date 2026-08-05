import { describe, it, expect } from "vitest";
import { allocateOrderDiscount, computeRefund } from "../src/returns/refund-calc";

describe("returns refund calc (ADR-269 §6/§12)", () => {
  it("full-line refund equals line gross when no order discount", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [
        { orderLineId: "l1", lineQuantity: 2, returnedQuantity: 2, lineGrossMinor: 20000, lineVatMinor: 3333 },
      ],
    });
    expect(r.productRefundMinor).toBe(20000);
    expect(r.taxRefundMinor).toBe(3333);
    expect(r.totalRefundMinor).toBe(20000); // tax inside gross, not re-added
  });

  it("partial quantity is pro-rated by returned/line quantity", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [
        { orderLineId: "l1", lineQuantity: 3, returnedQuantity: 1, lineGrossMinor: 30000, lineVatMinor: 4500 },
      ],
    });
    expect(r.productRefundMinor).toBe(10000);
    expect(r.taxRefundMinor).toBe(1500);
  });

  it("order-level discount is allocated by gross weight before pro-rating", () => {
    // Two lines gross 6000 / 4000, order discount 1000 → alloc 600 / 400.
    // Return all of line1: base = 6000-600 = 5400 → refund 5400.
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 1000,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [
        { orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 6000, lineVatMinor: null },
        { orderLineId: "l2", lineQuantity: 1, returnedQuantity: 0, lineGrossMinor: 4000, lineVatMinor: null },
      ],
    });
    expect(r.perLine[0].allocatedDiscountMinor).toBe(600);
    expect(r.perLine[1].allocatedDiscountMinor).toBe(400);
    expect(r.productRefundMinor).toBe(5400);
  });

  it("allocation remainder goes to the last positive-weight line (deterministic, exact)", () => {
    // weights 1/1/1, total 100 → floor 33/33/33 = 99, remainder 1 to last.
    const alloc = allocateOrderDiscount([1, 1, 1], 100);
    expect(alloc).toEqual([33, 33, 34]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("allocation ignores zero-weight lines for remainder placement", () => {
    const alloc = allocateOrderDiscount([1, 0, 1], 100);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100);
    expect(alloc[1]).toBe(0); // zero-weight line never receives remainder
  });

  it("free shipping → shipping refund is zero even if admin toggles it", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: true,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 5000, lineVatMinor: null }],
    });
    expect(r.shippingRefundMinor).toBe(0);
    expect(r.totalRefundMinor).toBe(5000);
  });

  it("paid shipping refunded only when admin opts in", () => {
    const base = {
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 2500,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 5000, lineVatMinor: null }],
    };
    expect(computeRefund({ ...base, refundShipping: false }).shippingRefundMinor).toBe(0);
    const withShip = computeRefund({ ...base, refundShipping: true });
    expect(withShip.shippingRefundMinor).toBe(2500);
    expect(withShip.totalRefundMinor).toBe(7500);
  });

  it("inclusive tax is never double-counted in the total", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 12000, lineVatMinor: 2000 }],
    });
    // total = product (12000, VAT-inclusive) + shipping (0); tax 2000 disclosed only.
    expect(r.totalRefundMinor).toBe(12000);
    expect(r.taxRefundMinor).toBe(2000);
  });

  it("legacy line without VAT snapshot → tax refund 0, product from gross", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 8000, lineVatMinor: null }],
    });
    expect(r.productRefundMinor).toBe(8000);
    expect(r.taxRefundMinor).toBe(0);
  });

  // TD-FR-7 — Kalem-bazli indirim SNAPSHOT'i varsa iade, kalemin FIILEN odedigi
  // (indirim uygulanmissa indirimli, degilse TAM) tutari yansitmali. Oransal
  // (gross-agirlikli) dagitim scope'lu indirimde YANLIS — indirimsiz kaleme
  // haksiz pay yukler (eksik-iade) ya da indirimli kaleme fazla-iade verir.
  describe("TD-FR-7 per-line discount snapshot (actually-paid)", () => {
    // OS-000004 / R000001 senaryosu: "Secili Urunlerde %20" YALNIZ Karaca'ya
    // uygulandi; Casper'a indirim YOK → musteri Casper'a TAM fiyat odedi.
    it("scoped discount: undiscounted line refunds full price (Casper)", () => {
      const r = computeRefund({
        currency: "TRY",
        orderLevelDiscountMinor: 396024, // toplam order indirimi (Karaca'ya dustu)
        shippingAmountMinor: 0,
        refundShipping: false,
        lines: [
          // Karaca — indirimli, iade EDILMIYOR
          { orderLineId: "karaca", lineQuantity: 1, returnedQuantity: 0, lineGrossMinor: 1980120, lineVatMinor: null, discountAllocatedMinor: 396024 },
          // Casper — indirimsiz, iade EDILIYOR → TAM fiyat
          { orderLineId: "casper", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 631350, lineVatMinor: null, discountAllocatedMinor: 0 },
        ],
      });
      expect(r.perLine.find((l) => l.orderLineId === "casper")!.productRefundMinor).toBe(631350);
      expect(r.productRefundMinor).toBe(631350);
    });

    it("scoped discount: discounted line refunds discounted amount (Karaca)", () => {
      const r = computeRefund({
        currency: "TRY",
        orderLevelDiscountMinor: 396024,
        shippingAmountMinor: 0,
        refundShipping: false,
        lines: [
          { orderLineId: "karaca", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 1980120, lineVatMinor: null, discountAllocatedMinor: 396024 },
          { orderLineId: "casper", lineQuantity: 1, returnedQuantity: 0, lineGrossMinor: 631350, lineVatMinor: null, discountAllocatedMinor: 0 },
        ],
      });
      // Karaca fiilen odedigi = 1980120 - 396024 = 1584096
      expect(r.perLine.find((l) => l.orderLineId === "karaca")!.productRefundMinor).toBe(1584096);
      expect(r.productRefundMinor).toBe(1584096);
      expect(r.perLine.find((l) => l.orderLineId === "karaca")!.allocatedDiscountMinor).toBe(396024);
    });

    it("snapshot ignores proportional orderLevelDiscount (uses per-line snapshot)", () => {
      // Snapshot modda orderLevelDiscountMinor ARTIK gross-agirlikli dagitilmaz.
      // Legacy olsaydi Casper'a 396024*631350/2611470≈95743 pay dusup iade
      // 535607 olurdu; snapshot ile TAM 631350 doner.
      const r = computeRefund({
        currency: "TRY",
        orderLevelDiscountMinor: 396024,
        shippingAmountMinor: 0,
        refundShipping: false,
        lines: [
          { orderLineId: "karaca", lineQuantity: 1, returnedQuantity: 0, lineGrossMinor: 1980120, lineVatMinor: null, discountAllocatedMinor: 396024 },
          { orderLineId: "casper", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 631350, lineVatMinor: null, discountAllocatedMinor: 0 },
        ],
      });
      expect(r.productRefundMinor).toBe(631350);
      expect(r.productRefundMinor).not.toBe(535607);
    });

    it("partial quantity on discounted line pro-rates the discounted base", () => {
      const r = computeRefund({
        currency: "TRY",
        orderLevelDiscountMinor: 1000,
        shippingAmountMinor: 0,
        refundShipping: false,
        lines: [
          // qty 4, indirim 1000 dusmus, 1 adet iade → base=10000-1000=9000, 9000*1/4=2250
          { orderLineId: "l1", lineQuantity: 4, returnedQuantity: 1, lineGrossMinor: 10000, lineVatMinor: null, discountAllocatedMinor: 1000 },
        ],
      });
      expect(r.productRefundMinor).toBe(2250);
    });

    it("snapshot invariant: Σ allocatedDiscount == order discount", () => {
      const lines = [
        { orderLineId: "a", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 6000, lineVatMinor: null, discountAllocatedMinor: 600 },
        { orderLineId: "b", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 4000, lineVatMinor: null, discountAllocatedMinor: 400 },
      ];
      const r = computeRefund({ currency: "TRY", orderLevelDiscountMinor: 1000, shippingAmountMinor: 0, refundShipping: false, lines });
      const sumAlloc = r.perLine.reduce((s, l) => s + l.allocatedDiscountMinor, 0);
      expect(sumAlloc).toBe(1000);
    });

    it("VAT disclosure is computed on the discounted (actually-paid) base", () => {
      // gross 12000, indirim 2000 dusmus → fiilen odenen 10000. VAT orani gross'ta
      // 2000/12000; iade edilen 10000'in icindeki VAT = round(2000*10000/12000)=1667.
      const r = computeRefund({
        currency: "TRY",
        orderLevelDiscountMinor: 2000,
        shippingAmountMinor: 0,
        refundShipping: false,
        lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 12000, lineVatMinor: 2000, discountAllocatedMinor: 2000 }],
      });
      expect(r.productRefundMinor).toBe(10000);
      expect(r.taxRefundMinor).toBe(1667);
    });

    it("mixed lines (one snapshot missing) → falls back to legacy proportional", () => {
      // Bir satirda snapshot yoksa (legacy siparis) TUM order legacy oransal yol.
      const r = computeRefund({
        currency: "TRY",
        orderLevelDiscountMinor: 1000,
        shippingAmountMinor: 0,
        refundShipping: false,
        lines: [
          { orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 6000, lineVatMinor: null, discountAllocatedMinor: 600 },
          { orderLineId: "l2", lineQuantity: 1, returnedQuantity: 0, lineGrossMinor: 4000, lineVatMinor: null }, // snapshot YOK
        ],
      });
      // Legacy: gross-agirlikli 600/400 → l1 base 5400.
      expect(r.perLine[0].allocatedDiscountMinor).toBe(600);
      expect(r.productRefundMinor).toBe(5400);
    });
  });
});
