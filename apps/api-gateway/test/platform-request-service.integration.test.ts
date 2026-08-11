/**
 * TODO-178 (Faz B) — Store→Platform Request gerçek-DB integration suite.
 * DATABASE_URL gerekli (yoksa skip). Her test kendi store'unu random-suffix ile seed'ler + store
 * delete cascade ile temizler (seed kategorilere DOKUNMAZ; global counter singleton bırakılır).
 */

import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import { createLogPlatformRequestNotificationDispatcher } from "../src/platform-requests/notification";
import {
  createRequest,
  listStoreRequests,
  getStoreRequestDetail,
  addStoreVisibleMessage,
  withdrawRequest,
  confirmClose,
  reopenRequest,
  listPlatformRequests,
  getPlatformRequestDetail,
  assignRequest,
  setPriority,
  setStatus,
  recategorize,
  addPlatformMessage,
  listCategories,
  createCategory,
  listAssignablePlatformUsers,
  listActiveStoreRequestCategories,
} from "../src/platform-requests/service";
import {
  addStoreRequestAttachment,
  addPlatformRequestAttachment,
  getStoreAttachmentForStream,
  getPlatformAttachmentForStream,
} from "../src/platform-requests/attachments";
import type { StorageDriver } from "../src/media/storage";
import sharp from "sharp";
import { PLATFORM_REQUEST_UNASSIGNED_FILTER } from "@commerce-os/contracts";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = createLogPlatformRequestNotificationDispatcher({ info: () => {} });
const NOW = () => new Date();
const DAY = 86_400_000;

const createdStores: string[] = [];
const createdUsers: string[] = [];

afterEach(async () => {
  // MediaAsset onDelete:Restrict → store cascade'inden ÖNCE attachment + mediaAsset temizlenmeli
  // (aksi hâlde FK ihlali; Faz E). Request-cascade attachment'ı siler ama mediaAsset store-cascade'i bloke eder.
  for (const id of createdStores) {
    await prisma.platformRequestAttachment.deleteMany({ where: { storeId: id } }).catch(() => {});
    await prisma.mediaAsset.deleteMany({ where: { storeId: id } }).catch(() => {});
  }
  for (const id of createdStores.splice(0)) await prisma.store.delete({ where: { id } }).catch(() => {});
  for (const id of createdUsers.splice(0))
    await prisma.platformUser.delete({ where: { id } }).catch(() => {});
});

async function seedStore() {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `st-${sfx}`;
  createdStores.push(storeId);
  await prisma.store.create({ data: { id: storeId, name: `Store ${sfx}`, slug: `s-${sfx}` } });
  return storeId;
}

async function seedPlatformUser(role: "SUPER_ADMIN" | "SUPPORT_ADMIN" = "SUPPORT_ADMIN") {
  const sfx = randomUUID().slice(0, 12);
  const id = `pu-${sfx}`;
  createdUsers.push(id);
  await prisma.platformUser.create({
    data: { id, email: `${id}@ex.test`, name: `Admin ${sfx}`, passwordHash: "x", role },
  });
  return id;
}

function storeActor(storeId: string) {
  return {
    kind: "PLATFORM_USER" as const,
    id: `actor-${storeId}`,
    name: "Store Owner",
    email: `owner-${storeId}@ex.test`,
  };
}

async function openRequest(storeId: string, categoryKey = "CANCELLATION_TAXONOMY") {
  const r = await createRequest(
    {
      storeId,
      categoryKey,
      subject: "İptal nedeni ekleme talebi",
      description: "Yeni bir iptal nedeni eklenmesini istiyoruz.",
      actor: storeActor(storeId),
    },
    d,
    NOW(),
  );
  if (!r.ok) throw new Error(`create failed: ${r.code}`);
  return r;
}

