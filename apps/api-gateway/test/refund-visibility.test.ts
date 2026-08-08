/**
 * TODO-174A — Birleşik iade/refund görünürlüğü SAF mapper testleri (DB'ye dokunmaz).
 */
import { describe, it, expect } from "vitest";
import {
  computeAdoptionRate,
  computeRefundDestinationReport,
  isAdminRowOverdue,
  mapAdminCancellationRow,
  mapAdminReturnRow,
  mapCustomerCancellationItem,
  mergeVisibilityRows,
  type AdminCancellationRowSource,
  type AdminReturnRowSource,
  type CustomerCancellationRowSource,
} from "../src/refunds/visibility.js";

const NOW = new Date("2026-08-07T12:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function returnSource(over: Partial<AdminReturnRowSource> = {}): AdminReturnRowSource {
  return {
    id: "rr_1",
    returnNumber: "R000001",
    status: "REQUESTED",
    resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
    refundDestination: null,
    requestedAt: new Date(NOW - 5 * DAY),
    returnWindowEndsAt: new Date(NOW + 5 * DAY),
    order: { orderNumber: "OS-000004" },
    customer: { firstName: "Umut", lastName: "Ç", email: "u@example.com" },
    items: [{ quantity: 2 }, { quantity: 1 }],
    ...over,
  };
}

function cancelSource(over: Partial<AdminCancellationRowSource> = {}): AdminCancellationRowSource {
  return {
    id: "ref_1",
    status: "SUCCEEDED",
    currency: "TRY",
    totalRefundMinor: 1_584_096,
    requestedAt: new Date(NOW - 1 * DAY),
    completedAt: new Date(NOW),
    order: {
      id: "ord_3",
      orderNumber: "OS-000003",
      cancelReasonCode: "WILL_NOT_ARRIVE_IN_TIME",
      customer: { firstName: "Umut", lastName: "Ç", email: "u@example.com" },
    },
    refundDestination: "ORIGINAL_PAYMENT",
    paymentAttempt: { method: "CARD", cardBrand: "Visa", cardLast4: "4242", manualMethod: null },
    ...over,
  };
}

describe("mapAdminReturnRow", () => {
  it("iade talebini birleşik satıra map'ler (refund alanları null)", () => {
    const row = mapAdminReturnRow(returnSource(), NOW);
    expect(row.source).toBe("RETURN_REQUEST");
    expect(row.detailKind).toBe("RETURN");
    expect(row.detailId).toBe("rr_1");
    expect(row.reference).toBe("R000001");
    expect(row.orderNumber).toBe("OS-000004");
    expect(row.customerName).toBe("Umut Ç");
    expect(row.itemCount).toBe(2);
    expect(row.totalQuantity).toBe(3);
    expect(row.ageDays).toBe(5);
    expect(row.resolutionType).toBe("REFUND_TO_ORIGINAL_PAYMENT");
    expect(row.returnStatus).toBe("REQUESTED");
    // Cancellation'a özgü alanlar null.
    expect(row.refundStatus).toBeNull();
    expect(row.refundAmountMinor).toBeNull();
    expect(row.cancellationReasonCode).toBeNull();
  });
});

describe("mapAdminCancellationRow", () => {
  it("cancellation refund'u birleşik satıra map'ler (return alanları null; maskeli yöntem)", () => {
    const row = mapAdminCancellationRow(cancelSource());
    expect(row.source).toBe("ORDER_CANCELLATION");
    expect(row.detailKind).toBe("ORDER");
    expect(row.detailId).toBe("ord_3");
    expect(row.reference).toBe("OS-000003");
    expect(row.orderNumber).toBe("OS-000003");
    expect(row.refundStatus).toBe("SUCCEEDED");
    expect(row.refundAmountMinor).toBe(1_584_096);
    expect(row.currency).toBe("TRY");
    expect(row.refundMethodLabel).toBe("Visa •••• 4242");
    expect(row.refundCompletedAt).toBe(new Date(NOW).toISOString());
    expect(row.cancellationReasonCode).toBe("WILL_NOT_ARRIVE_IN_TIME");
    // Return'e özgü alanlar null.
    expect(row.itemCount).toBeNull();
    expect(row.returnStatus).toBeNull();
    expect(row.resolutionType).toBeNull();
    expect(row.ageDays).toBeNull();
  });

  it("customer null → customerName null (Order.customer SetNull)", () => {
    const row = mapAdminCancellationRow(
      cancelSource({
        order: {
          id: "ord_3",
          orderNumber: "OS-000003",
          cancelReasonCode: null,
          customer: null,
        },
      }),
    );
    expect(row.customerName).toBeNull();
    expect(row.customerEmail).toBeNull();
    expect(row.cancellationReasonCode).toBeNull();
  });
});

describe("isAdminRowOverdue", () => {
  it("3+ gün açık iade talebi geciken", () => {
    expect(isAdminRowOverdue(mapAdminReturnRow(returnSource({ requestedAt: new Date(NOW - 4 * DAY) }), NOW))).toBe(true);
  });
  it("settled iade (COMPLETED) geciken DEĞİL", () => {
    expect(
      isAdminRowOverdue(
        mapAdminReturnRow(returnSource({ status: "COMPLETED", requestedAt: new Date(NOW - 9 * DAY) }), NOW),
      ),
    ).toBe(false);
  });
  it("cancellation satırı asla geciken değil (SLA yok)", () => {
    expect(isAdminRowOverdue(mapAdminCancellationRow(cancelSource()))).toBe(false);
  });
});

