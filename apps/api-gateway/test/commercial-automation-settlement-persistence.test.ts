/**
 * H-2 / ADR-183 — Settlement scheduler persistence adapter'ının currency-mismatch köprüsü.
 *
 * `createDraftSettlement` → `previewSettlement` reuse eder. previewSettlement karışık-para OBJESİ
 * (string DEĞİL) dönerse adapter bunu `{ ok: false, code: "REVENUE_CURRENCY_MISMATCH" }`'e çevirmeli
 * → zamanlanmış tur DRAFT açmaz (fail-closed). Aksi halde obje `{ok:true, id:undefined}` sanılırdı.
 */
import { describe, expect, it } from "vitest";
import { createPrismaSettlementSchedulerPersistence } from "../src/commercial-automation/settlement-scheduler-persistence.js";
import type { SettlementCurrencyMismatch, SettlementRow, SponsorshipData } from "../src/sponsorship/data.js";

const period = { periodStart: new Date("2026-07-01T00:00:00Z"), periodEnd: new Date("2026-08-01T00:00:00Z"), periodKind: "MONTHLY" as const };
const now = new Date("2026-08-02T00:00:00Z");
// Adapter yalnız previewSettlement kullanır; db diğer metotlar için gerekir ama bu testte çağrılmaz.
const fakeDb = {} as never;

function persistenceWith(preview: SponsorshipData["previewSettlement"]) {
  return createPrismaSettlementSchedulerPersistence(fakeDb, { previewSettlement: preview }, "Europe/Istanbul");
}

describe("settlement scheduler persistence — H-2 currency guard", () => {
  it("mismatch OBJESİ → { ok:false, code:REVENUE_CURRENCY_MISMATCH }", async () => {
    const mismatch: SettlementCurrencyMismatch = {
      currencyMismatch: true,
      code: "REVENUE_CURRENCY_MISMATCH",
      expectedCurrency: "TRY",
      foundCurrencies: ["TRY", "USD"],
      mismatchedOrderCount: 2,
    };
    const p = persistenceWith(async () => mismatch);
    const out = await p.createDraftSettlement("store_a", "ag_1", period, now);
    expect(out).toEqual({ ok: false, code: "REVENUE_CURRENCY_MISMATCH" });
  });

  it("string hata kodu → { ok:false, code }", async () => {
    const p = persistenceWith(async () => "AGREEMENT_CURRENCY_REQUIRED");
    const out = await p.createDraftSettlement("store_a", "ag_1", period, now);
    expect(out).toEqual({ ok: false, code: "AGREEMENT_CURRENCY_REQUIRED" });
  });

  it("başarı → { ok:true, settlementId }", async () => {
    const p = persistenceWith(async () => ({ id: "st_9" } as SettlementRow));
    const out = await p.createDraftSettlement("store_a", "ag_1", period, now);
    expect(out).toEqual({ ok: true, settlementId: "st_9" });
  });
});