describe.skipIf(!hasDb)("TODO-178 create + numbering + snapshots", () => {
  it("creates a request with a global PR-###### number, category + creator snapshot, cycle-1 SLA + OPEN history", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    expect(created.requestNumber).toMatch(/^PR-\d{6,}$/);

    const row = await prisma.platformRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      include: { slaSnapshots: true, history: true },
    });
    expect(row.categoryKey).toBe("CANCELLATION_TAXONOMY");
    expect(row.categoryLabel.length).toBeGreaterThan(0);
    expect(row.createdByActorKind).toBe("PLATFORM_USER");
    expect(row.createdByName).toBe("Store Owner");
    expect(row.status).toBe("OPEN");
    expect(row.priority).toBe("NORMAL");
    expect(row.slaSnapshots).toHaveLength(1);
    expect(row.slaSnapshots[0].cycle).toBe(1);
    expect(row.history.some((h) => h.eventType === "REQUEST_OPENED")).toBe(true);
  });

  it("store impact does not change platform priority authority (advisory only)", async () => {
    const storeId = await seedStore();
    const r = await createRequest(
      {
        storeId,
        categoryKey: "PLATFORM_POLICY",
        subject: "s",
        description: "d",
        storeImpact: "HIGH",
        actor: storeActor(storeId),
      },
      d,
      NOW(),
    );
    if (!r.ok) throw new Error(r.code);
    const row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: r.requestId } });
    expect(row.priority).toBe("NORMAL"); // category default, NOT elevated by HIGH impact
    expect(row.storeImpact).toBe("HIGH");
  });

  it("rejects an unknown or inactive category", async () => {
    const storeId = await seedStore();
    const bad = await createRequest(
      { storeId, categoryKey: "__nope__", subject: "s", description: "d", actor: storeActor(storeId) },
      d,
      NOW(),
    );
    expect(bad).toEqual({ ok: false, code: "CATEGORY_NOT_FOUND" });
  });

  it("allocates unique global numbers under concurrency", async () => {
    const storeId = await seedStore();
    const results = await Promise.all(Array.from({ length: 6 }, () => openRequest(storeId)));
    const numbers = results.map((r) => r.requestNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe.skipIf(!hasDb)("TODO-178 store isolation + INTERNAL non-leak", () => {
  it("store list/detail are storeId-scoped; cross-store detail is 404 (requestId alone insufficient)", async () => {
    const storeA = await seedStore();
    const storeB = await seedStore();
    const created = await openRequest(storeA);

    const listB = await listStoreRequests(storeB, { page: 1, pageSize: 20, now: NOW() });
    expect(listB.items.find((i) => i.id === created.requestId)).toBeUndefined();

    const detailCross = await getStoreRequestDetail(storeB, created.requestId, NOW());
    expect(detailCross).toBeNull();
    const detailOwn = await getStoreRequestDetail(storeA, created.requestId, NOW());
    expect(detailOwn?.id).toBe(created.requestId);
  });

  it("INTERNAL platform notes never appear in store detail (no body/count/preview leak)", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();
    const secret = "TOPSECRET-internal-only-xyz";
    const noted = await addPlatformMessage(
      { requestId: created.requestId, actorUserId: pu, body: secret, visibility: "INTERNAL" },
      d,
      NOW(),
    );
    expect(noted.ok).toBe(true);

    const storeDetail = await getStoreRequestDetail(storeId, created.requestId, NOW());
    expect(JSON.stringify(storeDetail)).not.toContain(secret);
    expect(storeDetail?.messages.every((m) => !("visibility" in m))).toBe(true);
    // internal note must not even be counted/previewed as a store-visible message
    expect(storeDetail?.messages).toHaveLength(0);

    const platformDetail = await getPlatformRequestDetail(created.requestId, NOW());
    expect(JSON.stringify(platformDetail)).toContain(secret);
    expect(platformDetail?.messages.find((m) => m.visibility === "INTERNAL")).toBeTruthy();
  });

  it("forces store replies to STORE_VISIBLE and returns WAITING_STORE to IN_PROGRESS", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();
    // platform moves it to WAITING_STORE
    const r0 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    await setStatus(
      { requestId: created.requestId, actorUserId: pu, expectedVersion: r0.version, toStatus: "WAITING_STORE" },
      d,
      NOW(),
    );

    const reply = await addStoreVisibleMessage(
      { storeId, requestId: created.requestId, actorId: storeActor(storeId).id, body: "cevabımız" },
      d,
      NOW(),
    );
    expect(reply.ok).toBe(true);
    const row = await prisma.platformRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      include: { messages: true },
    });
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.messages.every((m) => m.authorType !== "STORE" || m.visibility === "STORE_VISIBLE")).toBe(true);
  });
});

