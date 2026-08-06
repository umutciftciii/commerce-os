/**
 * TODO-172 (ADR-273) — Fast Refund Controls GERCEK-DB entegrasyon testleri.
 *
 * `POST /returns/:id/fast-refund`: teslim alma + inceleme atlanarak dogrudan REFUND_PENDING +
 * initiateRefund. AYRI guclu yetki (SUPER_ADMIN). Kaynak durumlar YALNIZ AWAITING_SHIPMENT
 * (onaylandi, henuz teslim alinmadi) + RECEIVED (inceleme atlanir). Limit/currency/intent sunucu-
 * otoriter; client tutar/limit gondermez. Idempotent (cift tiklama / stale). Provider I/O tx disinda.
 *
 * `GET /returns/:id/fast-refund-context`: bounded risk/uygunluk ozeti (permission/enabled/limit/risk).
 *
 * DATABASE_URL verilmezse SKIP (CI-safe). Bkz. helpers/returns-db.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { applyReturnTransition } from "../src/returns/service.js";
import {
  adminReturnAction,
  buildReturnAdminApp,
  capturedAudits,
  createTwoLineRefundReturn,
  currentReturnVersion,
  hasTestDb,
  loadOrderRefunds,
  loadReturnState,
  seedTwoLineDeliveredOrder,
  type SeededTwoLineOrder,
} from "./helpers/returns-db.js";

type App = ReturnType<typeof buildReturnAdminApp>;

async function enableFastRefund(
  storeId: string,
  opts: { enabled?: boolean; maxAmountMinor: number | null; currency?: string | null },
): Promise<void> {
  await prisma.storeSettings.upsert({
    where: { storeId },
    create: {
      storeId,
      fastRefundEnabled: opts.enabled ?? true,
      fastRefundMaxAmountMinor: opts.maxAmountMinor === null ? null : BigInt(opts.maxAmountMinor),
      fastRefundCurrency: opts.currency ?? null,
    },
    update: {
      fastRefundEnabled: opts.enabled ?? true,
      fastRefundMaxAmountMinor: opts.maxAmountMinor === null ? null : BigInt(opts.maxAmountMinor),
      fastRefundCurrency: opts.currency ?? null,
    },
  });
}

/** approve (tam) → iade AWAITING_SHIPMENT'te dinlenir (Faz 1 otomatik ilerleme). Intent PENDING. */
async function approveToAwaiting(app: App, s: SeededTwoLineOrder, rrId: string): Promise<void> {
  const approve = await adminReturnAction(app, s.storeId, rrId, "approve", {});
  expect(approve.statusCode).toBe(200);
}

/** AWAITING_SHIPMENT → RETURN_SHIPPED (customer) → RECEIVED (admin). */
async function driveToReceived(app: App, s: SeededTwoLineOrder, rrId: string): Promise<void> {
  await approveToAwaiting(app, s, rrId);
  await applyReturnTransition(s.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: s.customerId });
  const received = await adminReturnAction(app, s.storeId, rrId, "transition", { targetStatus: "RECEIVED" });
  expect(received.statusCode).toBe(200);
}

async function fastRefund(
  app: App,
  storeId: string,
  rrId: string,
  body: Record<string, unknown> = {},
  version?: number,
) {
  const v = version ?? (await currentReturnVersion(storeId, rrId));
  return app.inject({
    method: "POST",
    url: `/stores/${storeId}/returns/${rrId}/fast-refund`,
    payload: { reason: "Müşteri memnuniyeti; ürün düşük değerli.", expectedVersion: v, ...body },
  });
}

async function fastRefundContext(app: App, storeId: string, rrId: string) {
  return app.inject({ method: "GET", url: `/stores/${storeId}/returns/${rrId}/fast-refund-context` });
}

