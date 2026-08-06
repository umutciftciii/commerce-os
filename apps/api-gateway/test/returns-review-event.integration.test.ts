/**
 * TD-FR-7 Faz 1 / Task 2 — RETURN_REVIEW_STARTED idempotent audit izi GERCEK-DB entegrasyon
 * testleri. K2 kararı: ilk gerçek admin kararı (approve VEYA reject) sırasında, aynı transaction
 * içinde, bir kez append-only iz yazılır (ReturnStatusHistory.note; kolon eklenmez). Bu bir durum
 * geçişi DEĞİLDİR — talebi UNDER_REVIEW'e geçirmez.
 *
 * DATABASE_URL verilmezse SKIP (CI-safe). Bkz. helpers/returns-db.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createReturnRequest, applyReturnTransition } from "../src/returns/service.js";
import { writeReviewStartedEvent } from "../src/returns/review-event.js";
import {
  adminReturnAction,
  buildReturnAdminApp,
  countReviewStartedEvents,
  currentReturnVersion,
  hasTestDb,
  seedDeliveredOrder,
  type SeededOrder,
} from "./helpers/returns-db.js";

describe.skipIf(!hasTestDb)("RETURN_REVIEW_STARTED audit event (live DB)", () => {
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

  async function firstReturnItemId(storeId: string, returnRequestId: string) {
    const { prisma } = await import("@commerce-os/db");
    const item = await prisma.returnItem.findFirst({ where: { storeId, returnRequestId }, select: { id: true } });
    if (!item) throw new Error("return item not found");
    return item.id;
  }

  it("approve → tam olarak 1 RETURN_REVIEW_STARTED izi (decisionType=APPROVE, sourceStatus=REQUESTED)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);

    const approve = await adminReturnAction(app, seeded.storeId, rrId, "approve", {});
    expect(approve.statusCode).toBe(200);

    const count = await countReviewStartedEvents(seeded.storeId, rrId);
    expect(count).toBe(1);

    const { prisma } = await import("@commerce-os/db");
    const row = await prisma.returnStatusHistory.findFirst({
      where: { storeId: seeded.storeId, returnRequestId: rrId, note: { contains: "RETURN_REVIEW_STARTED" } },
    });
    expect(row).not.toBeNull();
    expect(row?.fromStatus).toBe(row?.toStatus); // sahte geçiş değil: from === to (sourceStatus)
    expect(row?.toStatus).toBe("REQUESTED");
    expect(row?.actorType).toBe("ADMIN");
    const parsed = JSON.parse(row!.note!);
    expect(parsed.action).toBe("RETURN_REVIEW_STARTED");
    expect(parsed.decisionType).toBe("APPROVE");
    expect(parsed.sourceStatus).toBe("REQUESTED");
    expect(parsed.platformUserId).toBe("test-admin");

    await app.close();
  });

  it("approve sonrası ikinci bir admin kararı (reject, INSPECTED'ten) daha gelse hâlâ 1 iz (idempotent)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);

    // 1) ilk gerçek karar: approve (REQUESTED → APPROVED → oto AWAITING_SHIPMENT)
    const approve = await adminReturnAction(app, seeded.storeId, rrId, "approve", {});
    expect(approve.statusCode).toBe(200);
    expect(await countReviewStartedEvents(seeded.storeId, rrId)).toBe(1);

    // 2) akışı ilerlet: musteri kargoya verdi → admin teslim aldi → admin inceledi
    await applyReturnTransition(seeded.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: seeded.customerId });
    await adminReturnAction(app, seeded.storeId, rrId, "transition", { targetStatus: "RECEIVED" });
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

    // 3) ikinci bir admin geçişi: reject (INSPECTED → REJECTED). Bu da onCommit içinde
    // writeReviewStartedEvent çağırır ama zaten var → no-op (idempotent).
    const reject = await adminReturnAction(app, seeded.storeId, rrId, "reject", {
      rejectionReason: "Hasarlı iade; kabul edilmedi.",
    });
    expect(reject.statusCode).toBe(200);

    expect(await countReviewStartedEvents(seeded.storeId, rrId)).toBe(1);

    // Idempotent no-op: ilk yazılan iz (APPROVE/REQUESTED) korunur, reject tarafından EZİLMEZ.
    const { prisma } = await import("@commerce-os/db");
    const row = await prisma.returnStatusHistory.findFirst({
      where: { storeId: seeded.storeId, returnRequestId: rrId, note: { contains: "RETURN_REVIEW_STARTED" } },
    });
    const parsed = JSON.parse(row!.note!);
    expect(parsed.decisionType).toBe("APPROVE");
    expect(parsed.sourceStatus).toBe("REQUESTED");

    await app.close();
  });

  it("reject (REQUESTED'ten, ilk karar) → 1 iz (decisionType=REJECT)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);

    const reject = await adminReturnAction(app, seeded.storeId, rrId, "reject", {
      rejectionReason: "Musteri talebi degerlendirildi, uygun bulunmadi.",
    });
    expect(reject.statusCode).toBe(200);

    const count = await countReviewStartedEvents(seeded.storeId, rrId);
    expect(count).toBe(1);

    const { prisma } = await import("@commerce-os/db");
    const row = await prisma.returnStatusHistory.findFirst({
      where: { storeId: seeded.storeId, returnRequestId: rrId, note: { contains: "RETURN_REVIEW_STARTED" } },
    });
    const parsed = JSON.parse(row!.note!);
    expect(parsed.decisionType).toBe("REJECT");
    expect(parsed.sourceStatus).toBe("REQUESTED");
    expect(row?.fromStatus).toBe("REQUESTED");
    expect(row?.toStatus).toBe("REQUESTED");

    await app.close();
  });

  it("eşzamanlı approve/reject (aynı expectedVersion) → biri 200/diğeri 409, toplam TEK RETURN_REVIEW_STARTED izi (R3 version-lock)", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);
    const v = await currentReturnVersion(seeded.storeId, rrId);

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/stores/${seeded.storeId}/returns/${rrId}/approve`, payload: { expectedVersion: v } }),
      app.inject({
        method: "POST",
        url: `/stores/${seeded.storeId}/returns/${rrId}/reject`,
        payload: { rejectionReason: "eşzamanlı red denemesi", expectedVersion: v },
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const conflict = [a, b].find((r) => r.statusCode === 409)!;
    expect(conflict.json().error.code).toBe("VERSION_CONFLICT");

    // Kaybeden R3'te elenir → onCommit (dolayısıyla writeReviewStartedEvent) hiç çalışmaz.
    // Kazanan tek başına tam olarak 1 iz yazar.
    expect(await countReviewStartedEvents(seeded.storeId, rrId)).toBe(1);

    await app.close();
  });

  it("tx rollback: onCommit içinde writeReviewStartedEvent çağrılıp SONRA throw edilirse iz de rollback olur (yazılmaz)", async () => {
    seeded = await seedDeliveredOrder();
    const rrId = await createRefundReturn(seeded);

    await expect(
      applyReturnTransition(seeded.storeId, rrId, "UNDER_REVIEW", { type: "ADMIN", id: "test-admin" }, {
        onCommit: async (tx, current) => {
          await writeReviewStartedEvent(tx, {
            storeId: seeded!.storeId,
            returnRequestId: rrId,
            sourceStatus: current.status,
            decisionType: "APPROVE",
            platformUserId: "test-admin",
          });
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    // Tüm tx (state-machine geçişi + review-started izi) birlikte rollback olmalı.
    expect(await countReviewStartedEvents(seeded.storeId, rrId)).toBe(0);
  });

  it("SUBSTRING artık idempotency'yi TETİKLEMEZ: marker string'ini içeren ama yapısal olarak review-started OLMAYAN bir kayıt varsa, gerçek ilk karar (approve) yine de yazılır", async () => {
    seeded = await seedDeliveredOrder();
    const app = buildReturnAdminApp();
    const rrId = await createRefundReturn(seeded);

    // "Zehirli" kayıt: gerçek bir durum geçişi (REQUESTED → UNDER_REVIEW, from ≠ to) ama notu
    // ELLE eski substring markerını taşıyor. Eski (substring-tabanlı) idempotency kontrolü bu
    // kaydı "zaten yazılmış RETURN_REVIEW_STARTED izi" sanıp gerçek approve'un yazmasını
    // ATLARDI (yanlış-pozitif). Yeni yapısal kontrol from≠to olduğu için bu kaydı SAYMAZ.
    const { prisma } = await import("@commerce-os/db");
    await prisma.returnStatusHistory.create({
      data: {
        storeId: seeded.storeId,
        returnRequestId: rrId,
        fromStatus: "REQUESTED",
        toStatus: "UNDER_REVIEW",
        actorType: "ADMIN",
        actorId: "test-admin",
        note: JSON.stringify({ action: "RETURN_REVIEW_STARTED", note: "tesadüfen aynı string'i taşıyan gerçek geçiş notu" }),
      },
    });

    // Bu zehirli kayıt henüz yapısal (from===to) bir review-started izi SAYILMAZ.
    expect(await countReviewStartedEvents(seeded.storeId, rrId)).toBe(0);

    const approve = await adminReturnAction(app, seeded.storeId, rrId, "approve", {});
    expect(approve.statusCode).toBe(200);

    // Gerçek review-started izi eski substring eşleşmesi tarafından ENGELLENMEDEN yazıldı.
    expect(await countReviewStartedEvents(seeded.storeId, rrId)).toBe(1);
    const row = await prisma.returnStatusHistory.findFirst({
      where: { storeId: seeded.storeId, returnRequestId: rrId, actorType: "ADMIN", fromStatus: "REQUESTED", toStatus: "REQUESTED" },
    });
    expect(row).not.toBeNull();
    const parsed = JSON.parse(row!.note!);
    expect(parsed.decisionType).toBe("APPROVE");

    await app.close();
  });
});