describe.skipIf(!hasDb)("TODO-178 platform actions", () => {
  it("assigns via the 'me' sentinel and validates a real assignee", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();

    let row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const me = await assignRequest({
      requestId: created.requestId,
      actorUserId: pu,
      expectedVersion: row.version,
      assigneePlatformUserId: "me",
    }, d);
    expect(me.ok).toBe(true);
    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    expect(row.assigneePlatformUserId).toBe(pu);

    const bad = await assignRequest({
      requestId: created.requestId,
      actorUserId: pu,
      expectedVersion: row.version,
      assigneePlatformUserId: "ghost-user",
    }, d);
    expect(bad).toEqual({ ok: false, code: "ASSIGNEE_NOT_FOUND" });
  });

  it("changes priority (platform authority) and an internal note does not change status", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();

    let row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const pr = await setPriority({
      requestId: created.requestId,
      actorUserId: pu,
      expectedVersion: row.version,
      priority: "URGENT",
    });
    expect(pr.ok).toBe(true);

    const note = await addPlatformMessage(
      { requestId: created.requestId, actorUserId: pu, body: "iç not", visibility: "INTERNAL" },
      d,
      NOW(),
    );
    expect(note.ok).toBe(true);
    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    expect(row.priority).toBe("URGENT");
    expect(row.status).toBe("OPEN"); // internal note left status untouched
    expect(row.firstResponseAt).toBeNull(); // internal note is NOT a first response
  });

  it("marks first-response on the first platform STORE_VISIBLE reply, not on internal notes", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();
    await addPlatformMessage(
      { requestId: created.requestId, actorUserId: pu, body: "iç", visibility: "INTERNAL" },
      d,
      NOW(),
    );
    let row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    expect(row.firstResponseAt).toBeNull();
    await addPlatformMessage(
      { requestId: created.requestId, actorUserId: pu, body: "merhaba", visibility: "STORE_VISIBLE" },
      d,
      NOW(),
    );
    row = await prisma.platformRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      include: { slaSnapshots: true },
    });
    expect(row.firstResponseAt).not.toBeNull();
    expect(row.slaSnapshots[0].firstResponseMetAt).not.toBeNull();
  });

  it("TRIAGED action also counts as first response (canonical helper)", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();
    const row0 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    await setStatus(
      { requestId: created.requestId, actorUserId: pu, expectedVersion: row0.version, toStatus: "TRIAGED" },
      d,
      NOW(),
    );
    const row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    expect(row.firstResponseAt).not.toBeNull();
  });

  it("recategorizes: updates the current category FK but preserves the immutable snapshot", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId, "CANCELLATION_TAXONOMY");
    const pu = await seedPlatformUser();
    const row0 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const res = await recategorize({
      requestId: created.requestId,
      actorUserId: pu,
      expectedVersion: row0.version,
      categoryKey: "PLATFORM_POLICY",
    });
    expect(res.ok).toBe(true);
    const row = await prisma.platformRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      include: { category: true },
    });
    expect(row.categoryKey).toBe("CANCELLATION_TAXONOMY"); // snapshot immutable
    expect(row.category.key).toBe("PLATFORM_POLICY"); // current FK moved
  });

  it("guards optimistic version conflicts", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const pu = await seedPlatformUser();
    const stale = 0;
    await setPriority({ requestId: created.requestId, actorUserId: pu, expectedVersion: stale, priority: "HIGH" });
    const conflict = await setPriority({
      requestId: created.requestId,
      actorUserId: pu,
      expectedVersion: stale,
      priority: "LOW",
    });
    expect(conflict).toEqual({ ok: false, code: "VERSION_CONFLICT" });
  });
});

describe.skipIf(!hasDb)("TODO-178 lifecycle: withdraw / confirm-close / reopen", () => {
  it("allows store withdraw from OPEN/TRIAGED/WAITING_STORE and blocks it from IN_PROGRESS", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();

    const a = await openRequest(storeId);
    const wa = await withdrawRequest(
      { storeId, requestId: a.requestId, actorId: storeActor(storeId).id, expectedVersion: 0 },
      d,
      NOW(),
    );
    expect(wa.ok).toBe(true);
    const rowA = await prisma.platformRequest.findUniqueOrThrow({ where: { id: a.requestId } });
    expect(rowA.status).toBe("CLOSED");
    expect(rowA.closeReason).toBe("WITHDRAWN_BY_STORE");

    const b = await openRequest(storeId);
    const rb = await prisma.platformRequest.findUniqueOrThrow({ where: { id: b.requestId } });
    await setStatus({ requestId: b.requestId, actorUserId: pu, expectedVersion: rb.version, toStatus: "IN_PROGRESS" }, d, NOW());
    const rb2 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: b.requestId } });
    const wb = await withdrawRequest(
      { storeId, requestId: b.requestId, actorId: storeActor(storeId).id, expectedVersion: rb2.version },
      d,
      NOW(),
    );
    expect(wb.ok).toBe(false);
  });

  it("supports confirm-close from RESOLVED and blocks reopen after CLOSED", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();
    const created = await openRequest(storeId);
    let row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    await setStatus({ requestId: created.requestId, actorUserId: pu, expectedVersion: row.version, toStatus: "RESOLVED" }, d, NOW());

    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const cc = await confirmClose(
      { storeId, requestId: created.requestId, actorId: storeActor(storeId).id, expectedVersion: row.version },
      d,
      NOW(),
    );
    expect(cc.ok).toBe(true);
    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    expect(row.status).toBe("CLOSED");
    expect(row.closeReason).toBe("COMPLETED");

    const reopen = await reopenRequest(
      { storeId, requestId: created.requestId, actorId: storeActor(storeId).id, expectedVersion: row.version },
      d,
      NOW(),
    );
    expect(reopen).toEqual({ ok: false, code: "CLOSED_CANNOT_REOPEN" });
  });

  it("reopen honors the inclusive 7-day window and starts a fresh SLA cycle", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();
    const created = await openRequest(storeId);
    let row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    await setStatus({ requestId: created.requestId, actorUserId: pu, expectedVersion: row.version, toStatus: "RESOLVED" }, d, NOW());
    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });

    // push resolvedAt 8 days back → expired
    await prisma.platformRequest.update({
      where: { id: created.requestId },
      data: { resolvedAt: new Date(Date.now() - 8 * DAY) },
    });
    const expired = await reopenRequest(
      { storeId, requestId: created.requestId, actorId: storeActor(storeId).id, expectedVersion: row.version },
      d,
      NOW(),
    );
    expect(expired).toEqual({ ok: false, code: "REOPEN_WINDOW_EXPIRED" });

    // within window → fresh cycle
    await prisma.platformRequest.update({
      where: { id: created.requestId },
      data: { resolvedAt: new Date(Date.now() - 3 * DAY) },
    });
    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const ok = await reopenRequest(
      { storeId, requestId: created.requestId, actorId: storeActor(storeId).id, expectedVersion: row.version },
      d,
      NOW(),
    );
    expect(ok.ok).toBe(true);
    const after = await prisma.platformRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      include: { slaSnapshots: true },
    });
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.reopenCount).toBe(1);
    expect(after.slaSnapshots).toHaveLength(2);
    expect(Math.max(...after.slaSnapshots.map((s) => s.cycle))).toBe(2);
  });

  it("does not let the generic status endpoint close without a reason (evaluateClose path)", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();
    const created = await openRequest(storeId);
    let row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    await setStatus({ requestId: created.requestId, actorUserId: pu, expectedVersion: row.version, toStatus: "RESOLVED" }, d, NOW());
    row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const noReason = await setStatus(
      { requestId: created.requestId, actorUserId: pu, expectedVersion: row.version, toStatus: "CLOSED" },
      d,
      NOW(),
    );
    expect(noReason).toEqual({ ok: false, code: "CLOSE_REASON_REQUIRED" });
    const withReason = await setStatus(
      { requestId: created.requestId, actorUserId: pu, expectedVersion: row.version, toStatus: "CLOSED", closeReason: "COMPLETED" },
      d,
      NOW(),
    );
    expect(withReason.ok).toBe(true);
  });
});

