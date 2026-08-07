/**
 * TODO-174B (ADR-283) — Order Experience Recovery GERÇEK-DB entegrasyon testleri.
 * DATABASE_URL yoksa SKIP. store.delete cascade cleanup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { createOrderExperienceReview } from "../src/order-experience/service.js";
import { applyRecoveryAction, openRecoveryCaseForReview } from "../src/order-experience/recovery-service.js";
import { experienceKpi, getRecoveryCaseDetail, listExperienceReviews, resolveReviewForManualCase } from "../src/order-experience/recovery-read.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];

async function seedOrder(): Promise<{ storeId: string; customerId: string; orderId: string }> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `rec-store-${sfx}`;
  const customerId = `rec-cust-${sfx}`;
  const orderId = `rec-ord-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `Rec ${sfx}`, slug: `rec-${sfx}` } });
  await prisma.customer.create({ data: { id: customerId, storeId, email: `rec-${sfx}@e.test`, firstName: "Rec", lastName: "User" } });
  await prisma.order.create({
    data: { id: orderId, storeId, orderNumber: `OS-${sfx}`, customerId, customerEmail: `rec-${sfx}@e.test`, currency: "TRY", status: "CANCELLED" },
  });
  created.push(storeId);
  return { storeId, customerId, orderId };
}

async function review(f: { storeId: string; customerId: string; orderId: string }, rating: number) {
  return createOrderExperienceReview({ storeId: f.storeId, orderId: f.orderId, customerId: f.customerId, rating, comment: null });
}

describe.skipIf(!hasTestDb)("Order Experience Recovery (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
  });

  it("1★ review → otomatik case OPEN, priority HIGH", async () => {
    const f = await seedOrder();
    const r = await review(f, 1);
    const kase = await prisma.orderRecoveryCase.findUnique({ where: { orderExperienceReviewId: r.id }, select: { status: true, priority: true } });
    expect(kase?.status).toBe("OPEN");
    expect(kase?.priority).toBe("HIGH");
  });

  it("2★ review → otomatik case, priority MEDIUM", async () => {
    const f = await seedOrder();
    const r = await review(f, 2);
    const kase = await prisma.orderRecoveryCase.findUnique({ where: { orderExperienceReviewId: r.id }, select: { priority: true } });
    expect(kase?.priority).toBe("MEDIUM");
  });

  it("3★ review → otomatik case YOK; manuel açılabilir; duplicate reddedilir", async () => {
    const f = await seedOrder();
    const r = await review(f, 3);
    expect(await prisma.orderRecoveryCase.count({ where: { orderExperienceReviewId: r.id } })).toBe(0);
    const resolved = await resolveReviewForManualCase(f.storeId, r.id);
    expect(resolved.ok).toBe(true);
    const opened = await prisma.$transaction((tx) =>
      openRecoveryCaseForReview(tx, { storeId: f.storeId, orderExperienceReviewId: r.id, customerId: f.customerId, orderId: f.orderId, rating: 3, mode: "MANUAL", createdByPlatformUserId: "admin-1" }),
    );
    expect(opened?.created).toBe(true);
    // Duplicate manuel → resolveReviewForManualCase CASE_EXISTS.
    const again = await resolveReviewForManualCase(f.storeId, r.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("CASE_EXISTS");
  });

  it("5★ review → case yok; manuel reddedilir (NOT_THREE_STAR)", async () => {
    const f = await seedOrder();
    const r = await review(f, 5);
    expect(await prisma.orderRecoveryCase.count({ where: { orderExperienceReviewId: r.id } })).toBe(0);
    const resolved = await resolveReviewForManualCase(f.storeId, r.id);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.code).toBe("NOT_THREE_STAR");
  });

  it("lifecycle: assign → contact → issue-heard → resolve → close; CLOSED reddeder", async () => {
    const f = await seedOrder();
    const r = await review(f, 1);
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });
    const cid = kase.id;
    const A = (action: Parameters<typeof applyRecoveryAction>[0]["action"], extra: Record<string, unknown> = {}) =>
      applyRecoveryAction({ storeId: f.storeId, caseId: cid, action, actorPlatformUserId: "admin-1", ...extra });

    expect((await A("ASSIGN", { assigneePlatformUserId: "admin-1" })).ok).toBe(true);
    expect((await A("CONTACT_CALL")).ok).toBe(true);
    expect((await A("ISSUE_HEARD", { outcome: "DELIVERY_COMPLAINT" })).ok).toBe(true);
    const resolveRes = await A("RESOLVE", { resolutionType: "APOLOGY", note: "özür kabul edildi" });
    expect(resolveRes.ok).toBe(true);
    expect((await A("CLOSE")).ok).toBe(true);

    const detail = await getRecoveryCaseDetail(f.storeId, cid);
    expect(detail?.status).toBe("CLOSED");
    expect(detail?.firstContactAt).not.toBeNull();
    expect(detail?.resolvedAt).not.toBeNull();
    expect(detail?.activities.length).toBeGreaterThanOrEqual(5);
    // CLOSED case aksiyon reddeder.
    const afterClose = await A("NOTE", { note: "x" });
    expect(afterClose.ok).toBe(false);
    if (!afterClose.ok) expect(afterClose.code).toBe("CASE_CLOSED");
  });

  it("RESOLVE resolutionType olmadan reddedilir; OTHER outcome note ister", async () => {
    const f = await seedOrder();
    const r = await review(f, 1);
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });
    const noRes = await applyRecoveryAction({ storeId: f.storeId, caseId: kase.id, action: "RESOLVE", actorPlatformUserId: "a" });
    expect(noRes.ok).toBe(false);
    if (!noRes.ok) expect(noRes.code).toBe("RESOLUTION_REQUIRED");
    const otherNoNote = await applyRecoveryAction({ storeId: f.storeId, caseId: kase.id, action: "ISSUE_HEARD", actorPlatformUserId: "a", outcome: "OTHER" });
    expect(otherNoNote.ok).toBe(false);
    if (!otherNoNote.ok) expect(otherNoNote.code).toBe("NOTE_REQUIRED");
  });

  it("SLA overdue: dueAt geçmiş → overdueOnly listeler + KPI sayar", async () => {
    const f = await seedOrder();
    const r = await review(f, 1);
    await prisma.orderRecoveryCase.updateMany({ where: { orderExperienceReviewId: r.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const list = await listExperienceReviews(f.storeId, { overdueOnly: true }, { skip: 0, take: 20 });
    expect(list.total).toBe(1);
    expect(list.rows[0]?.recovery?.overdue).toBe(true);
    const kpi = await experienceKpi(f.storeId, {});
    expect(kpi.slaOverdueCount).toBe(1);
    expect(kpi.averageRating).toBe(1);
    expect(kpi.totalReviews).toBe(1);
  });

  it("liste rating bucket filtresi (1-2★) + case'siz 4-5★ görünür", async () => {
    const f1 = await seedOrder();
    await review(f1, 1);
    const f2 = await seedOrder();
    await review(f2, 5);
    // f1 ve f2 farklı store; store-scope. f1'de 1★ ONE_TWO döner, THREE/FOUR_FIVE dönmez.
    const oneTwo = await listExperienceReviews(f1.storeId, { ratingBucket: "ONE_TWO" }, { skip: 0, take: 20 });
    expect(oneTwo.total).toBe(1);
    const fourFive = await listExperienceReviews(f2.storeId, { ratingBucket: "FOUR_FIVE" }, { skip: 0, take: 20 });
    expect(fourFive.total).toBe(1);
    expect(fourFive.rows[0]?.recovery).toBeNull();
  });
});
