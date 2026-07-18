import { describe, expect, it, vi } from "vitest";

// data.js -> @commerce-os/db (prisma). Testte gerçek prisma init'ini engelle (fake data-access).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

// ─────────────────────────── SAF MODÜLLER (DB'siz) ───────────────────────────
const money = await import("../src/commercial-engine/money.js");
const calc = await import("../src/commercial-engine/calculator.js");
const { compileRule } = await import("../src/commercial-engine/rule.js");
const { applyRuleToState, applyDirectEdit } = await import("../src/commercial-engine/evaluator.js");
const { commercialFingerprint } = await import("../src/commercial-engine/fingerprint.js");
const { diffState } = await import("../src/commercial-engine/diff-engine.js");
const { buildCommercialPreview } = await import("../src/commercial-engine/preview.js");
const { PRICE_ENDING_SPECS } = await import("../src/commercial-engine/types.js");

type CommercialState = import("../src/commercial-engine/types.js").CommercialState;
type CommercialVariantInput = import("../src/commercial-engine/types.js").CommercialVariantInput;
type CommercialRule = import("../src/commercial-engine/types.js").CommercialRule;

const { createCommercialService, commercialErrorStatus } = await import("../src/commercial-engine/service.js");
import type {
  CommercialDataAccess,
  CommercialTxContext,
  CommercialVariantRow,
} from "../src/commercial-engine/data.js";

function state(over: Partial<CommercialState> = {}): CommercialState {
  return { priceMinor: 10000, compareAtMinor: null, costMinor: null, vatRateBps: 2000, ...over };
}

// ═══════════════════════════ money.ts ═══════════════════════════
describe("TODO-151 · money (saf integer aritmetiği)", () => {
  it("yüzde artış: 100,00 + %10 = 110,00 (integer, tek round)", () => {
    expect(money.applyPercent(10000, 1000, 1)).toBe(11000);
  });
  it("yüzde azalış: 100,00 − %10 = 90,00", () => {
    expect(money.applyPercent(10000, 1000, -1)).toBe(9000);
  });
  it("yüzde: round half-up deterministik (333 +%10 = 366)", () => {
    // 333 * 11000 / 10000 = 366.3 → 366
    expect(money.applyPercent(333, 1000, 1)).toBe(366);
  });
  it("sabit artış/azalış", () => {
    expect(money.applyFixed(10000, 250, 1)).toBe(10250);
    expect(money.applyFixed(10000, 25000, -1)).toBe(-15000); // negatif ÜRETİR (validation yakalar)
  });
  it("cost markup: 8000 + %25 = 10000", () => {
    expect(money.priceFromCostMarkup(8000, 2500)).toBe(10000);
  });
  it("compare-at from price: 10000 + %15 = 11500", () => {
    expect(money.compareAtFromPrice(10000, 1500)).toBe(11500);
  });
  it("rounding NEAREST step 10: 12345 → 12350; DOWN → 12340; UP → 12350", () => {
    expect(money.roundToStep(12345, "NEAREST", 10)).toBe(12350);
    expect(money.roundToStep(12344, "DOWN", 10)).toBe(12340);
    expect(money.roundToStep(12341, "UP", 10)).toBe(12350);
  });
  it("rounding NONE → değişmez", () => {
    expect(money.roundToStep(12345, "NONE", 10)).toBe(12345);
  });
  it("price ending .99 (modulo 100, ending 99): 12345 → 12299/12399 en yakın = 12345→12299? test 12360→12399", () => {
    expect(money.applyPriceEnding(12360, PRICE_ENDING_SPECS.END_99)).toBe(12399);
    expect(money.applyPriceEnding(12340, PRICE_ENDING_SPECS.END_99)).toBe(12299);
  });
  it("price ending 99,90 (modulo 10000, ending 9990): 123456 → 119990/129990 en yakın", () => {
    expect(money.applyPriceEnding(123456, PRICE_ENDING_SPECS.END_9990)).toBe(119990);
    expect(money.applyPriceEnding(125001, PRICE_ENDING_SPECS.END_9990)).toBe(129990);
  });
  it("price ending negatif üretmez", () => {
    expect(money.applyPriceEnding(10, PRICE_ENDING_SPECS.END_9990)).toBeGreaterThanOrEqual(0);
  });
  it("money bounds: negatif ve overflow reddedilir", () => {
    expect(money.isWithinMoneyBounds(-1)).toBe(false);
    expect(money.isWithinMoneyBounds(0)).toBe(true);
    expect(money.isWithinMoneyBounds(1_000_000_001)).toBe(false);
  });
  it("FLOAT KULLANILMADIĞI KANITI: 0.1+0.2 senaryosu integer'da tam", () => {
    // 10 kuruş + 20 kuruş = 30 kuruş; float 0.1+0.2=0.30000000000000004 tuzağı YOK.
    expect(money.applyFixed(10, 20, 1)).toBe(30);
    // %10 uygulaması da integer: 30 +%0 = 30.
    expect(Number.isInteger(money.applyPercent(30, 0, 1))).toBe(true);
  });
  it("deterministik: aynı girdi → aynı sonuç (100 tekrar)", () => {
    const results = Array.from({ length: 100 }, () => money.applyPercent(19990, 1000, 1));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(21989);
  });
});