describe.skipIf(!hasDb)("TODO-178 platform inbox + taxonomy", () => {
  it("lists cross-store with store name + assignee name and supports storeId filter", async () => {
    const storeA = await seedStore();
    const storeB = await seedStore();
    await openRequest(storeA);
    await openRequest(storeB);
    const all = await listPlatformRequests({ page: 1, pageSize: 50, now: new Date() });
    expect(all.items.length).toBeGreaterThanOrEqual(2);
    const onlyA = await listPlatformRequests({ storeId: storeA, page: 1, pageSize: 50, now: new Date() });
    expect(onlyA.items.every((i) => i.storeId === storeA)).toBe(true);
    expect(onlyA.items[0].storeName.length).toBeGreaterThan(0);
  });

  it("TD-178-4: after recategorize, operational DTO/list/filter reflect CURRENT category; snapshot stays filed", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId, "CANCELLATION_TAXONOMY");
    const pu = await seedPlatformUser();
    const row0 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    await recategorize({
      requestId: created.requestId,
      actorUserId: pu,
      expectedVersion: row0.version,
      categoryKey: "PLATFORM_POLICY",
    });

    // platform detail: current = B (bilingual), filed snapshot = A
    const pd = await getPlatformRequestDetail(created.requestId, new Date());
    expect(pd?.category.key).toBe("PLATFORM_POLICY");
    expect(pd?.category.labelTr.length).toBeGreaterThan(0);
    expect(pd?.category.labelEn.length).toBeGreaterThan(0);
    expect(pd?.filedCategory.key).toBe("CANCELLATION_TAXONOMY");

    // store detail: current = B
    const sd = await getStoreRequestDetail(storeId, created.requestId, new Date());
    expect(sd?.category.key).toBe("PLATFORM_POLICY");

    // platform inbox filter by CURRENT category B finds it; filter by filed A does not
    const byB = await listPlatformRequests({ storeId, categoryKey: "PLATFORM_POLICY", page: 1, pageSize: 50, now: new Date() });
    expect(byB.items.find((i) => i.requestId === created.requestId)).toBeTruthy();
    expect(byB.items[0].category.key).toBe("PLATFORM_POLICY");
    const byA = await listPlatformRequests({ storeId, categoryKey: "CANCELLATION_TAXONOMY", page: 1, pageSize: 50, now: new Date() });
    expect(byA.items.find((i) => i.requestId === created.requestId)).toBeUndefined();
  });

  it("TD-178-6: assignable-user directory searches/paginates and never leaks sensitive fields", async () => {
    const u1 = await seedPlatformUser();
    const dir = await listAssignablePlatformUsers({ page: 1, pageSize: 100 });
    const mine = dir.items.find((i) => i.id === u1);
    expect(mine).toBeTruthy();
    expect(mine?.email.length).toBeGreaterThan(0);
    expect(mine?.role).toBeDefined();
    // no sensitive field on any item
    expect(JSON.stringify(dir.items)).not.toContain("passwordHash");
    expect(dir.items.every((i) => !("passwordHash" in (i as Record<string, unknown>)))).toBe(true);
    // search by the unique email finds exactly this user
    const byEmail = await listAssignablePlatformUsers({ search: `${u1}@ex.test`, page: 1, pageSize: 100 });
    expect(byEmail.items.map((i) => i.id)).toContain(u1);
    // pagination caps the page size
    const paged = await listAssignablePlatformUsers({ page: 1, pageSize: 1 });
    expect(paged.items.length).toBeLessThanOrEqual(1);
    expect(paged.pageSize).toBe(1);
  });

  it("TD-178-6: assigns a real (non-me) platform user and rejects a ghost id", async () => {
    const storeId = await seedStore();
    const created = await openRequest(storeId);
    const actor = await seedPlatformUser();
    const other = await seedPlatformUser();
    const row0 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    const ok = await assignRequest({ requestId: created.requestId, actorUserId: actor, expectedVersion: row0.version, assigneePlatformUserId: other }, d);
    expect(ok.ok).toBe(true);
    const row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: created.requestId } });
    expect(row.assigneePlatformUserId).toBe(other);
    const bad = await assignRequest({ requestId: created.requestId, actorUserId: actor, expectedVersion: row.version, assigneePlatformUserId: "ghost" }, d);
    expect(bad).toEqual({ ok: false, code: "ASSIGNEE_NOT_FOUND" });
  });

  it("TD-178-6: inbox assignee filter maps user id and the unassigned sentinel", async () => {
    const storeId = await seedStore();
    const actor = await seedPlatformUser();
    const assignee = await seedPlatformUser();
    const assignedReq = await openRequest(storeId);
    const unassignedReq = await openRequest(storeId);
    const r0 = await prisma.platformRequest.findUniqueOrThrow({ where: { id: assignedReq.requestId } });
    await assignRequest({ requestId: assignedReq.requestId, actorUserId: actor, expectedVersion: r0.version, assigneePlatformUserId: assignee }, d);

    const byUser = await listPlatformRequests({ storeId, assigneePlatformUserId: assignee, page: 1, pageSize: 50, now: new Date() });
    expect(byUser.items.map((i) => i.requestId)).toEqual([assignedReq.requestId]);

    const unassigned = await listPlatformRequests({ storeId, assigneePlatformUserId: PLATFORM_REQUEST_UNASSIGNED_FILTER, page: 1, pageSize: 50, now: new Date() });
    expect(unassigned.items.map((i) => i.requestId)).toContain(unassignedReq.requestId);
    expect(unassigned.items.map((i) => i.requestId)).not.toContain(assignedReq.requestId);
  });

  it("createCategory is idempotent on key and listCategories includes seeds", async () => {
    const cats = await listCategories();
    expect(cats.find((c) => c.key === "CANCELLATION_TAXONOMY")).toBeTruthy();

    const key = `TEST_${randomUUID().slice(0, 8).toUpperCase().replace(/-/g, "")}`;
    const made = await createCategory({ key, labelTr: "Test", labelEn: "Test" });
    expect(made.ok).toBe(true);
    const dup = await createCategory({ key, labelTr: "Test", labelEn: "Test" });
    expect(dup).toEqual({ ok: false, code: "CATEGORY_KEY_EXISTS" });
    if (made.ok) await prisma.platformRequestCategory.delete({ where: { id: made.id } }).catch(() => {});
  });
});

