/**
 * TD-131 (ADR-149…155) — Customer Data Erasure servis testleri (fake data + fake lock).
 *
 * Kapsam: onay/neden doğrulama · advisory lock (eşzamanlı erase reddi) · idempotent
 * ikinci apply (ALREADY_ERASED) · not-found (cross-store) · deactivate · **audit PII sızıntısı yok**.
 */
import { describe, expect, it, vi } from "vitest";
import { createCustomerErasureService } from "../src/customer-erasure/service.js";
import { emptyDeleteCounts } from "../src/customer-erasure/core.js";
import type {
  ApplyErasureResult,
  CustomerErasureData,
  CustomerErasurePreviewData,
  DeactivateResult,
} from "../src/customer-erasure/data.js";
import type { StoreJobLocker } from "../src/commercial-automation/advisory-lock.js";

const previewFixture = (over: Partial<CustomerErasurePreviewData> = {}): CustomerErasurePreviewData => ({
  status: "ACTIVE",
  erasedAt: null,
  erasedByUserId: null,
  eraseReason: null,
  activeSessionCount: 2,
  openOrderCount: 1,
  deleteCounts: { ...emptyDeleteCounts(), sessions: 2, recentlyViewed: 4, recommendationEvents: 6 },
  anonymizeCounts: { orders: 3, orderAddresses: 5, campaignRedemptions: 1 },
  preserveCounts: { orders: 3, orderLines: 7, payments: 3, campaignRedemptions: 1 },
  reviewAnonymizeCount: 2,
  ...over,
});

const erasedResult = (): Extract<ApplyErasureResult, { kind: "ERASED" }> => ({
  kind: "ERASED",
  deleted: { ...emptyDeleteCounts(), sessions: 2, recentlyViewed: 4, recommendationEvents: 6, coupons: 1 },
  anonymized: { orders: 3, orderAddresses: 5, campaignRedemptions: 1 },
  reviewAnonymizeCount: 2,
  erasedAt: new Date("2026-07-27T10:00:00.000Z"),
});

function fakeData(over: Partial<CustomerErasureData> = {}): CustomerErasureData {
  return {
    findState: vi.fn(async () => ({ status: "ACTIVE", erasedAt: null, erasedByUserId: null, eraseReason: null })),
    preview: vi.fn(async () => previewFixture()),
    applyErasure: vi.fn(async () => erasedResult()),
    deactivate: vi.fn(async (): Promise<DeactivateResult> => ({ kind: "DEACTIVATED", revokedCount: 2 })),
    ...over,
  };
}

// Kilit her zaman alınır (fn'i çalıştır).
const passLocker: StoreJobLocker = async (_j, _s, fn) => ({ acquired: true, result: await fn() });
// Kilit ASLA alınmaz (eşzamanlı erase).
const busyLocker: StoreJobLocker = async () => ({ acquired: false });

const logger = { info: vi.fn(), warn: vi.fn() };

describe("erasure service: apply doğrulama", () => {
  it("yanlış onay ifadesi → CONFIRMATION_REQUIRED (veri katmanına GİTMEZ)", async () => {
    const data = fakeData();
    const recordAudit = vi.fn(async () => {});
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit, logger });
    const r = await svc.apply("s1", "c1", { actorUserId: "a1", reason: "x", confirmationPhrase: "yanlış" });
    expect(r.kind).toBe("CONFIRMATION_REQUIRED");
    expect(data.applyErasure).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("boş neden → REASON_REQUIRED", async () => {
    const data = fakeData();
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit: vi.fn(), logger });
    const r = await svc.apply("s1", "c1", { actorUserId: "a1", reason: "   ", confirmationPhrase: "KİŞİSEL VERİLERİ SİL" });
    expect(r.kind).toBe("REASON_REQUIRED");
    expect(data.applyErasure).not.toHaveBeenCalled();
  });

  it("kilit alınamazsa → ERASURE_IN_PROGRESS (veri katmanı çağrılmaz)", async () => {
    const data = fakeData();
    const svc = createCustomerErasureService({ data, locker: busyLocker, recordAudit: vi.fn(), logger });
    const r = await svc.apply("s1", "c1", { actorUserId: "a1", reason: "KVKK", confirmationPhrase: "KİŞİSEL VERİLERİ SİL" });
    expect(r.kind).toBe("IN_PROGRESS");
  });
});