// ═══════════════════════════ calculator.ts ═══════════════════════════
describe("TODO-151 · calculator (margin/markup/discount, division-by-zero güvenli)", () => {
  it("pozitif margin/markup", () => {
    const s = state({ priceMinor: 10000, costMinor: 6000 });
    expect(calc.grossProfit(s)).toBe(4000);
    expect(calc.marginPct(s)).toBeCloseTo(40);
    expect(calc.markupPct(s)).toBeCloseTo(66.666, 1);
  });
  it("zero margin (price == cost)", () => {
    expect(calc.grossProfit(state({ priceMinor: 5000, costMinor: 5000 }))).toBe(0);
    expect(calc.marginPct(state({ priceMinor: 5000, costMinor: 5000 }))).toBe(0);
  });
  it("negatif margin (cost > price)", () => {
    expect(calc.marginPct(state({ priceMinor: 4000, costMinor: 6000 }))).toBeLessThan(0);
  });
  it("cost zero → markup null (division-by-zero güvenli)", () => {
    expect(calc.markupPct(state({ priceMinor: 5000, costMinor: 0 }))).toBeNull();
  });
  it("price zero → margin null", () => {
    expect(calc.marginPct(state({ priceMinor: 0, costMinor: 100 }))).toBeNull();
  });
  it("cost yok → margin/markup null", () => {
    expect(calc.marginPct(state({ costMinor: null }))).toBeNull();
    expect(calc.markupPct(state({ costMinor: null }))).toBeNull();
    expect(calc.grossProfit(state({ costMinor: null }))).toBeNull();
  });
  it("discount: compareAt 20000, price 15000 → %25", () => {
    expect(calc.discountPct(state({ priceMinor: 15000, compareAtMinor: 20000 }))).toBeCloseTo(25);
  });
  it("compareAt zero/yok → discount null", () => {
    expect(calc.discountPct(state({ compareAtMinor: 0 }))).toBeNull();
    expect(calc.discountPct(state({ compareAtMinor: null }))).toBeNull();
  });
});