describe.skipIf(!hasTestDb)("Fast Refund Controls (live DB, TODO-172 / ADR-273)", () => {
  let seeded: SeededTwoLineOrder | null = null;
  afterEach(async () => {
    if (seeded) await seeded.cleanup();
    seeded = null;
  });

  // ── Happy paths ───────────────────────────────────────────────────────────────
  it("AWAITING_SHIPMENT → tek başarılı hızlı iade → OrderRefund SUCCEEDED → COMPLETED; skippedSteps history", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    const pre = await loadReturnState(s.storeId, rrId);
    expect(pre?.status).toBe("AWAITING_SHIPMENT");
    const total = pre!.refundIntent!.totalRefundMinor;
    await enableFastRefund(s.storeId, { maxAmountMinor: total });

    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(200);

    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("COMPLETED");
    expect(state?.refundIntent?.status).toBe("CONSUMED");
    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe("SUCCEEDED");
    expect(refunds[0].totalRefundMinor).toBe(total);

    // History marker: YAPISAL eventType + metadata (note substring/JSON.parse DEĞİL — Blocker 2).
    const marker = state?.history.find((h) => h.eventType === "RETURN_FAST_REFUND_STARTED");
    expect(marker).toBeTruthy();
    const meta = marker!.metadata as Record<string, unknown>;
    expect(meta.sourceStatus).toBe("AWAITING_SHIPMENT");
    expect(meta.skippedSteps).toEqual(["CUSTOMER_RETURN_SHIPMENT", "STORE_RECEIPT", "INSPECTION"]);
    expect(meta.amountMinor).toBe(String(total)); // kanonik string
    expect(meta.limitMinor).toBe(String(total));
    expect(marker!.fromStatus).toBe("AWAITING_SHIPMENT");
    expect(marker!.toStatus).toBe("REFUND_PENDING");
    // note insan-okur kalır, domain payload metadata'da (note'ta JSON YOK).
    expect(marker!.note).not.toContain("skippedSteps");

    // Audit trail: return.fast_refund.started yazıldı (skippedSteps + amount + limit KANONİK STRING).
    const startedAudit = capturedAudits(app).find(
      (a) => a.metadata?.action === "return.fast_refund.started",
    );
    expect(startedAudit).toBeTruthy();
    expect(startedAudit!.metadata!.limitMinor).toBe(String(total));
    expect(startedAudit!.metadata!.skippedSteps).toEqual([
      "CUSTOMER_RETURN_SHIPMENT",
      "STORE_RECEIPT",
      "INSPECTION",
    ]);

    await app.close();
  });

  it("RECEIVED → hızlı iade: yalnız inceleme atlandı (skippedSteps=[INSPECTION]); refund başarılı", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await driveToReceived(app, s, rrId);
    const pre = await loadReturnState(s.storeId, rrId);
    expect(pre?.status).toBe("RECEIVED");
    await enableFastRefund(s.storeId, { maxAmountMinor: pre!.refundIntent!.totalRefundMinor });

    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(200);

    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("COMPLETED");
    const marker = state?.history.find((h) => h.eventType === "RETURN_FAST_REFUND_STARTED");
    const meta = marker!.metadata as Record<string, unknown>;
    expect(meta.sourceStatus).toBe("RECEIVED");
    expect(meta.skippedSteps).toEqual(["INSPECTION"]);
    await app.close();
  });

  // ── Permission ─────────────────────────────────────────────────────────────────
  it("SUPPORT_ADMIN (normal admin) → 403 (backend-enforced, güçlü yetki)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const superApp = buildReturnAdminApp("admin", "SUPER_ADMIN");
    const normalApp = buildReturnAdminApp("normal", "SUPPORT_ADMIN");
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(superApp, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });

    const res = await fastRefund(normalApp, s.storeId, rrId);
    expect(res.statusCode).toBe(403);
    // İade değişmedi (hâlâ AWAITING_SHIPMENT; hiç refund oluşmadı).
    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("AWAITING_SHIPMENT");
    expect(await loadOrderRefunds(s.storeId, rrId)).toHaveLength(0);
    await superApp.close();
    await normalApp.close();
  });

  it("cross-store (yanlış storeId) → 404 (store-scoped görünmezlik)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const res = await app.inject({
      method: "POST",
      url: `/stores/other-store/returns/${rrId}/fast-refund`,
      payload: { reason: "cross store attempt", expectedVersion: 0 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // ── Settings / limit ─────────────────────────────────────────────────────────
  it("enabled=false → 409 FAST_REFUND_DISABLED", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { enabled: false, maxAmountMinor: 9_999_999 });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FAST_REFUND_DISABLED");
    await app.close();
  });

  it("limit null → 409 FAST_REFUND_LIMIT_NOT_SET (kapalı, sınırsız DEĞİL)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { enabled: true, maxAmountMinor: null });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FAST_REFUND_LIMIT_NOT_SET");
    await app.close();
  });

  it("tutar = limit (sınır dahil) → başarılı", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    const total = (await loadReturnState(s.storeId, rrId))!.refundIntent!.totalRefundMinor;
    await enableFastRefund(s.storeId, { maxAmountMinor: total });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("tutar > limit → 409 FAST_REFUND_LIMIT_EXCEEDED (refund başlatılmaz)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    const total = (await loadReturnState(s.storeId, rrId))!.refundIntent!.totalRefundMinor;
    await enableFastRefund(s.storeId, { maxAmountMinor: total - 1 });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FAST_REFUND_LIMIT_EXCEEDED");
    // Durum değişmedi + refund yok.
    expect((await loadReturnState(s.storeId, rrId))?.status).toBe("AWAITING_SHIPMENT");
    expect(await loadOrderRefunds(s.storeId, rrId)).toHaveLength(0);
    await app.close();
  });

  it("currency mismatch (limit currency ≠ order currency) → 409 FAST_REFUND_CURRENCY_MISMATCH", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999, currency: "USD" });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FAST_REFUND_CURRENCY_MISMATCH");
    await app.close();
  });

  // ── Kaynak durum ─────────────────────────────────────────────────────────────
  it("REQUESTED → 409 FAST_REFUND_INVALID_STATE (onay yok)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FAST_REFUND_INVALID_STATE");
    await app.close();
  });

  it("RETURN_SHIPPED → 409 FAST_REFUND_INVALID_STATE (ürün yolda; ayrı ürün kararı)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await applyReturnTransition(s.storeId, rrId, "RETURN_SHIPPED", { type: "CUSTOMER", id: s.customerId });
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("FAST_REFUND_INVALID_STATE");
    await app.close();
  });

  it("başarılı iade sonrası ikinci çağrı (REFUND_PENDING/COMPLETED) → 409 (duplicate reddi)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    expect((await fastRefund(app, s.storeId, rrId)).statusCode).toBe(200);
    // İkinci çağrı: durum artık COMPLETED → INVALID_STATE; yeni OrderRefund oluşmaz.
    const second = await fastRefund(app, s.storeId, rrId);
    expect(second.statusCode).toBe(409);
    expect(await loadOrderRefunds(s.storeId, rrId)).toHaveLength(1);
    await app.close();
  });

  // ── Orchestration robustness ──────────────────────────────────────────────────
  it("provider async decline (refund_failure) → başlatma başarılı (200) ama OrderRefund FAILED; REFUND_PENDING korunur, COMPLETED OLMAZ", async () => {
    // MOCK refund_failure bir BAŞLATMA hatası değil, provider'ın async RED'idir (inspect-decision ile
    // aynı otorite): initiateRefund ok:true döner (satır oluştu + intent CONSUMED), provider sonucu
    // FAILED ledger satırı olur. Talep COMPLETED'a geçmez (gerçek refund SUCCEEDED değil) — admin
    // refund panelinden retry edebilir. Bu, "gerçek refund olmadan COMPLETED olmaz" güvencesini kanıtlar.
    seeded = await seedTwoLineDeliveredOrder({ paymentScenario: "refund_failure" });
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const res = await fastRefund(app, s.storeId, rrId);
    expect(res.statusCode).toBe(200);

    const state = await loadReturnState(s.storeId, rrId);
    expect(state?.status).toBe("REFUND_PENDING");
    expect(state?.status).not.toBe("COMPLETED");
    expect(state?.refundIntent?.status).toBe("CONSUMED");
    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe("FAILED");
    await app.close();
  });

  it("çift tıklama (aynı version, eşzamanlı) → yalnız 1 OrderRefund (idempotent)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const version = await currentReturnVersion(s.storeId, rrId);
    const payload = { reason: "Duplicate click smoke", expectedVersion: version };
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/stores/${s.storeId}/returns/${rrId}/fast-refund`, payload }),
      app.inject({ method: "POST", url: `/stores/${s.storeId}/returns/${rrId}/fast-refund`, payload }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400);
    expect(await loadOrderRefunds(s.storeId, rrId)).toHaveLength(1);
    await app.close();
  });

  it("stale version → 409 VERSION_CONFLICT (refund başlatılmaz)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const res = await fastRefund(app, s.storeId, rrId, {}, 999);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("VERSION_CONFLICT");
    expect(await loadOrderRefunds(s.storeId, rrId)).toHaveLength(0);
    await app.close();
  });

  // ── Security ─────────────────────────────────────────────────────────────────
  it("client amount/limit yok sayılır (şemada yok) → sunucu total'ı kullanılır", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    const total = (await loadReturnState(s.storeId, rrId))!.refundIntent!.totalRefundMinor;
    await enableFastRefund(s.storeId, { maxAmountMinor: total });
    // Body'de amountMinor/limitMinor gönderilse bile zod bunları düşürür; refund sunucu total'ıyla oluşur.
    const res = await fastRefund(app, s.storeId, rrId, { amountMinor: 1, limitMinor: 1 });
    expect(res.statusCode).toBe(200);
    const refunds = await loadOrderRefunds(s.storeId, rrId);
    expect(refunds[0].totalRefundMinor).toBe(total);
    await app.close();
  });

  it("reason zorunlu → boş/çok kısa gerekçe 400 (VALIDATION_ERROR)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const v = await currentReturnVersion(s.storeId, rrId);
    const res = await app.inject({
      method: "POST",
      url: `/stores/${s.storeId}/returns/${rrId}/fast-refund`,
      payload: { reason: "", expectedVersion: v },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // ── Risk context ─────────────────────────────────────────────────────────────
  it("fast-refund-context: SUPER_ADMIN permitted + eligible + risk sayıları", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    const total = (await loadReturnState(s.storeId, rrId))!.refundIntent!.totalRefundMinor;
    await enableFastRefund(s.storeId, { maxAmountMinor: total });

    const res = await fastRefundContext(app, s.storeId, rrId);
    expect(res.statusCode).toBe(200);
    const ctx = res.json().context;
    expect(ctx.permitted).toBe(true);
    expect(ctx.enabled).toBe(true);
    expect(ctx.eligible).toBe(true);
    expect(ctx.reasonCode).toBeNull();
    expect(ctx.sourceStatus).toBe("AWAITING_SHIPMENT");
    expect(ctx.skippedSteps).toEqual(["CUSTOMER_RETURN_SHIPMENT", "STORE_RECEIPT", "INSPECTION"]);
    // Kanonik minor STRING (Number/float YOK).
    expect(ctx.refundAmountMinor).toBe(String(total));
    expect(ctx.limitMinor).toBe(String(total));
    expect(typeof ctx.refundAmountMinor).toBe("string");
    expect(ctx.withinLimit).toBe(true);
    expect(ctx.customerOrderCount).toBeGreaterThanOrEqual(1);
    expect(ctx.customerReturnCount).toBeGreaterThanOrEqual(1);
    expect(ctx.deliveryReceived).toBe(false);
    expect(ctx.inspectionDone).toBe(false);
    await app.close();
  });

  it("fast-refund-context: normal admin permitted=false, reasonCode=NOT_PERMITTED (CTA gizli)", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const superApp = buildReturnAdminApp("admin", "SUPER_ADMIN");
    const normalApp = buildReturnAdminApp("normal", "SUPPORT_ADMIN");
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(superApp, s, rrId);
    await enableFastRefund(s.storeId, { maxAmountMinor: 9_999_999 });
    const res = await fastRefundContext(normalApp, s.storeId, rrId);
    expect(res.statusCode).toBe(200);
    const ctx = res.json().context;
    expect(ctx.permitted).toBe(false);
    expect(ctx.eligible).toBe(false);
    expect(ctx.reasonCode).toBe("NOT_PERMITTED");
    await superApp.close();
    await normalApp.close();
  });

  it("fast-refund-context: limit aşıldığında eligible=false + reasonCode=FAST_REFUND_LIMIT_EXCEEDED", async () => {
    seeded = await seedTwoLineDeliveredOrder();
    const s = seeded;
    const app = buildReturnAdminApp();
    const rrId = await createTwoLineRefundReturn(s);
    await approveToAwaiting(app, s, rrId);
    const total = (await loadReturnState(s.storeId, rrId))!.refundIntent!.totalRefundMinor;
    await enableFastRefund(s.storeId, { maxAmountMinor: total - 1 });
    const res = await fastRefundContext(app, s.storeId, rrId);
    const ctx = res.json().context;
    expect(ctx.eligible).toBe(false);
    expect(ctx.withinLimit).toBe(false);
    expect(ctx.reasonCode).toBe("FAST_REFUND_LIMIT_EXCEEDED");
    await app.close();
  });
});