describe("erasure service: apply sonuçları", () => {
  it("başarı → ERASED + audit yalnız sayaç/alan-adı (PII YOK)", async () => {
    const data = fakeData();
    const recordAudit = vi.fn(async () => {});
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit, logger });
    const r = await svc.apply("s1", "c1", {
      actorUserId: "a1",
      reason: "KVKK md.7 talebi",
      confirmationPhrase: "  KİŞİSEL VERİLERİ SİL  ",
    });
    expect(r.kind).toBe("ERASED");
    expect(recordAudit).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0][0];
    expect(audit.action).toBe("DELETE");
    expect(audit.entityType).toBe("Customer");
    expect(audit.platformUserId).toBe("a1");
    // Audit metadata JSON'unda ham PII (e-posta/telefon/TCKN/IBAN deseni) BULUNMAMALI.
    const blob = JSON.stringify(audit.metadata);
    expect(blob).not.toMatch(/@/); // e-posta yok
    expect(blob).not.toMatch(/\bTR\d/); // IBAN yok
    expect(blob).not.toMatch(/\+?\d{10,}/); // uzun telefon/TCKN dizisi yok
    expect(audit.metadata.deleteTotal).toBeGreaterThan(0);
  });

  it("idempotent ikinci apply → ALREADY_ERASED (audit DELETE yazılmaz)", async () => {
    const data = fakeData({
      applyErasure: vi.fn(async (): Promise<ApplyErasureResult> => ({
        kind: "ALREADY_ERASED",
        state: { status: "ERASED", erasedAt: new Date("2026-07-27T09:00:00.000Z"), erasedByUserId: "a0", eraseReason: "önceki" },
      })),
    });
    const recordAudit = vi.fn(async () => {});
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit, logger });
    const r = await svc.apply("s1", "c1", { actorUserId: "a1", reason: "KVKK", confirmationPhrase: "KİŞİSEL VERİLERİ SİL" });
    expect(r.kind).toBe("ALREADY_ERASED");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("bulunamayan/cross-store müşteri → NOT_FOUND", async () => {
    const data = fakeData({
      applyErasure: vi.fn(async (): Promise<ApplyErasureResult> => ({ kind: "NOT_FOUND" })),
    });
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit: vi.fn(), logger });
    const r = await svc.apply("s1", "c1", { actorUserId: "a1", reason: "KVKK", confirmationPhrase: "KİŞİSEL VERİLERİ SİL" });
    expect(r.kind).toBe("NOT_FOUND");
  });
});

describe("erasure service: preview + deactivate", () => {
  it("preview → OK + confirmationPhrase + dry-run audit (SYSTEM)", async () => {
    const data = fakeData();
    const recordAudit = vi.fn(async () => {});
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit, logger });
    const r = await svc.preview("s1", "c1", "a1");
    expect(r.kind).toBe("OK");
    if (r.kind === "OK") expect(r.report.confirmationPhrase).toBe("KİŞİSEL VERİLERİ SİL");
    expect(recordAudit.mock.calls[0][0].action).toBe("SYSTEM");
    expect(recordAudit.mock.calls[0][0].metadata.mode).toBe("dry-run");
  });

  it("preview NOT_FOUND → audit yazılmaz", async () => {
    const data = fakeData({ preview: vi.fn(async () => null) });
    const recordAudit = vi.fn(async () => {});
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit, logger });
    const r = await svc.preview("s1", "c1", "a1");
    expect(r.kind).toBe("NOT_FOUND");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("deactivate → DEACTIVATED + UPDATE audit", async () => {
    const data = fakeData();
    const recordAudit = vi.fn(async () => {});
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit, logger });
    const r = await svc.deactivate("s1", "c1", "a1");
    expect(r).toEqual({ kind: "DEACTIVATED", revokedCount: 2 });
    expect(recordAudit.mock.calls[0][0].action).toBe("UPDATE");
    expect(recordAudit.mock.calls[0][0].metadata.operation).toBe("deactivate");
  });

  it("deactivate ERASED müşteri → ALREADY_ERASED", async () => {
    const data = fakeData({ deactivate: vi.fn(async (): Promise<DeactivateResult> => ({ kind: "ALREADY_ERASED" })) });
    const svc = createCustomerErasureService({ data, locker: passLocker, recordAudit: vi.fn(), logger });
    expect((await svc.deactivate("s1", "c1", "a1")).kind).toBe("ALREADY_ERASED");
  });
});