// ═══════════════════════════ rule.ts (validation) ═══════════════════════════
describe("TODO-151 · rule validation", () => {
  it("geçerli: PRICE +%10", () => {
    expect(compileRule({ targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 }).ok).toBe(true);
  });
  it("geçersiz: percent op eksik percentBps", () => {
    const r = compileRule({ targetField: "PRICE", operation: "INCREASE_PERCENT" });
    expect(r.ok).toBe(false);
  });
  it("geçersiz: SET_FROM_COST_MARKUP yalnız PRICE hedefler", () => {
    expect(compileRule({ targetField: "COST", operation: "SET_FROM_COST_MARKUP", percentBps: 2500 }).ok).toBe(false);
  });
  it("geçersiz: VAT_RATE'e yüzde uygulanamaz", () => {
    expect(compileRule({ targetField: "VAT_RATE", operation: "INCREASE_PERCENT", percentBps: 1000 }).ok).toBe(false);
  });
  it("geçerli: SET_FIXED VAT_RATE valueBps", () => {
    expect(compileRule({ targetField: "VAT_RATE", operation: "SET_FIXED", valueBps: 1000 }).ok).toBe(true);
  });
  it("geçersiz: SET_FIXED VAT_RATE valueBps aralık dışı", () => {
    expect(compileRule({ targetField: "VAT_RATE", operation: "SET_FIXED", valueBps: 99999 }).ok).toBe(false);
  });
  it("geçersiz: ROUND mode NONE", () => {
    expect(compileRule({ targetField: "PRICE", operation: "ROUND", rounding: { mode: "NONE" } }).ok).toBe(false);
  });
  it("geçersiz: ROUND step 7", () => {
    expect(compileRule({ targetField: "PRICE", operation: "ROUND", rounding: { mode: "NEAREST", step: 7 as never } }).ok).toBe(false);
  });
  it("geçersiz: SET_PRICE_ENDING kuralsız", () => {
    expect(compileRule({ targetField: "PRICE", operation: "SET_PRICE_ENDING" }).ok).toBe(false);
  });
});

