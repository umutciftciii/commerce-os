/**
 * TODO-174B (ADR-283) — Order Experience Recovery GERÇEK-DB entegrasyon testleri.
 * DATABASE_URL yoksa SKIP. store.delete cascade cleanup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { createOrderExperienceReview } from "../src/order-experience/service.js";
import {
  applyRecoveryAction,
  backfillMissingRecoveryCasesForStore,
  openRecoveryCaseForReview,
} from "../src/order-experience/recovery-service.js";
import { experienceKpi, getRecoveryCaseDetail, listAssignableUsers, listExperienceReviews, resolveReviewForManualCase } from "../src/order-experience/recovery-read.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const created: string[] = [];
const createdUsers: string[] = [];

async function seedPlatformUser(name: string | null): Promise<{ id: string; email: string }> {
  const sfx = randomUUID().slice(0, 12);
  const email = `pu-${sfx}@e.test`;
  const u = await prisma.platformUser.create({
    data: { email, name, passwordHash: "x", role: "SUPPORT_ADMIN" },
    select: { id: true, email: true },
  });
  createdUsers.push(u.id);
  return u;
}

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
    for (const uid of createdUsers.splice(0)) await prisma.platformUser.delete({ where: { id: uid } }).catch(() => {});
  });

  it("ASSIGN 'me' → gerçek actor id'ye çözülür (literal 'me' yazılmaz)", async () => {
    const f = await seedOrder();
    const r = await review(f, 1);
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });
    const res = await applyRecoveryAction({
      storeId: f.storeId, caseId: kase.id, action: "ASSIGN", actorPlatformUserId: "pu-actor-xyz", assigneePlatformUserId: "me",
    });
    expect(res.ok).toBe(true);
    const after = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { id: kase.id }, select: { assigneePlatformUserId: true } });
    expect(after.assigneePlatformUserId).toBe("pu-actor-xyz");
  });

  it("assignee join: detail assigneeName/assigneeEmail döner (ham id sızmaz)", async () => {
    const f = await seedOrder();
    const u = await seedPlatformUser("Ada Yönetici");
    const r = await review(f, 1);
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });
    await applyRecoveryAction({ storeId: f.storeId, caseId: kase.id, action: "ASSIGN", actorPlatformUserId: u.id, assigneePlatformUserId: u.id });
    const detail = await getRecoveryCaseDetail(f.storeId, kase.id);
    expect(detail?.assigneePlatformUserId).toBe(u.id);
    expect(detail?.assigneeName).toBe("Ada Yönetici");
    expect(detail?.assigneeEmail).toBe(u.email);
  });

  it("list: assignee join → row.recovery.assigneeName (ham id sızmaz)", async () => {
    const f = await seedOrder();
    const u = await seedPlatformUser("Bora Uzman");
    const r = await review(f, 1);
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });
    await applyRecoveryAction({ storeId: f.storeId, caseId: kase.id, action: "ASSIGN", actorPlatformUserId: u.id, assigneePlatformUserId: u.id });
    const list = await listExperienceReviews(f.storeId, {}, { skip: 0, take: 20 });
    expect(list.rows[0]?.recovery?.assigneeName).toBe("Bora Uzman");
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

  it("detail: telefon + sipariş finansal özet (total/currency/paymentStatus/kredi) + goodwill alanı", async () => {
    const sfx = randomUUID().slice(0, 12);
    const storeId = `rec-store-${sfx}`;
    const customerId = `rec-cust-${sfx}`;
    const orderId = `rec-ord-${sfx}`;
    await prisma.store.create({ data: { id: storeId, name: `Rec ${sfx}`, slug: `rec-${sfx}` } });
    await prisma.customer.create({
      data: { id: customerId, storeId, email: `rec-${sfx}@e.test`, firstName: "Rec", lastName: "User", phone: "+905551112233" },
    });
    await prisma.order.create({
      data: {
        id: orderId, storeId, orderNumber: `OS-${sfx}`, customerId, customerEmail: `rec-${sfx}@e.test`,
        currency: "TRY", status: "CANCELLED", totalAmount: 15000, paymentStatus: "PARTIALLY_REFUNDED", shoppingCreditUsedMinor: 2000n,
      },
    });
    created.push(storeId);
    const r = await createOrderExperienceReview({ storeId, orderId, customerId, rating: 1, comment: null });
    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({ where: { orderExperienceReviewId: r.id }, select: { id: true } });

    const detail = await getRecoveryCaseDetail(storeId, kase.id);
    expect(detail?.customer.phone).toBe("+905551112233");
    expect(detail?.order.totalMinor).toBe(15000);
    expect(detail?.order.currency).toBe("TRY");
    expect(detail?.order.paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(detail?.order.shoppingCreditUsedMinor).toBe("2000");
    expect(detail?.goodwillCreditMinor).toBe("0"); // henüz goodwill kredisi yok
  });

  it("assignable users: store'un StoreUser'ları isimle listelenir; cross-store izole", async () => {
    const f = await seedOrder();
    const u1 = await seedPlatformUser("Cem Yetkili");
    const u2 = await seedPlatformUser("Deniz Diğer");
    await prisma.storeUser.create({ data: { storeId: f.storeId, userId: u1.id, role: "MANAGER" } });
    const f2 = await seedOrder();
    await prisma.storeUser.create({ data: { storeId: f2.storeId, userId: u2.id, role: "STAFF" } });

    const users = await listAssignableUsers(f.storeId);
    expect(users.length).toBe(1);
    expect(users[0]?.id).toBe(u1.id);
    expect(users[0]?.name).toBe("Cem Yetkili");
    expect(users[0]?.role).toBe("MANAGER");
    // Diğer store'un kullanıcısı sızmaz.
    expect(users.find((u) => u.id === u2.id)).toBeUndefined();
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

  it("backfill: case'siz 1★ review → case oluşur (openedAt=review.createdAt, HIGH), idempotent", async () => {
    const f = await seedOrder();
    // Root-cause simülasyonu: auto-case eklenmeden önce girilmiş review (case açan servisi ATLA).
    const past = new Date(Date.now() - 5 * 24 * 3600_000);
    const orphan = await prisma.orderExperienceReview.create({
      data: { storeId: f.storeId, orderId: f.orderId, customerId: f.customerId, rating: 1, createdAt: past },
      select: { id: true },
    });
    expect(await prisma.orderRecoveryCase.count({ where: { orderExperienceReviewId: orphan.id } })).toBe(0);

    const res = await backfillMissingRecoveryCasesForStore(f.storeId, { apply: true });
    expect(res.created).toBe(1);
    expect(res.scanned).toBe(1);

    const kase = await prisma.orderRecoveryCase.findUniqueOrThrow({
      where: { orderExperienceReviewId: orphan.id },
      select: { status: true, priority: true, openedAt: true, dueAt: true },
    });
    expect(kase.status).toBe("OPEN");
    expect(kase.priority).toBe("HIGH");
    // openedAt review.createdAt'ten türetilmeli (backfill anı değil) → SLA gerçek şikâyet zamanından.
    expect(kase.openedAt.getTime()).toBe(past.getTime());
    // HIGH → 24s SLA; dueAt = openedAt + 24s (geçmişte → overdue).
    expect(kase.dueAt.getTime()).toBe(past.getTime() + 24 * 3600_000);

    // Idempotent: ikinci çalıştırma yeni case üretmez.
    const again = await backfillMissingRecoveryCasesForStore(f.storeId, { apply: true });
    expect(again.created).toBe(0);
  });

  it("backfill dry-run: apply=false → yazma yok; 4-5★/3★ atlanır", async () => {
    const f = await seedOrder();
    const orphan2 = await prisma.orderExperienceReview.create({
      data: { storeId: f.storeId, orderId: f.orderId, customerId: f.customerId, rating: 2 },
      select: { id: true },
    });
    // dry-run: aday sayılır ama yazılmaz.
    const dry = await backfillMissingRecoveryCasesForStore(f.storeId, { apply: false });
    expect(dry.scanned).toBe(1);
    expect(dry.created).toBe(0);
    expect(await prisma.orderRecoveryCase.count({ where: { orderExperienceReviewId: orphan2.id } })).toBe(0);

    // 4-5★ ve 3★ review'lar backfill kapsamı DIŞI (case gerekmez / manuel).
    const f2 = await seedOrder();
    await prisma.orderExperienceReview.create({
      data: { storeId: f2.storeId, orderId: f2.orderId, customerId: f2.customerId, rating: 5 },
    });
    const res2 = await backfillMissingRecoveryCasesForStore(f2.storeId, { apply: true });
    expect(res2.scanned).toBe(0);
    expect(res2.created).toBe(0);
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
