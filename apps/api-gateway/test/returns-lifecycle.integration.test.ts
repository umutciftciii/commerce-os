/**
 * TODO-169 / ADR-269 post-audit hardening — Returns orchestration GERCEK-DB entegrasyon testleri
 * (T7). Saf-fonksiyon testleri (returns-projection/status-map) bu davranislari KANITLAMAZ; burada
 * gercek tx + state-machine + refund-intent lifecycle + optimistic version + concurrency dogrulanir.
 *
 * DATABASE_URL verilmezse SKIP (CI-safe). Bkz. helpers/returns-db.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import {
  createReturnRequest,
  applyReturnTransition,
  applyRestockForItem,
} from "../src/returns/service.js";
import { computeReturnOrderSummaries } from "../src/returns/projection.js";
import {
  adminReturnAction,
  buildReturnAdminApp,
  currentReturnVersion,
  hasTestDb,
  loadReturnState,
  seedDeliveredOrder,
  type SeededOrder,
} from "./helpers/returns-db.js";

describe.skipIf(!hasTestDb)("Returns lifecycle (live DB)", () => {
  let seeded: SeededOrder | null = null;
  afterEach(async () => {
    if (seeded) await seeded.cleanup();
    seeded = null;
  });

  async function createRefundReturn(s: SeededOrder) {
    const res = await createReturnRequest(
      {
        storeId: s.storeId,
        customerId: s.customerId,
        orderNumber: s.orderNumber,
        resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
        items: [{ orderLineId: s.orderLineId, quantity: s.lineQuantity, reason: "NO_LONGER_NEEDED" }],
      },
      new Date(),
    );
    if (!res.ok) throw new Error(`createReturnRequest failed: ${res.code}`);
    return res.returnRequestId;
  }

  it("approve REFUND talebinde PENDING refund intent olusturur", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);

    const approve = await adminReturnAction(app, seeded.storeId, rrId, "approve", {});
    expect(approve.statusCode).toBe(200);

    const state = await loadReturnState(seeded.storeId, rrId);
    expect(state?.refundIntent?.status).toBe("PENDING");
    await app.close();
  });

  it("approve → inspect → reject: PENDING intent AYNI tx'te CANCELLED olur (R1)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);

    // approve → APPROVED→AWAITING_SHIPMENT (intent PENDING)
    await adminReturnAction(app, seeded.storeId, rrId, "approve", {});
    // musteri kargoya verdi (CUSTOMER gecisi — servis dogrudan)
    await applyReturnTransition(seeded.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: seeded.customerId });
    // admin teslim aldi
    await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "RECEIVED" });
    // admin inceledi
    await adminReturnAction(app, seeded.storeId, rrId, "inspect", {
      items: [
        {
          returnItemId: await firstReturnItemId(seeded.storeId, rrId),
          conditionStatus: "DAMAGED",
          inspectionResult: "FAILED",
          restockDecision: "DO_NOT_RESTOCK",
        },
      ],
    });
    // admin reddetti (INSPECTED → REJECTED, terminal non-refund)
    const reject = await adminReturnAction(app, seeded.storeId, rrId, "reject", {
      rejectionReason: "Hasarli iade; kabul edilmedi.",
    });
    expect(reject.statusCode).toBe(200);

    const state = await loadReturnState(seeded.storeId, rrId);
    expect(state?.status).toBe("REJECTED");
    // R1: refund'suz terminal → intent CANCELLED, silinmez, neden yazili.
    expect(state?.refundIntent?.status).toBe("CANCELLED");
    expect(state?.refundIntent?.cancelledAt).not.toBeNull();
    expect(state?.refundIntent?.cancellationReason).toBeTruthy();
    await app.close();
  });

  it("iptal edilen intent projeksiyonda pending finansal etki URETMEZ (R1)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    await driveToReject(app, seeded, rrId);

    const summaries = await computeReturnOrderSummaries(
      prisma,
      seeded.storeId,
      [{ id: seeded.orderId, currency: "TRY" }],
      { returnWindowDays: 14 },
      new Date(),
    );
    const summary = summaries.get(seeded.orderId)!;
    expect(summary.hasPendingFinancialImpact).toBe(false);
    expect(summary.approvedRefundIntentMinor).toBe(0);
    await app.close();
  });

  it("iki eszamanli approve: tam olarak biri 200, digeri 409 VERSION_CONFLICT (R3)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    const v = await currentReturnVersion(seeded.storeId, rrId);

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/stores/${seeded.storeId}/returns/${rrId}/approve`, payload: { expectedVersion: v } }),
      app.inject({ method: "POST", url: `/stores/${seeded.storeId}/returns/${rrId}/approve`, payload: { expectedVersion: v } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const conflict = [a, b].find((r) => r.statusCode === 409)!;
    expect(conflict.json().error.code).toBe("VERSION_CONFLICT");
    // Bayat approve yan etki uretmez → yalniz TEK refund intent olusur.
    const intents = await prisma.refundIntent.count({ where: { storeId: seeded.storeId, returnRequestId: rrId } });
    expect(intents).toBe(1);
    await app.close();
  });

  it("stale version ile reject 409 VERSION_CONFLICT dondurur, yan etki yok (R3)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    const stale = await currentReturnVersion(seeded.storeId, rrId); // 0
    // Baska bir gecis version'i ilerletsin.
    await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "UNDER_REVIEW" });

    const reject = await app.inject({
      method: "POST",
      url: `/stores/${seeded.storeId}/returns/${rrId}/reject`,
      payload: { rejectionReason: "stale attempt", expectedVersion: stale },
    });
    expect(reject.statusCode).toBe(409);
    expect(reject.json().error.code).toBe("VERSION_CONFLICT");
    const state = await loadReturnState(seeded.storeId, rrId);
    expect(state?.status).toBe("UNDER_REVIEW"); // reject uygulanmadi
    await app.close();
  });

  it("iki eszamanli create ayni satiri over-claim ETMEZ (R2)", async () => {
    seeded = await seedDeliveredOrder({ lineQuantity: 1 });
    const mk = () =>
      createReturnRequest(
        {
          storeId: seeded!.storeId,
          customerId: seeded!.customerId,
          orderNumber: seeded!.orderNumber,
          resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
          items: [{ orderLineId: seeded!.orderLineId, quantity: 1, reason: "NO_LONGER_NEEDED" }],
        },
        new Date(),
      );

    const [a, b] = await Promise.all([mk(), mk()]);
    const oks = [a, b].filter((r) => r.ok).length;
    expect(oks).toBe(1); // tam olarak biri basarili
    // Toplam tutulan iade adedi satin alinani (1) asmaz → yalniz TEK return item.
    const items = await prisma.returnItem.count({ where: { storeId: seeded.storeId, orderLineId: seeded.orderLineId } });
    expect(items).toBe(1);
  });

  it("REFUND_PENDING → COMPLETED admin tarafindan YASAK (R5; TODO-170 gelene kadar)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    await driveToRefundPending(app, seeded, rrId);

    const complete = await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "COMPLETED" });
    expect(complete.statusCode).toBe(409);
    expect(complete.json().error.code).toBe("COMPLETION_NOT_ALLOWED");
    const state = await loadReturnState(seeded.storeId, rrId);
    expect(state?.status).toBe("REFUND_PENDING"); // en ileri finansal durum
    await app.close();
  });

  it("TD-FR-7 — admin cannot CLOSE a REFUND_PENDING return (no silent close, 409 REFUND_UNSETTLED)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    await driveToRefundPending(app, seeded, rrId);

    const v = await currentReturnVersion(seeded.storeId, rrId);
    const res = await app.inject({
      method: "POST",
      url: `/stores/${seeded.storeId}/returns/${rrId}/transition`,
      payload: { targetStatus: "CLOSED", expectedVersion: v },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("REFUND_UNSETTLED");

    const st = await loadReturnState(seeded.storeId, rrId);
    expect(st?.status).toBe("REFUND_PENDING"); // hâlâ pending; intent iptal edilmedi
    expect(st?.refundIntent?.status).toBe("PENDING");
    await app.close();
  });

  it("REPLACEMENT_PENDING → COMPLETED admin tarafindan YASAK (R5)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const res = await createReturnRequest(
      {
        storeId: seeded.storeId,
        customerId: seeded.customerId,
        orderNumber: seeded.orderNumber,
        resolutionType: "REPLACEMENT",
        items: [{ orderLineId: seeded.orderLineId, quantity: seeded.lineQuantity, reason: "NOT_AS_DESCRIBED", customerComment: "yanlis" }],
      },
      new Date(),
    );
    if (!res.ok) throw new Error(res.code);
    const rrId = res.returnRequestId;
    await driveToInspected(app, seeded, rrId);
    await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "REPLACEMENT_PENDING" });

    const complete = await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "COMPLETED" });
    expect(complete.statusCode).toBe(409);
    expect(complete.json().error.code).toBe("COMPLETION_NOT_ALLOWED");
    await app.close();
  });

  it("restock idempotent: RESTOCK_AS_SELLABLE ikinci cagride stok ARTMAZ (T7)", async () => {
    seeded = await seedDeliveredOrder({ lineQuantity: 2 });
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    await adminReturnAction(app, seeded.storeId, rrId, "approve", {});
    await applyReturnTransition(seeded.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: seeded.customerId });
    await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "RECEIVED" });
    const returnItemId = await firstReturnItemId(seeded.storeId, rrId);
    await adminReturnAction(app, seeded.storeId, rrId, "inspect", {
      items: [{ returnItemId, conditionStatus: "NEW_UNOPENED", inspectionResult: "PASSED", restockDecision: "RESTOCK_AS_SELLABLE" }],
    });

    const afterInspect = await prisma.inventoryItem.findFirst({ where: { storeId: seeded.storeId, variantId: seeded.variantId }, select: { quantityOnHand: true } });
    expect(afterInspect?.quantityOnHand).toBe(2);

    // Idempotent: tekrar restock cagrisi restockedAt guard'i ile no-op.
    await prisma.$transaction((tx) => applyRestockForItem(tx, seeded!.storeId, returnItemId, "test-admin"));
    const afterSecond = await prisma.inventoryItem.findFirst({ where: { storeId: seeded.storeId, variantId: seeded.variantId }, select: { quantityOnHand: true } });
    expect(afterSecond?.quantityOnHand).toBe(2); // artmadi
    await app.close();
  });

  it("tx rollback: onCommit throw ederse durum/history yazilmaz (T7)", async () => {
    seeded = await seedDeliveredOrder();
    const rrId = await createRefundReturn(seeded);

    await expect(
      applyReturnTransition(seeded.storeId, rrId, "UNDER_REVIEW", { type: "ADMIN", id: "test-admin" }, {
        onCommit: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow();

    const state = await loadReturnState(seeded.storeId, rrId);
    expect(state?.status).toBe("REQUESTED"); // gecis rollback
    expect(state?.history.some((h) => h.toStatus === "UNDER_REVIEW")).toBe(false);
  });
});

async function firstReturnItemId(storeId: string, returnRequestId: string): Promise<string> {
  const item = await prisma.returnItem.findFirst({ where: { storeId, returnRequestId }, select: { id: true } });
  if (!item) throw new Error("return item not found");
  return item.id;
}

/** approve → RETURN_SHIPPED → RECEIVED → INSPECTED (fail/no-restock) yolunu surer. */
async function driveToInspected(
  app: ReturnType<typeof buildReturnAdminApp>,
  s: SeededOrder,
  rrId: string,
): Promise<void> {
  await adminReturnAction(app, s.storeId, rrId, "approve", {});
  await applyReturnTransition(s.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: s.customerId });
  await adminReturnAction(app, s.storeId, rrId, "transition", { targetStatus: "RECEIVED" });
  await adminReturnAction(app, s.storeId, rrId, "inspect", {
    items: [
      {
        returnItemId: await firstReturnItemId(s.storeId, rrId),
        conditionStatus: "DAMAGED",
        inspectionResult: "FAILED",
        restockDecision: "DO_NOT_RESTOCK",
      },
    ],
  });
}

/** driveToInspected + INSPECTED → REJECTED (terminal non-refund). */
async function driveToReject(
  app: ReturnType<typeof buildReturnAdminApp>,
  s: SeededOrder,
  rrId: string,
): Promise<void> {
  await driveToInspected(app, s, rrId);
  await adminReturnAction(app, s.storeId, rrId, "reject", { rejectionReason: "Reddedildi." });
}

/** driveToInspected + INSPECTED → REFUND_PENDING (finansal iade bekliyor). */
async function driveToRefundPending(
  app: ReturnType<typeof buildReturnAdminApp>,
  s: SeededOrder,
  rrId: string,
): Promise<void> {
  await driveToInspected(app, s, rrId);
  await adminReturnAction(app, s.storeId, rrId, "transition", { targetStatus: "REFUND_PENDING" });
}
