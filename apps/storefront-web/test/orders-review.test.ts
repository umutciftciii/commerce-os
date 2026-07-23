import { describe, expect, it } from "vitest";
import type {
  CustomerOrderSummary,
  CustomerReview,
  ProductReviewStatus,
  ReviewEligibleOrderLine,
} from "@commerce-os/api-client";
import { resolveOrderReview } from "../lib/orders-review";

/**
 * TODO-159E hotfix — Sipariş yüzeyi yorum aksiyonu resolver testleri. Uygunluk
 * SUNUCU verisinden (eligible + reviews) türetilir; bu saf fonksiyon yalnız o veriyi
 * ilgili siparişe eşler. Senaryolar: teslim+ödenmiş → yazılabilir, unpaid/teslim
 * değil/iptal → uygun değil, mevcut yorum durumları, çok ürün, cross-order sızıntı guard.
 */

function order(overrides: Partial<CustomerOrderSummary> = {}): CustomerOrderSummary {
  return {
    orderNumber: "OS-1",
    status: "FULFILLED",
    paymentStatus: "PAID",
    fulfillmentStatus: "FULFILLED",
    currency: "TRY",
    totalMinor: 1000,
    itemCount: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    shipmentStatus: null,
    lines: [
      { variantId: "v1", productSlug: "tablet", sku: "TB-1", title: "Tablet", variantTitle: "Yeşil", quantity: 1, imageUrl: null },
    ],
    ...overrides,
  };
}