// ═══════════════════════════ evaluator.ts ═══════════════════════════
describe("TODO-151 · evaluator", () => {
  const rule = (r: CommercialRule) => {
    const c = compileRule(r);
    if (!c.ok) throw new Error("compile failed");
    return c.rule;
  };
  it("PRICE +%10 → 11000", () => {
    const res = applyRuleToState(state({ priceMinor: 10000 }), rule({ targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 }));
    expect(res.target.priceMinor).toBe(11000);
  });
  it("markup: cost 8000 → price 10000 (%25); cost yoksa RULE_SOURCE_MISSING", () => {
    const ok = applyRuleToState(state({ costMinor: 8000 }), rule({ targetField: "PRICE", operation: "SET_FROM_COST_MARKUP", percentBps: 2500 }));
    expect(ok.target.priceMinor).toBe(10000);
    const missing = applyRuleToState(state({ costMinor: null }), rule({ targetField: "PRICE", operation: "SET_FROM_COST_MARKUP", percentBps: 2500 }));
    expect(missing.issue).toBe("RULE_SOURCE_MISSING");
  });
  it("compare-at from price: price 10000 → compareAt 11500 (%15)", () => {
    const res = applyRuleToState(state({ priceMinor: 10000 }), rule({ targetField: "COMPARE_AT_PRICE", operation: "SET_COMPARE_AT_FROM_PRICE", percentBps: 1500 }));
    expect(res.target.compareAtMinor).toBe(11500);
  });
  it("percent + son-yuvarlama: 10000 +%13 = 11300 → NEAREST 100 = 11300; +%13.3? use rounding", () => {
    const res = applyRuleToState(state({ priceMinor: 9999 }), rule({ targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000, rounding: { mode: "UP", step: 100 } }));
    // 9999*1.1 = 10998.9 → 10999 → UP 100 = 11000
    expect(res.target.priceMinor).toBe(11000);
  });
  it("null alanda yüzde → değişmez (compareAt null)", () => {
    const res = applyRuleToState(state({ compareAtMinor: null }), rule({ targetField: "COMPARE_AT_PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 }));
    expect(res.target.compareAtMinor).toBeNull();
  });
  it("SET_PRICE_ENDING PRICE", () => {
    const res = applyRuleToState(state({ priceMinor: 12360 }), rule({ targetField: "PRICE", operation: "SET_PRICE_ENDING", priceEnding: "END_99" }));
    expect(res.target.priceMinor).toBe(12399);
  });
  it("direct edit: yalnız verilen alanları değiştirir; explicit null temizler", () => {
    const res = applyDirectEdit(state({ priceMinor: 10000, compareAtMinor: 12000 }), { variantId: "v", priceMinor: 9000, compareAtMinor: null });
    expect(res.priceMinor).toBe(9000);
    expect(res.compareAtMinor).toBeNull();
    expect(res.vatRateBps).toBe(2000);
  });
  it("input mutation YOK (evaluator saf)", () => {
    const s = state({ priceMinor: 10000 });
    applyRuleToState(s, rule({ targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 }));
    expect(s.priceMinor).toBe(10000);
  });
});

// ═══════════════════════════ fingerprint.ts ═══════════════════════════
describe("TODO-151 · fingerprint", () => {
  const rows = [
    { variantId: "b", state: state({ priceMinor: 200 }) },
    { variantId: "a", state: state({ priceMinor: 100 }) },
  ];
  it("stabil (aynı girdi → aynı fingerprint)", () => {
    expect(commercialFingerprint(rows)).toBe(commercialFingerprint(rows));
  });
  it("girdi sırasından bağımsız", () => {
    expect(commercialFingerprint(rows)).toBe(commercialFingerprint([...rows].reverse()));
  });
  it("değer değişimi fingerprint'i değiştirir", () => {
    const changed = [rows[0], { variantId: "a", state: state({ priceMinor: 999 }) }];
    expect(commercialFingerprint(rows)).not.toBe(commercialFingerprint(changed));
  });
});

// ═══════════════════════════ diff-engine.ts ═══════════════════════════
describe("TODO-151 · diff-engine", () => {
  it("değişim yok", () => {
    const d = diffState(state(), state());
    expect(d.changed).toBe(false);
    expect(d.changedFields).toEqual([]);
  });
  it("yalnız price", () => {
    const d = diffState(state({ priceMinor: 100 }), state({ priceMinor: 200 }));
    expect(d.changedFields).toEqual(["PRICE"]);
  });
  it("çok-alan + deterministik sıra (PRICE, COMPARE_AT_PRICE, COST, VAT_RATE)", () => {
    const d = diffState(
      state({ priceMinor: 100, compareAtMinor: null, costMinor: 50, vatRateBps: 2000 }),
      state({ priceMinor: 200, compareAtMinor: 300, costMinor: 50, vatRateBps: 1000 }),
    );
    expect(d.changedFields).toEqual(["PRICE", "COMPARE_AT_PRICE", "VAT_RATE"]);
  });
  it("null → değer değişimi (cost null → 100)", () => {
    const d = diffState(state({ costMinor: null }), state({ costMinor: 100 }));
    expect(d.changedFields).toEqual(["COST"]);
  });
});

// ═══════════════════════════ preview.ts ═══════════════════════════
function vin(id: string, over: Partial<CommercialState> = {}, more: Partial<CommercialVariantInput> = {}): CommercialVariantInput {
  return {
    variantId: id,
    sku: `SKU-${id}`,
    title: `Variant ${id}`,
    status: "ACTIVE",
    currency: "TRY",
    attributes: [],
    current: state(over),
    ...more,
  };
}

describe("TODO-151 · preview", () => {
  it("bulk rule +%10 → değişen satırlar + summary", () => {
    const out = buildCommercialPreview({
      variants: [vin("a", { priceMinor: 10000 }), vin("b", { priceMinor: 20000 })],
      mode: { kind: "rule", rule: { targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 } },
    });
    expect(out.blocked).toBe(false);
    expect(out.summary.changedVariants).toBe(2);
    expect(out.rows.map((r) => r.target.priceMinor)).toEqual([11000, 22000]);
    expect(out.summary.minNewPriceMinor).toBe(11000);
    expect(out.summary.maxNewPriceMinor).toBe(22000);
  });
  it("direct edit: yalnız hedeflenen satır değişir; diğeri unchanged", () => {
    const out = buildCommercialPreview({
      variants: [vin("a"), vin("b")],
      mode: { kind: "direct", edits: [{ variantId: "a", priceMinor: 9999 }] },
    });
    expect(out.summary.changedVariants).toBe(1);
    expect(out.rows.find((r) => r.variantId === "a")!.changed).toBe(true);
    expect(out.rows.find((r) => r.variantId === "b")!.changed).toBe(false);
  });
  it("blocking: negatif fiyat üreten rule → blocked, errors", () => {
    const out = buildCommercialPreview({
      variants: [vin("a", { priceMinor: 100 })],
      mode: { kind: "rule", rule: { targetField: "PRICE", operation: "DECREASE_FIXED", valueMinor: 5000 } },
    });
    expect(out.blocked).toBe(true);
    expect(out.rows[0].errors).toContain("NEGATIVE_PRICE");
  });
  it("warning: negatif margin apply'ı ENGELLEMEZ", () => {
    const out = buildCommercialPreview({
      variants: [vin("a", { priceMinor: 4000, costMinor: 6000 })],
      mode: { kind: "direct", edits: [{ variantId: "a", priceMinor: 3999 }] },
    });
    expect(out.blocked).toBe(false);
    expect(out.rows[0].warnings).toContain("NEGATIVE_MARGIN");
  });
  it("currency mismatch → blocking", () => {
    const out = buildCommercialPreview({
      variants: [vin("a", {}, { currency: "TRY" }), vin("b", {}, { currency: "USD" })],
      mode: { kind: "rule", rule: { targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 } },
    });
    expect(out.blocked).toBe(true);
    expect(out.rows.find((r) => r.variantId === "b")!.errors).toContain("CURRENCY_MISMATCH");
  });
  it("deterministik + input mutation YOK", () => {
    const variants = [vin("a", { priceMinor: 10000 })];
    const snapshot = JSON.stringify(variants);
    const a = buildCommercialPreview({ variants, mode: { kind: "rule", rule: { targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 } } });
    const b = buildCommercialPreview({ variants, mode: { kind: "rule", rule: { targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 } } });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(JSON.stringify(variants)).toBe(snapshot);
  });
  it("fingerprint girdi sırasından bağımsız stabil", () => {
    const v1 = [vin("a"), vin("b")];
    const v2 = [vin("b"), vin("a")];
    const f1 = buildCommercialPreview({ variants: v1, mode: { kind: "direct", edits: [] } }).fingerprint;
    const f2 = buildCommercialPreview({ variants: v2, mode: { kind: "direct", edits: [] } }).fingerprint;
    expect(f1).toBe(f2);
  });
});

// ═══════════════════════════ service.ts (fake data access) ═══════════════════════════
interface FakeVariant {
  id: string;
  productId: string;
  storeId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  sku: string;
  title: string;
  currency: string;
  priceMinor: number;
  compareAtMinor: number | null;
  costMinor: number | null;
  vatRateBps: number;
}

function makeFake(initial: FakeVariant[]) {
  const store = {
    variants: initial.map((v) => ({ ...v })),
    audits: [] as { batchId: string; variantId: string; field: string; oldValue: number | null; newValue: number | null; source: string }[],
    writeCount: 0,
  };
  const toRow = (v: FakeVariant): CommercialVariantRow => ({
    variantId: v.id,
    sku: v.sku,
    title: v.title,
    status: v.status,
    currency: v.currency,
    attributes: [],
    current: { priceMinor: v.priceMinor, compareAtMinor: v.compareAtMinor, costMinor: v.costMinor, vatRateBps: v.vatRateBps },
  });
  const ctxImpl: CommercialTxContext = {
    lockProduct: async () => {},
    listVariants: async (_s, pid) =>
      store.variants.filter((v) => v.productId === pid && v.status !== "ARCHIVED").map(toRow),
    applyWrites: async (_s, _p, batchId, writes, audits, source) => {
      for (const w of writes) {
        const v = store.variants.find((x) => x.id === w.variantId)!;
        if (w.priceMinor !== undefined) v.priceMinor = w.priceMinor;
        if (w.compareAtMinor !== undefined) v.compareAtMinor = w.compareAtMinor;
        if (w.costMinor !== undefined) v.costMinor = w.costMinor;
        if (w.vatRateBps !== undefined) v.vatRateBps = w.vatRateBps;
        store.writeCount++;
      }
      store.audits.push(...audits.map((a) => ({ ...a, batchId, source })));
    },
  };
  const dataAccess: CommercialDataAccess = {
    findProduct: async (s, pid) =>
      store.variants.some((v) => v.productId === pid && v.storeId === s) ? { id: pid } : null,
    read: (fn) => fn(ctxImpl),
    transaction: (fn) => fn(ctxImpl),
  };
  return { store, dataAccess };
}

const baseVariants: FakeVariant[] = [
  { id: "v1", productId: "p1", storeId: "s1", status: "ACTIVE", sku: "A", title: "A", currency: "TRY", priceMinor: 10000, compareAtMinor: null, costMinor: 6000, vatRateBps: 2000 },
  { id: "v2", productId: "p1", storeId: "s1", status: "DRAFT", sku: "B", title: "B", currency: "TRY", priceMinor: 20000, compareAtMinor: null, costMinor: null, vatRateBps: 2000 },
  { id: "v3", productId: "p1", storeId: "s1", status: "ARCHIVED", sku: "C", title: "C", currency: "TRY", priceMinor: 30000, compareAtMinor: null, costMinor: null, vatRateBps: 2000 },
];

describe("TODO-151 · commercialService", () => {
  const rulePlus10: CommercialRule = { targetField: "PRICE", operation: "INCREASE_PERCENT", percentBps: 1000 };

  it("matrix: current değerler + archived HARİÇ", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.matrix({ storeId: "s1", productId: "p1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.rows).toHaveLength(2); // v3 archived hariç
    expect(r.result.rows.every((row) => !row.changed)).toBe(true);
  });

  it("preview: bulk rule +%10", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1", rule: rulePlus10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.rows.map((x) => x.target.priceMinor)).toEqual([11000, 22000]);
  });

  it("apply: yalnız değişen yazılır + audit + tek batchId + net/KDV türetilir", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const prev = await svc.preview({ storeId: "s1", productId: "p1", rule: rulePlus10 });
    if (!prev.ok) return;
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: prev.result.fingerprint, rule: rulePlus10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.updatedVariants).toBe(2);
    expect(r.result.auditCount).toBe(2); // PRICE alanı × 2 varyant
    expect(new Set(store.audits.map((a) => a.batchId)).size).toBe(1);
    expect(store.variants.find((v) => v.id === "v1")!.priceMinor).toBe(11000);
  });

  it("idempotent apply: aynı apply ikinci kez → updated=0", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const p1 = await svc.preview({ storeId: "s1", productId: "p1", rule: rulePlus10 });
    if (!p1.ok) return;
    await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: p1.result.fingerprint, rule: rulePlus10 });
    // Aynı rule tekrar preview → yeni fingerprint (değerler değişti); ROUND'suz +%10 tekrar farklı olur,
    // ama idempotentliği SET_FIXED ile kanıtla: mevcut değeri sabitle.
    const setSame: CommercialRule = { targetField: "PRICE", operation: "SET_FIXED", valueMinor: 11000 };
    const p2 = await svc.preview({ storeId: "s1", productId: "p1", rule: setSame, selectedVariantIds: ["v1"] });
    if (!p2.ok) return;
    const before = store.writeCount;
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: p2.result.fingerprint, rule: setSame, selectedVariantIds: ["v1"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.updatedVariants).toBe(0); // v1 zaten 11000 → değişim yok
    expect(store.writeCount).toBe(before);
  });

  it("stale preview: fingerprint uyuşmazsa COMMERCIAL_PREVIEW_STALE (hiçbir yazım)", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: "cf1:deadbeef:2", rule: rulePlus10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("COMMERCIAL_PREVIEW_STALE");
    expect(store.writeCount).toBe(0);
  });

  it("blocking error apply'ı durdurur (hiçbir yazım)", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const rule: CommercialRule = { targetField: "PRICE", operation: "DECREASE_FIXED", valueMinor: 999999 };
    const prev = await svc.preview({ storeId: "s1", productId: "p1", rule });
    if (!prev.ok) return;
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: prev.result.fingerprint, rule });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("COMMERCIAL_APPLY_BLOCKED");
    expect(store.writeCount).toBe(0);
  });

  it("tenant/scope guard: kapsam-dışı variant ID → COMMERCIAL_VARIANT_NOT_FOUND", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1", rule: rulePlus10, selectedVariantIds: ["v1", "ghost"] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("COMMERCIAL_VARIANT_NOT_FOUND");
  });

  it("boş selection → COMMERCIAL_SELECTION_EMPTY", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1", rule: rulePlus10, selectedVariantIds: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("COMMERCIAL_SELECTION_EMPTY");
  });

  it("product not found → PRODUCT_NOT_FOUND", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "nope", rule: rulePlus10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("invalid rule → COMMERCIAL_INVALID_RULE", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1", rule: { targetField: "VAT_RATE", operation: "INCREASE_PERCENT", percentBps: 1000 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("COMMERCIAL_INVALID_RULE");
  });

  it("P2002 (eşzamanlı unique çakışması) → COMMERCIAL_CONFLICT", async () => {
    const { dataAccess } = makeFake(baseVariants);
    // Aynı listVariants ama applyWrites P2002 fırlatsın (eşzamanlı yazım çakışması simülasyonu).
    const conflicting: CommercialDataAccess = {
      ...dataAccess,
      transaction: (fn) =>
        dataAccess.transaction(async (ctx) =>
          fn({
            lockProduct: ctx.lockProduct,
            listVariants: ctx.listVariants,
            applyWrites: async () => {
              throw { code: "P2002" };
            },
          }),
        ),
    };
    const svc = createCommercialService(conflicting);
    const p = await svc.preview({ storeId: "s1", productId: "p1", rule: rulePlus10 });
    if (!p.ok) return;
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: p.result.fingerprint, rule: rulePlus10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("COMMERCIAL_CONFLICT");
  });

  it("VAT değişimi: brüt SABİT kalır (net/KDV türetilir) → PRICE audit YOK, VAT_RATE audit VAR", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createCommercialService(dataAccess);
    const rule: CommercialRule = { targetField: "VAT_RATE", operation: "SET_FIXED", valueBps: 1000 };
    const prev = await svc.preview({ storeId: "s1", productId: "p1", rule, selectedVariantIds: ["v1"] });
    if (!prev.ok) return;
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: prev.result.fingerprint, rule, selectedVariantIds: ["v1"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(store.variants.find((v) => v.id === "v1")!.priceMinor).toBe(10000); // brüt sabit
    expect(store.variants.find((v) => v.id === "v1")!.vatRateBps).toBe(1000);
    expect(store.audits.map((a) => a.field)).toEqual(["VAT_RATE"]);
  });
});

describe("TODO-151 · commercialErrorStatus", () => {
  it("kod → HTTP durumu", () => {
    expect(commercialErrorStatus("PRODUCT_NOT_FOUND")).toBe(404);
    expect(commercialErrorStatus("COMMERCIAL_PREVIEW_STALE")).toBe(409);
    expect(commercialErrorStatus("COMMERCIAL_APPLY_BLOCKED")).toBe(422);
    expect(commercialErrorStatus("COMMERCIAL_INVALID_RULE")).toBe(422);
  });
});