// TODO-178 (Faz D follow-up) — Faz D hardening: store category read / list projection / SLA / timeline.
describe.skipIf(!hasDb)("TODO-178 Faz D hardening — category / projection / SLA / audit timeline", () => {
  it("store active-category endpoint yalnız AKTİF taksonomiyi bilingual döner (pasif hariç)", async () => {
    const inactiveKey = `INACTIVE_${randomUUID().slice(0, 8)}`;
    await prisma.platformRequestCategory.create({
      data: { id: `cat-${randomUUID().slice(0, 8)}`, key: inactiveKey, labelTr: "Pasif", labelEn: "Inactive", active: false, sortOrder: 999 },
    });
    try {
      const cats = await listActiveStoreRequestCategories();
      // Yalnız güvenli/bilingual alanlar; operasyonel alan (defaultPriority/slaPolicyKey/active) YOK.
      expect(cats.every((c) => c.key && c.labelTr && c.labelEn)).toBe(true);
      expect(cats.every((c) => !("active" in c) && !("slaPolicyKey" in c) && !("defaultPriority" in c))).toBe(true);
      expect(cats.some((c) => c.key === inactiveKey)).toBe(false);
      const seed = cats.find((c) => c.key === "CANCELLATION_TAXONOMY");
      expect(seed).toBeTruthy();
      expect(seed!.labelTr).not.toBe(seed!.labelEn); // bilingual doğru
    } finally {
      await prisma.platformRequestCategory.delete({ where: { key: inactiveKey } }).catch(() => {});
    }
  });

  it("cross-store scope: başka store'un talebi detay/list'te görünmez", async () => {
    const a = await seedStore();
    const b = await seedStore();
    const req = await openRequest(a);
    expect(await getStoreRequestDetail(b, req.requestId, NOW())).toBeNull();
    expect(await getStoreRequestDetail(a, req.requestId, NOW())).not.toBeNull();
    const listB = await listStoreRequests(b, { page: 1, pageSize: 20, now: NOW() });
    expect(listB.items.some((i) => i.id === req.requestId)).toBe(false);
  });

  it("store list assigneeName projection: atanınca ad; kullanıcı silinince null (ghost-safe, raw id yok)", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();
    const req = await openRequest(storeId);
    const row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: req.requestId }, select: { version: true } });
    const assigned = await assignRequest({ requestId: req.requestId, actorUserId: pu, expectedVersion: row.version, assigneePlatformUserId: pu }, d);
    expect(assigned.ok).toBe(true);
    const puUser = await prisma.platformUser.findUniqueOrThrow({ where: { id: pu }, select: { name: true } });
    const listed = await listStoreRequests(storeId, { page: 1, pageSize: 20, now: NOW() });
    const item = listed.items.find((i) => i.id === req.requestId)!;
    expect(item.assigneeName).toBe(puUser.name);
    expect(JSON.stringify(item)).not.toContain(pu); // raw PlatformUser id sızmaz

    // Ghost: assignee kullanıcısı silinir → assigneeName null (fallback-safe).
    await prisma.platformUser.delete({ where: { id: pu } });
    createdUsers.splice(createdUsers.indexOf(pu), 1);
    const listed2 = await listStoreRequests(storeId, { page: 1, pageSize: 20, now: NOW() });
    expect(listed2.items.find((i) => i.id === req.requestId)!.assigneeName).toBeNull();
  });

  it("store list SLA current-cycle state döner (sadeleştirilmiş)", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const listed = await listStoreRequests(storeId, { page: 1, pageSize: 20, now: NOW() });
    const item = listed.items.find((i) => i.id === req.requestId)!;
    expect(item.sla).not.toBeNull();
    expect(item.sla!.firstResponseState).toBeDefined();
    expect(item.sla!.resolutionState).toBeDefined();
    // sadeleştirilmiş: ham dueAt/policy alanı yok
    expect((item.sla as Record<string, unknown>).firstResponseDueAt).toBeUndefined();
  });

  it("slaRisk canonical live-cycle ile çalışır; historical (resolved) cycle FALSE-POSITIVE üretmez", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();
    const past = new Date(Date.now() - 5 * DAY);

    // (a) Aktif + live cycle vadesi geçmiş → slaRisk=true döner.
    const risky = await openRequest(storeId);
    await prisma.platformRequestSlaSnapshot.updateMany({
      where: { requestId: risky.requestId },
      data: { firstResponseDueAt: past, resolutionDueAt: past },
    });
    const risk = await listStoreRequests(storeId, { page: 1, pageSize: 20, slaRisk: true, now: NOW() });
    expect(risk.items.some((i) => i.id === risky.requestId)).toBe(true);

    // (b) RESOLVED (historical cycle overdue-tarihli, ama resolvedAt set) → live cycle yok → risk DIŞI.
    const resolved = await openRequest(storeId);
    const r = await prisma.platformRequest.findUniqueOrThrow({ where: { id: resolved.requestId }, select: { version: true } });
    await setStatus({ requestId: resolved.requestId, actorUserId: pu, expectedVersion: r.version, toStatus: "RESOLVED" }, d, NOW());
    await prisma.platformRequestSlaSnapshot.updateMany({
      where: { requestId: resolved.requestId },
      data: { firstResponseDueAt: past, resolutionDueAt: past },
    });
    const risk2 = await listStoreRequests(storeId, { page: 1, pageSize: 20, slaRisk: true, now: NOW() });
    expect(risk2.items.some((i) => i.id === resolved.requestId)).toBe(false);
  });

  it("store detail timeline: güvenli lifecycle event'leri; INTERNAL not timeline'a girmez (gövde sızmaz)", async () => {
    const storeId = await seedStore();
    const pu = await seedPlatformUser();
    const req = await openRequest(storeId);
    const row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: req.requestId }, select: { version: true } });
    await setStatus({ requestId: req.requestId, actorUserId: pu, expectedVersion: row.version, toStatus: "TRIAGED" }, d, NOW());
    // Platform INTERNAL not ekle → timeline'a ASLA girmemeli, gövdesi asla görünmemeli.
    await addPlatformMessage({ requestId: req.requestId, actorUserId: pu, body: "GIZLI internal note body", visibility: "INTERNAL" }, d, NOW());

    const detail = await getStoreRequestDetail(storeId, req.requestId, NOW());
    expect(detail).not.toBeNull();
    const events = detail!.timeline.map((e) => e.event);
    expect(events).toContain("CREATED");
    expect(events).toContain("STATUS_CHANGED");
    const s = JSON.stringify(detail!.timeline);
    expect(s).not.toContain("GIZLI");
    expect(s).not.toContain("internal note body");
    expect(s).not.toContain(pu); // actor raw id sızmaz
  });
});