describe("mergeVisibilityRows", () => {
  it("createdAt'e göre azalan birleştirir ve sayfalar", () => {
    const rows = [
      mapAdminReturnRow(returnSource({ id: "a", requestedAt: new Date(NOW - 3 * DAY) }), NOW),
      mapAdminCancellationRow(
        cancelSource({
          requestedAt: new Date(NOW - 1 * DAY),
          order: {
            id: "b",
            orderNumber: "OS-000003",
            cancelReasonCode: "WILL_NOT_ARRIVE_IN_TIME",
            customer: { firstName: "U", lastName: "Ç", email: "u@example.com" },
          },
        }),
      ),
      mapAdminReturnRow(returnSource({ id: "c", requestedAt: new Date(NOW - 2 * DAY) }), NOW),
    ];
    const page = mergeVisibilityRows(rows, { skip: 0, take: 2, order: "desc" });
    expect(page.map((r) => r.detailId)).toEqual(["b", "c"]);
    const page2 = mergeVisibilityRows(rows, { skip: 2, take: 2, order: "desc" });
    expect(page2.map((r) => r.detailId)).toEqual(["a"]);
  });
});

describe("mapCustomerCancellationItem", () => {
  function custSource(over: Partial<CustomerCancellationRowSource> = {}): CustomerCancellationRowSource {
    return {
      status: "SUCCEEDED",
      currency: "TRY",
      totalRefundMinor: 1_584_096,
      requestedAt: new Date(NOW - 1 * DAY),
      completedAt: new Date(NOW),
      order: {
        orderNumber: "OS-000003",
        cancelReasonCode: "WILL_NOT_ARRIVE_IN_TIME",
        cancelReasonNote: null,
      },
      refundDestination: "SHOPPING_BALANCE",
      paymentAttempt: { method: "CARD", cardBrand: "Visa", cardLast4: "4242", manualMethod: null },
      ...over,
    };
  }

  it("SUCCEEDED → maskeli özet + insani neden kodu", () => {
    const item = mapCustomerCancellationItem(custSource());
    expect(item.source).toBe("ORDER_CANCELLATION");
    expect(item.reference).toBe("OS-000003");
    expect(item.refund?.status).toBe("SUCCEEDED");
    expect(item.refund?.refundedTotalMinor).toBe(1_584_096);
    expect(item.refund?.expectedTotalMinor).toBe(1_584_096);
    expect(item.refund?.methodLabel).toBe("Visa •••• 4242");
    expect(item.cancellationReasonCode).toBe("WILL_NOT_ARRIVE_IN_TIME");
    expect(item.returnStatus).toBeNull();
  });

  it("PENDING → 'işleniyor' (aktif)", () => {
    const item = mapCustomerCancellationItem(custSource({ status: "PENDING", completedAt: null }));
    expect(item.refund?.status).toBe("PENDING");
  });

  it("FAILED → FAILED (yanıltıcı success değil)", () => {
    const item = mapCustomerCancellationItem(custSource({ status: "FAILED", completedAt: null }));
    expect(item.refund?.status).toBe("FAILED");
  });

  it("OTHER + not → not korunur", () => {
    const item = mapCustomerCancellationItem(
      custSource({ order: { orderNumber: "OS-9", cancelReasonCode: "OTHER", cancelReasonNote: "Elden aldım" } }),
    );
    expect(item.cancellationReasonCode).toBe("OTHER");
    expect(item.cancellationReasonNote).toBe("Elden aldım");
  });
});

describe("TODO-175 computeAdoptionRate (Düzeltme D denominator)", () => {
  it("counts only choice-eligible refunds; credit-only excluded", () => {
    expect(
      computeAdoptionRate([
        { choiceEligible: true, destination: "SHOPPING_BALANCE" },
        { choiceEligible: true, destination: "ORIGINAL_PAYMENT" },
        { choiceEligible: false, destination: "SHOPPING_BALANCE" },
      ]),
    ).toBe(0.5);
  });
  it("returns null when no choice-eligible refunds (avoid NaN)", () => {
    expect(computeAdoptionRate([{ choiceEligible: false, destination: "SHOPPING_BALANCE" }])).toBeNull();
    expect(computeAdoptionRate([])).toBeNull();
  });
});

describe("TODO-175 computeRefundDestinationReport", () => {
  it("aggregates amounts, adoption, source breakdown", () => {
    const r = computeRefundDestinationReport([
      { source: "RETURN_REQUEST", destination: "ORIGINAL_PAYMENT", refundAmountMinor: 700, choiceEligible: true },
      { source: "RETURN_REQUEST", destination: "SHOPPING_BALANCE", refundAmountMinor: 300, choiceEligible: true },
      { source: "ORDER_CANCELLATION", destination: "SHOPPING_BALANCE", refundAmountMinor: 500, choiceEligible: true },
      { source: "ORDER_CANCELLATION", destination: "SHOPPING_BALANCE", refundAmountMinor: 400, choiceEligible: false },
    ]);
    expect(r.refundToOriginalMinor).toBe(700);
    expect(r.refundToShoppingBalanceMinor).toBe(1200);
    expect(r.returnCount).toBe(2);
    expect(r.cancellationCount).toBe(2);
    expect(r.shoppingBalanceAdoptionRate).toBeCloseTo(2 / 3, 5);
  });
});