function eligibleLine(overrides: Partial<ReviewEligibleOrderLine> = {}): ReviewEligibleOrderLine {
  return {
    orderLineId: "ol-1",
    orderId: "ord-1",
    orderNumber: "OS-1",
    productId: "p-tablet",
    productTitle: "Tablet",
    productSlug: "tablet",
    productImageUrl: null,
    variantLabel: "Yeşil / 1 TB",
    purchasedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function review(overrides: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id: "rv-1",
    productId: "p-tablet",
    productTitle: "Tablet",
    productSlug: "tablet",
    productImageUrl: null,
    variantLabel: "Yeşil / 1 TB",
    rating: 5,
    title: null,
    body: "Harika",
    status: "PENDING" as ProductReviewStatus,
    verifiedPurchase: true,
    helpfulCount: 0,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    publishedAt: null,
    editable: true,
    ...overrides,
  };
}

describe("resolveOrderReview", () => {
  it("paid + delivered eligible line → tek yorumlanabilir kalem (form açılır)", () => {
    const state = resolveOrderReview(order(), [eligibleLine()], []);
    expect(state.actionable).toBe(true);
    expect(state.visible).toBe(true);
    expect(state.reviewable).toHaveLength(1);
    expect(state.reviewable[0].orderLineId).toBe("ol-1");
    expect(state.reviewed).toHaveLength(0);
  });

  it("unpaid → uygun değil (reason unpaid)", () => {
    const state = resolveOrderReview(
      order({ paymentStatus: "UNPAID", fulfillmentStatus: "UNFULFILLED", status: "PLACED" }),
      [],
      [],
    );
    expect(state.actionable).toBe(false);
    expect(state.visible).toBe(false);
    expect(state.reason).toBe("unpaid");
  });

  it("teslim edilmemiş → uygun değil (reason not-delivered)", () => {
    const state = resolveOrderReview(
      order({ fulfillmentStatus: "UNFULFILLED", status: "PLACED" }),
      [],
      [],
    );
    expect(state.actionable).toBe(false);
    expect(state.reason).toBe("not-delivered");
  });

  it("iptal / iade → uygun değil (reason cancelled)", () => {
    expect(resolveOrderReview(order({ status: "CANCELLED" }), [], []).reason).toBe("cancelled");
    expect(resolveOrderReview(order({ paymentStatus: "REFUNDED" }), [], []).reason).toBe("cancelled");
  });

  it("daha önce yorumlanmış (eligible'da yok) → form açılmaz, durum gösterilir", () => {
    const state = resolveOrderReview(order(), [], [review({ status: "PENDING" })]);
    expect(state.actionable).toBe(false);
    expect(state.visible).toBe(true);
    expect(state.reviewable).toHaveLength(0);
    expect(state.reviewed).toHaveLength(1);
    expect(state.reviewed[0].status).toBe("PENDING");
  });

  it("approved yorum → reviewed APPROVED (görüntüle bağlantısı için)", () => {
    const state = resolveOrderReview(order(), [], [review({ status: "APPROVED", editable: true })]);
    expect(state.reviewed[0].status).toBe("APPROVED");
    expect(state.reviewed[0].productSlug).toBe("tablet");
  });

  it("birden fazla ürün → birden fazla yorumlanabilir kalem", () => {
    const multi = order({
      lines: [
        { variantId: "v1", productSlug: "tablet", sku: "TB-1", title: "Tablet", variantTitle: "Yeşil", quantity: 1, imageUrl: null },
        { variantId: "v2", productSlug: "kulaklik", sku: "KL-1", title: "Kulaklık", variantTitle: "Siyah", quantity: 1, imageUrl: null },
      ],
    });
    const state = resolveOrderReview(multi, [
      eligibleLine({ orderLineId: "ol-1", productSlug: "tablet", productId: "p-tablet" }),
      eligibleLine({ orderLineId: "ol-2", productSlug: "kulaklik", productId: "p-kulaklik", productTitle: "Kulaklık" }),
    ], []);
    expect(state.reviewable).toHaveLength(2);
    expect(state.reviewable.map((i) => i.orderLineId)).toEqual(["ol-1", "ol-2"]);
  });

  it("çok ürün: bir kalem yazılabilir + biri yorumlanmış → ikisi ayrı gösterilir", () => {
    const multi = order({
      lines: [
        { variantId: "v1", productSlug: "tablet", sku: "TB-1", title: "Tablet", variantTitle: "Yeşil", quantity: 1, imageUrl: null },
        { variantId: "v2", productSlug: "kulaklik", sku: "KL-1", title: "Kulaklık", variantTitle: "Siyah", quantity: 1, imageUrl: null },
      ],
    });
    const state = resolveOrderReview(
      multi,
      [eligibleLine({ orderLineId: "ol-2", productSlug: "kulaklik", productId: "p-kulaklik", productTitle: "Kulaklık" })],
      [review({ productSlug: "tablet", productId: "p-tablet", status: "APPROVED" })],
    );
    expect(state.reviewable.map((i) => i.productSlug)).toEqual(["kulaklik"]);
    expect(state.reviewed.map((i) => i.productSlug)).toEqual(["tablet"]);
    expect(state.actionable).toBe(true);
  });

  it("eligible yalnız aynı orderNumber ile eşlenir (başka siparişin kalemi sızmaz)", () => {
    const state = resolveOrderReview(order({ orderNumber: "OS-1" }), [
      eligibleLine({ orderNumber: "OS-2", orderLineId: "ol-x" }),
    ], []);
    expect(state.reviewable).toHaveLength(0);
    expect(state.actionable).toBe(false);
  });

  it("cross-order sızıntı guard: teslim EDİLMEMİŞ siparişte başka siparişin yorumu gösterilmez", () => {
    // Müşteri aynı ürünü iki kez aldı: OS-1 (teslim edildi, yorumlandı) ve OS-2 (henüz teslim edilmedi).
    // OS-2 için resolver, productSlug eşleşse bile mevcut yorumu GÖSTERMEZ.
    const undelivered = order({ orderNumber: "OS-2", fulfillmentStatus: "UNFULFILLED", status: "PLACED" });
    const state = resolveOrderReview(undelivered, [], [review({ status: "APPROVED", productSlug: "tablet" })]);
    expect(state.reviewed).toHaveLength(0);
    expect(state.actionable).toBe(false);
    expect(state.reason).toBe("not-delivered");
  });

  it("eligible bir kalem varsa aynı ürünün yorumu tekrar 'reviewed' olarak listelenmez", () => {
    const state = resolveOrderReview(
      order(),
      [eligibleLine({ productSlug: "tablet" })],
      [review({ productSlug: "tablet", status: "APPROVED" })],
    );
    expect(state.reviewable).toHaveLength(1);
    expect(state.reviewed).toHaveLength(0);
  });
});