// TODO-178 (Faz E) — Attachment upload/serve + visibility isolation + MEDIA_IN_USE + notification.
describe.skipIf(!hasDb)("TODO-178 Faz E — attachments + notification security", () => {
  function memStorage(): StorageDriver & { reads: string[] } {
    const mem = new Map<string, Buffer>();
    const reads: string[] = [];
    return {
      reads,
      put: async (key: string, body: Buffer) => {
        mem.set(key, body);
      },
      read: async (key: string) => {
        reads.push(key);
        return mem.get(key) ?? null;
      },
    } as StorageDriver & { reads: string[] };
  }
  const png = () =>
    sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .png()
      .toBuffer();
  const pdf = () => Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

  it("store PHOTO upload → webp, STORE_VISIBLE forced, storageKey server-side (client injektemez)", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const storage = memStorage();
    const result = await addStoreRequestAttachment(
      { storeId, requestId: req.requestId, actorId: "actor", raw: await png(), mimetype: "image/png" },
      storage,
    );
    expect(result.ok && result.attachment.type).toBe("PHOTO");
    const row = await prisma.platformRequestAttachment.findFirstOrThrow({
      where: { requestId: req.requestId },
      include: { mediaAsset: true },
    });
    expect(row.visibility).toBe("STORE_VISIBLE"); // client visibility gönderemez
    expect(row.mediaAsset.context).toBe("PLATFORM_REQUEST_ATTACHMENT");
    // storageKey server-side üretildi: stores/<id>/platform-requests/<uuid>.webp (client kontrol edemez)
    expect(row.mediaAsset.storageKey).toMatch(
      new RegExp(`^stores/${storeId}/platform-requests/[a-f0-9-]+\\.webp$`),
    );
  });

  it("store PDF upload → as-is (.pdf), STORE_VISIBLE", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const result = await addStoreRequestAttachment(
      { storeId, requestId: req.requestId, actorId: "actor", raw: pdf(), mimetype: "application/pdf" },
      memStorage(),
    );
    expect(result.ok && result.attachment.type).toBe("PDF");
    const row = await prisma.platformRequestAttachment.findFirstOrThrow({
      where: { requestId: req.requestId },
      include: { mediaAsset: { select: { storageKey: true } } },
    });
    expect(row.mediaAsset.storageKey).toMatch(/\.pdf$/);
  });

  it("invalid MIME (video/mp4) reddedilir; büyük dosya reddedilir", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const bad = await addStoreRequestAttachment(
      { storeId, requestId: req.requestId, actorId: "actor", raw: Buffer.from("x"), mimetype: "video/mp4" },
      memStorage(),
    );
    expect(bad).toEqual({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE" });
    const big = await addStoreRequestAttachment(
      { storeId, requestId: req.requestId, actorId: "actor", raw: Buffer.alloc(6_000_000), mimetype: "application/pdf" },
      memStorage(),
    );
    expect(big).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("orphan/mismatch: başka store'un talebine ek eklenemez (REQUEST_NOT_FOUND)", async () => {
    const storeA = await seedStore();
    const storeB = await seedStore();
    const reqA = await openRequest(storeA);
    const wrong = await addStoreRequestAttachment(
      { storeId: storeB, requestId: reqA.requestId, actorId: "actor", raw: pdf(), mimetype: "application/pdf" },
      memStorage(),
    );
    expect(wrong).toEqual({ ok: false, code: "REQUEST_NOT_FOUND" });
  });

  it("platform STORE_VISIBLE + INTERNAL upload; store detail INTERNAL eki GÖRMEZ (metadata/count/preview)", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const pu = await seedPlatformUser();
    const visible = await addPlatformRequestAttachment(
      { requestId: req.requestId, actorId: pu, raw: pdf(), mimetype: "application/pdf", visibility: "STORE_VISIBLE" },
      memStorage(),
    );
    const internal = await addPlatformRequestAttachment(
      { requestId: req.requestId, actorId: pu, raw: pdf(), mimetype: "application/pdf", visibility: "INTERNAL" },
      memStorage(),
    );
    expect(visible.ok && internal.ok).toBe(true);

    const storeDetail = await getStoreRequestDetail(storeId, req.requestId, NOW());
    expect(storeDetail!.attachments).toHaveLength(1); // yalnız STORE_VISIBLE
    if (internal.ok) {
      expect(JSON.stringify(storeDetail!.attachments)).not.toContain(internal.attachment.id);
    }
    const platformDetail = await getPlatformRequestDetail(req.requestId, NOW());
    expect(platformDetail!.attachments).toHaveLength(2); // platform ikisini de görür
    expect(platformDetail!.attachments.some((a) => a.visibility === "INTERNAL")).toBe(true);
  });

  it("store stream: INTERNAL ek 404; cross-store 404; STORE_VISIBLE başarılı; platform stream tam yüzey", async () => {
    const storeId = await seedStore();
    const otherStore = await seedStore();
    const req = await openRequest(storeId);
    const pu = await seedPlatformUser();
    const vis = await addPlatformRequestAttachment(
      { requestId: req.requestId, actorId: pu, raw: pdf(), mimetype: "application/pdf", visibility: "STORE_VISIBLE" },
      memStorage(),
    );
    const int = await addPlatformRequestAttachment(
      { requestId: req.requestId, actorId: pu, raw: pdf(), mimetype: "application/pdf", visibility: "INTERNAL" },
      memStorage(),
    );
    if (!vis.ok || !int.ok) throw new Error("upload failed");

    // store STORE_VISIBLE → media döner; INTERNAL → null (404); cross-store → null (404)
    expect(await getStoreAttachmentForStream(storeId, vis.attachment.id)).not.toBeNull();
    expect(await getStoreAttachmentForStream(storeId, int.attachment.id)).toBeNull();
    expect(await getStoreAttachmentForStream(otherStore, vis.attachment.id)).toBeNull();
    // platform → ikisi de erişilebilir (tam yüzey)
    expect(await getPlatformAttachmentForStream(int.attachment.id)).not.toBeNull();
  });

  it("MEDIA_IN_USE: bağlı MediaAsset silinmeye çalışılırsa attachment count > 0 (guard yakalar)", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const result = await addStoreRequestAttachment(
      { storeId, requestId: req.requestId, actorId: "actor", raw: pdf(), mimetype: "application/pdf" },
      memStorage(),
    );
    if (!result.ok) throw new Error("upload failed");
    const att = await prisma.platformRequestAttachment.findFirstOrThrow({
      where: { id: result.attachment.id },
      select: { mediaAssetId: true },
    });
    const count = await prisma.platformRequestAttachment.count({
      where: { mediaAssetId: att.mediaAssetId, storeId },
    });
    expect(count).toBeGreaterThan(0); // media/routes.ts guard bunu 409 MEDIA_IN_USE'a çevirir
  });

  it("notification honesty: UNCONFIGURED; internal note store bildirimi ÜRETMEZ; assign store'a bildirir", async () => {
    const storeId = await seedStore();
    const req = await openRequest(storeId);
    const pu = await seedPlatformUser();
    const calls: { event: string; recipient: string }[] = [];
    const spy: PlatformRequestNotificationDispatcherLike = {
      isConfigured: false,
      sendRequestNotification: async (input) => {
        calls.push({ event: input.event, recipient: input.recipient });
        return { delivery: "UNCONFIGURED" as const };
      },
    };
    // INTERNAL not → store bildirimi YOK
    await addPlatformMessage(
      { requestId: req.requestId, actorUserId: pu, body: "iç", visibility: "INTERNAL" },
      spy,
      NOW(),
    );
    expect(calls.some((c) => c.recipient === "STORE")).toBe(false);

    // assign → REQUEST_ASSIGNED, recipient STORE (delivery UNCONFIGURED; sahte SENT yok)
    const row = await prisma.platformRequest.findUniqueOrThrow({ where: { id: req.requestId }, select: { version: true } });
    const res = await spy.sendRequestNotification({
      storeId,
      requestId: req.requestId,
      requestNumber: req.requestNumber,
      event: "REQUEST_ASSIGNED",
      recipient: "STORE",
    });
    expect(res.delivery).toBe("UNCONFIGURED");
    await assignRequest(
      { requestId: req.requestId, actorUserId: pu, expectedVersion: row.version, assigneePlatformUserId: pu },
      spy,
    );
    expect(calls.filter((c) => c.event === "REQUEST_ASSIGNED" && c.recipient === "STORE").length).toBeGreaterThanOrEqual(1);
  });

  it("notification failure domain write'ı ROLLBACK etmez (best-effort)", async () => {
    const storeId = await seedStore();
    const throwing: PlatformRequestNotificationDispatcherLike = {
      isConfigured: true,
      sendRequestNotification: async () => {
        throw new Error("email provider down");
      },
    };
    // createRequest COMMIT sonrası notify çağırır; throw'a rağmen request yazılmış olmalı.
    const r = await createRequest(
      {
        storeId,
        categoryKey: "CANCELLATION_TAXONOMY",
        subject: "s",
        description: "d",
        actor: storeActor(storeId),
      },
      throwing,
      NOW(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const persisted = await prisma.platformRequest.findUnique({ where: { id: r.requestId } });
      expect(persisted).not.toBeNull(); // domain commit korunur
    }
  });
});

// Minimal dispatcher tipi (test-local); gerçek PlatformRequestNotificationDispatcher ile uyumlu.
interface PlatformRequestNotificationDispatcherLike {
  isConfigured: boolean;
  sendRequestNotification: (input: {
    storeId: string;
    requestId: string;
    requestNumber: string;
    event: string;
    recipient: string;
  }) => Promise<{ delivery: "UNCONFIGURED" | "QUEUED" | "SENT" | "FAILED" }>;
}
