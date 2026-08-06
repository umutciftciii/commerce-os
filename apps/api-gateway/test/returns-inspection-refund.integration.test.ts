/**
 * TD-FR-7 Faz 1 / Task 4 — Inspection → refund orchestration (tek aksiyon, "İadeyi yap")
 * GERCEK-DB entegrasyon testleri.
 *
 * `POST /returns/:id/inspect-decision`: inceleme kararını (kalem condition/sonuç/stok kararı)
 * kaydeder + kabul edilen (Σ approvedQuantity > 0 — approve aşamasında zaten sabitlenmiş) adet
 * varsa AYNI tx'te INSPECTED → REFUND_PENDING + refund intent tazeleme yapar; tx commit SONRASI
 * initiateRefund çağrılır (provider I/O asla DB tx içinde değil). Reddedilen adet
 * upsertRefundIntentForReturn'ün approvedQuantity kullanımı sayesinde refund'a GİRMEZ.
 *
 * DATABASE_URL verilmezse SKIP (CI-safe). Bkz. helpers/returns-db.ts.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { applyReturnTransition } from "../src/returns/service.js";
import { initiateRefund } from "../src/refunds/service.js";
import { createRefundProviderPort } from "../src/refunds/mock-refund.js";
import {
  adminReturnAction,
  buildReturnAdminApp,
  createTwoLineRefundReturn,
  currentReturnVersion,
  hasTestDb,
  loadOrderRefunds,
  loadReturnState,
  returnItemIdByLine,
  seedTwoLineDeliveredOrder,
  type SeededTwoLineOrder,
} from "./helpers/returns-db.js";

const refundDeps = { providerPort: createRefundProviderPort() };

describe.skipIf(!hasTestDb)("Inspection → refund orchestration (live DB, TD-FR-7 Faz 1 Task 4)", () => {
  let seeded: SeededTwoLineOrder | null = null;
  afterEach(async () => {
    if (seeded) await seeded.cleanup();
    seeded = null;
  });

  /** approve (verilen per-line approvedQuantity) → RETURN_SHIPPED → RECEIVED yolunu sürer. */
  async function driveToReceived(
    app: ReturnType<typeof buildReturnAdminApp>,
    s: SeededTwoLineOrder,
    rrId: string,
    approvals: Array<{ orderLineId: string; approvedQuantity: number }>,
  ): Promise<void> {
    const items = await Promise.all(
      approvals.map(async (a) => ({
        returnItemId: await returnItemIdByLine(s.storeId, rrId, a.orderLineId),
        approvedQuantity: a.approvedQuantity,
      })),
    );
    const approve = await adminReturnAction(app, s.storeId, rrId, "approve", { items });
    expect(approve.statusCode).toBe(200);
    await applyReturnTransition(s.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: s.customerId });
    const received = await adminReturnAction(app, s.storeId, rrId, "transition", { targetStatus: "RECEIVED" });
    expect(received.statusCode).toBe(200);
  }

  it("tam kabul (her iki kalem accept) → refund intent tam tutar → OrderRefund SUCCEEDED (MOCK) → COMPLETED", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId, [
      { orderLineId: s.lineAId, approvedQuantity: s.quantityA },
      { orderLineId: s.lineBId, approvedQuantity: s.quantityB },
    ]);

    const lineAItemId = await returnItemIdByLine(s.storeId, rrId, s.lineAId);
    const lineBItemId = await returnItemIdByLine(s.storeId, rrId, s.lineBId);
    const res = await adminReturnAction(app, s.storeId, rrId, "inspect-decision", {
      items: [
        {
          returnItemId: lineAItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "RESTOCK_AS_SELLABLE",
        },
        {
          returnItemId: lineBItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "RESTOCK_AS_SELLABLE",
        },
      ],
    });
    expect(res.statusCode).toBe(200);

    const expectedTotal = s.unitPriceMinorA * s.quantityA + s.unitPriceMinorB * s.quantityB;
    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.refundIntent?.totalRefundMinor).toBe(expectedTotal);
    expect(state?.status).toBe("COMPLETED");

    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe("SUCCEEDED");
    expect(refunds[0].totalRefundMinor).toBe(expectedTotal);

    await app.close();
  });

  it("kısmi (A accept, B reject) → refund YALNIZ A'nın tutarı; B refund'a girmez; COMPLETED", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId, [
      { orderLineId: s.lineAId, approvedQuantity: s.quantityA },
      { orderLineId: s.lineBId, approvedQuantity: 0 },
    ]);

    const lineAItemId = await returnItemIdByLine(s.storeId, rrId, s.lineAId);
    const lineBItemId = await returnItemIdByLine(s.storeId, rrId, s.lineBId);
    const res = await adminReturnAction(app, s.storeId, rrId, "inspect-decision", {
      items: [
        {
          returnItemId: lineAItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "RESTOCK_AS_SELLABLE",
        },
        {
          returnItemId: lineBItemId,
          conditionStatus: "DAMAGED",
          inspectionResult: "FAILED",
          restockDecision: "DO_NOT_RESTOCK",
        },
      ],
    });
    expect(res.statusCode).toBe(200);

    const expectedA = s.unitPriceMinorA * s.quantityA;
    const state = await loadReturnState(s.storeId, rrId);
    // Refund yalnız A'nın tutarı — B (reddedilen) refund'a GİRMEZ.
    expect(state?.refundIntent?.totalRefundMinor).toBe(expectedA);
    expect(state?.status).toBe("COMPLETED");

    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].totalRefundMinor).toBe(expectedA);

    // B DO_NOT_RESTOCK kararına saygı: stok artmadı.
    const invB = await prisma.inventoryItem.findFirst({ where: { storeId: s.storeId, variantId: s.variantBId } });
    expect(invB?.quantityOnHand ?? 0).toBe(0);

    // A RESTOCK_AS_SELLABLE: stok arttı (approvedQuantity kadar).
    const invA = await prisma.inventoryItem.findFirst({ where: { storeId: s.storeId, variantId: s.variantAId } });
    expect(invA?.quantityOnHand ?? 0).toBe(s.quantityA);

    await app.close();
  });

  it("tam red (hiç kabul yok) → refund başlatılmaz; REFUND_PENDING'e geçilmez (mevcut reject akışı)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);

    // İlk gerçek admin kararı doğrudan red — hiç kabul yok, inspect-decision'a hiç ulaşılmaz.
    const reject = await adminReturnAction(app, s.storeId, rrId, "reject", {
      rejectionReason: "Müşteri talebi değerlendirildi, uygun bulunmadı.",
    });
    expect(reject.statusCode).toBe(200);

    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("REJECTED");
    // Refund hiç başlatılmaz — talep hiçbir zaman REFUND_PENDING'e geçmedi.
    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(0);

    await app.close();
  });

  it("provider failure (refund_failure) decision'ı SİLMEZ: OrderRefund FAILED ama inceleme kaydı + REFUND_PENDING korunur", async () => {
    seeded = await seedTwoLineDeliveredOrder({ paymentScenario: "refund_failure" });
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId, [
      { orderLineId: s.lineAId, approvedQuantity: s.quantityA },
      { orderLineId: s.lineBId, approvedQuantity: s.quantityB },
    ]);

    const lineAItemId = await returnItemIdByLine(s.storeId, rrId, s.lineAId);
    const lineBItemId = await returnItemIdByLine(s.storeId, rrId, s.lineBId);
    const res = await adminReturnAction(app, s.storeId, rrId, "inspect-decision", {
      items: [
        {
          returnItemId: lineAItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "RESTOCK_AS_SELLABLE",
        },
        {
          returnItemId: lineBItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "RESTOCK_AS_SELLABLE",
        },
      ],
    });
    // Orchestration HTTP çağrısı başarılı — provider hatası ayrı bir ledger satırında görünür,
    // kör (silent) bir HTTP hatasına dönüşmez (decision zaten commit edildi).
    expect(res.statusCode).toBe(200);

    const state = await loadReturnState(s.storeId, rrId);
    // İnceleme kararı + REFUND_PENDING geçişi korunur (provider hatası decision'ı SİLMEZ).
    expect(state?.status).toBe("REFUND_PENDING");
    expect(state?.refundIntent?.status).toBe("CONSUMED");

    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe("FAILED");
    expect(refunds[0].failureCode).toBe("REFUND_DECLINED");

    // İnceleme kaydı gerçekten yazıldı (kör retry değil, gerçek DB state — admin retry/refund
    // panelinden tekrar deneyebilir; inceleme kararını YENİDEN girmesi gerekmez).
    const items = await prisma.returnItem.findMany({ where: { storeId: s.storeId, returnRequestId: rrId } });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.inspectionResult === "PASSED")).toBe(true);
    expect(items.every((i) => i.approvedQuantity !== null)).toBe(true);

    await app.close();
  });

  it("fix round 1 (Important) — initiateRefund cap aşımı (EXCEEDS_REFUNDABLE) → route AÇIK 4xx döner (sessiz-başarı YOK); return REFUND_PENDING'de kalır; bu talep için OrderRefund satırı OLUŞMAZ", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const capturedMinor = s.unitPriceMinorA * s.quantityA + s.unitPriceMinorB * s.quantityB;

    // Siparişin captured'ının TAMAMINI ilgisiz bir başka iade ile tüket (MOCK → SUCCEEDED) —
    // gerçekçi yarış: iki iade aynı siparişin cap'ini paylaşır.
    const otherReturn = await prisma.returnRequest.create({
      data: {
        storeId: s.storeId,
        orderId: s.orderId,
        customerId: s.customerId,
        returnNumber: `OTH-${randomUUID().slice(0, 8)}`,
        status: "REFUND_PENDING",
        resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
        returnWindowEndsAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const otherIntent = await prisma.refundIntent.create({
      data: {
        storeId: s.storeId,
        returnRequestId: otherReturn.id,
        orderId: s.orderId,
        paymentAttemptId: s.paymentAttemptId,
        currency: "TRY",
        productRefundMinor: capturedMinor,
        shippingRefundMinor: 0,
        taxRefundMinor: 0,
        totalRefundMinor: capturedMinor,
        status: "PENDING",
        idempotencyKey: `refund-intent:${otherReturn.id}`,
      },
    });
    const drain = await initiateRefund(
      { storeId: s.storeId, refundIntentId: otherIntent.id, expectedReturnVersion: 0, actorUserId: "test-admin" },
      refundDeps,
    );
    expect(drain.ok).toBe(true); // kalan artık 0

    // Gerçek iki-kalemli iade akışını INSPECTED'e (ve orchestration çağrısına) kadar sür.
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId, [
      { orderLineId: s.lineAId, approvedQuantity: s.quantityA },
      { orderLineId: s.lineBId, approvedQuantity: s.quantityB },
    ]);
    const lineAItemId = await returnItemIdByLine(s.storeId, rrId, s.lineAId);
    const lineBItemId = await returnItemIdByLine(s.storeId, rrId, s.lineBId);
    const res = await adminReturnAction(app, s.storeId, rrId, "inspect-decision", {
      items: [
        {
          returnItemId: lineAItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "DO_NOT_RESTOCK",
        },
        {
          returnItemId: lineBItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "DO_NOT_RESTOCK",
        },
      ],
    });

    // Sessiz-başarı YOK: route 200 DÖNMEZ; admin açık bir hata görür.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).not.toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("REFUND_INITIATE_FAILED");
    expect(body.error.details?.refundErrorCode).toBe("EXCEEDS_REFUNDABLE");

    // İnceleme kararı + REFUND_PENDING geçişi GERİ ALINMADI (ayrı tx zaten commit edildi) —
    // ama bu talep için hiçbir OrderRefund satırı OLUŞMADI (cap invariant attempt oluşmadan önce
    // reddetti); admin manuel refund panelinden tekrar deneyebilir.
    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("REFUND_PENDING");
    expect(state?.refundIntent?.status).toBe("PENDING"); // hiç consume edilmedi (attempt oluşmadı)
    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(0);

    await app.close();
  });

  it("fix round 1 (Minor) — inspect-decision iki kez (aynı version, eşzamanlı) → yalnız biri başarılı; YALNIZ 1 OrderRefund üretilir (çift refund yok)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId, [
      { orderLineId: s.lineAId, approvedQuantity: s.quantityA },
      { orderLineId: s.lineBId, approvedQuantity: s.quantityB },
    ]);
    const lineAItemId = await returnItemIdByLine(s.storeId, rrId, s.lineAId);
    const lineBItemId = await returnItemIdByLine(s.storeId, rrId, s.lineBId);
    const version = await currentReturnVersion(s.storeId, rrId);
    const payload = {
      expectedVersion: version,
      items: [
        {
          returnItemId: lineAItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "DO_NOT_RESTOCK",
        },
        {
          returnItemId: lineBItemId,
          conditionStatus: "NEW_UNOPENED",
          inspectionResult: "PASSED",
          restockDecision: "DO_NOT_RESTOCK",
        },
      ],
    };

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/stores/${s.storeId}/returns/${rrId}/inspect-decision`, payload }),
      app.inject({ method: "POST", url: `/stores/${s.storeId}/returns/${rrId}/inspect-decision`, payload }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400); // VERSION_CONFLICT (ikinci çağrı bayat version görür)

    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe("SUCCEEDED");
    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("COMPLETED");

    await app.close();
  });

  it("fix round 2 (Important #2) — reject after inspection (store-admin-web two-step flow: /inspect → /reject) does NOT restock even when items carry a stale restockDecision", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId, [
      { orderLineId: s.lineAId, approvedQuantity: s.quantityA },
      { orderLineId: s.lineBId, approvedQuantity: s.quantityB },
    ]);

    const lineAItemId = await returnItemIdByLine(s.storeId, rrId, s.lineAId);
    const lineBItemId = await returnItemIdByLine(s.storeId, rrId, s.lineBId);

    // store-admin-web'in onReject handler'ı (apps/store-admin-web/app/(app)/orders/returns/[id]/page.tsx)
    // her kalemin restockDecision'ını DO_NOT_RESTOCK'a ZORLAR (dialog'daki varsayılan/seçili
    // RESTOCK_AS_SELLABLE değeri reddedilen bir iadede kullanılmaz) — bu test o davranışı /inspect
    // route'una dogrudan gonderilen payload uzerinden dogrular: DO_NOT_RESTOCK ile /inspect, ardindan
    // /reject cagrildiginda envanter ARTMAZ (phantom envanter / oversatış riski yok).
    const inspect = await adminReturnAction(app, s.storeId, rrId, "inspect", {
      items: [
        { returnItemId: lineAItemId, conditionStatus: "NEW_UNOPENED", inspectionResult: "PASSED", restockDecision: "DO_NOT_RESTOCK" },
        { returnItemId: lineBItemId, conditionStatus: "NEW_UNOPENED", inspectionResult: "PASSED", restockDecision: "DO_NOT_RESTOCK" },
      ],
    });
    expect(inspect.statusCode).toBe(200);

    const reject = await adminReturnAction(app, s.storeId, rrId, "reject", {
      rejectionReason: "Kullanılmış, kabul edilemez.",
    });
    expect(reject.statusCode).toBe(200);

    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("REJECTED");

    // Envanter reject sonrası ARTMAZ (reddedilen ürün stoğa girmez — Faz 3 ters-kargoya kadar
    // müşteride kalır).
    const invA = await prisma.inventoryItem.findFirst({ where: { storeId: s.storeId, variantId: s.variantAId } });
    const invB = await prisma.inventoryItem.findFirst({ where: { storeId: s.storeId, variantId: s.variantBId } });
    expect(invA?.quantityOnHand ?? 0).toBe(0);
    expect(invB?.quantityOnHand ?? 0).toBe(0);

    await app.close();
  });
});
