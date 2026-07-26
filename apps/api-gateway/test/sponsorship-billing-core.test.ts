/**
 * TODO-161A (ADR-121…127) — Sponsorship billing SAF çekirdek testleri.
 *
 * Kapsam (görev §12 "Domain"): agreement lifecycle · campaign date coverage · invalid status
 * transition · fixed fee · CPM · CPC · CPA · revenue share · bot/dedupe exclusion · budget cap ·
 * finalized immutability (durum kuralı) · refund adjustment · tax calculation · overdue ·
 * partial payment · full payment · overpayment rejection · currency mismatch.
 */
import { describe, expect, it } from "vitest";
import {
  BP_SCALE,
  clampToBudget,
  computeAdvanceAvailableMinor,
  computeChargeTotals,
  computeDueAt,
  computePricedAmountMinor,
  computeRefundAdjustmentMinor,
  computeRemainingMinor,
  computeTaxAmountMinor,
  isAdvanceAllocationValid,
  isAgreementCommerciallyEligible,
  isAgreementTerminal,
  isAgreementTransitionAllowed,
  isBudgetExceeded,
  isCampaignCoveredByAgreement,
  isChargeOverdue,
  isPerformancePriced,
  isRefundSensitive,
  isSameCurrency,
  isValidReversalAmount,
  isWithinAdvanceBalance,
  isWithinRemaining,
  mapIneligibilityToActivationError,
  resolveChargeDisplayStatus,
  resolveChargeStatus,
  resolveCommercialIneligibility,
  validatePricingTerms,
  type BillableMetrics,
  type PricingTerms,
} from "../src/sponsorship/billing-core.js";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function metrics(over: Partial<BillableMetrics> = {}): BillableMetrics {
  return {
    billableImpressions: 0,
    billableClicks: 0,
    attributedOrders: 0,
    netRevenueMinor: 0,
    ...over,
  };
}

function terms(over: Partial<PricingTerms>): PricingTerms {
  return {
    pricingModel: "FIXED_FEE",
    agreedAmountMinor: null,
    unitPriceMinor: null,
    revenueSharePercentBp: null,
    ...over,
  };
}

// ───────────────────────────── Ücretlendirme modelleri ─────────────────────────────

describe("computePricedAmountMinor", () => {
  it("FIXED_FEE: metrikten BAĞIMSIZ, anlaşılan bedeli döner", () => {
    const t = terms({ pricingModel: "FIXED_FEE", agreedAmountMinor: 500_00 });
    expect(computePricedAmountMinor(t, metrics())).toBe(500_00);
    // Metrik değişse de bedel sabit.
    expect(computePricedAmountMinor(t, metrics({ billableClicks: 9999 }))).toBe(500_00);
  });

  it("CPM: bin gösterim başına ücretlendirir", () => {
    const t = terms({ pricingModel: "CPM", unitPriceMinor: 40_00 });
    expect(computePricedAmountMinor(t, metrics({ billableImpressions: 1000 }))).toBe(40_00);
    expect(computePricedAmountMinor(t, metrics({ billableImpressions: 2500 }))).toBe(100_00);
    // Kısmi bin → yuvarlanır (12_345/1000 × 4000 = 49_380).
    expect(computePricedAmountMinor(t, metrics({ billableImpressions: 12_345 }))).toBe(49_380);
  });

  it("CPC: tıklama başına ücretlendirir", () => {
    const t = terms({ pricingModel: "CPC", unitPriceMinor: 2_50 });
    expect(computePricedAmountMinor(t, metrics({ billableClicks: 120 }))).toBe(30_000);
    expect(computePricedAmountMinor(t, metrics({ billableClicks: 0 }))).toBe(0);
  });

  it("CPA: atfedilen sipariş başına ücretlendirir", () => {
    const t = terms({ pricingModel: "CPA", unitPriceMinor: 15_00 });
    expect(computePricedAmountMinor(t, metrics({ attributedOrders: 7 }))).toBe(105_00);
  });

  it("REVENUE_SHARE: NET gelirin yüzdesidir", () => {
    const t = terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: 1500 }); // %15
    expect(computePricedAmountMinor(t, metrics({ netRevenueMinor: 10_000_00 }))).toBe(1_500_00);
  });

  it("REVENUE_SHARE: negatif net gelirde 0'a kırpılır — sponsora BORÇLANILMAZ", () => {
    const t = terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: 1500 });
    expect(computePricedAmountMinor(t, metrics({ netRevenueMinor: -5_000_00 }))).toBe(0);
  });

  it("eksik fiyat parametresi 0 döner (yazma tarafı zaten engeller)", () => {
    expect(computePricedAmountMinor(terms({ pricingModel: "CPC" }), metrics({ billableClicks: 10 }))).toBe(0);
  });

  it("bot/duplicate event ücretlendirmeye GİRMEZ — yalnız billable* alanları sayılır", () => {
    const t = terms({ pricingModel: "CPC", unitPriceMinor: 1_00 });
    // 100 ham tıklamanın yalnız 30'u billable ise, ücret 30 üzerindendir.
    expect(computePricedAmountMinor(t, metrics({ billableClicks: 30 }))).toBe(30_00);
  });
});

describe("validatePricingTerms", () => {
  it("her model kendi zorunlu parametresini ister", () => {
    expect(validatePricingTerms(terms({ pricingModel: "FIXED_FEE", agreedAmountMinor: 1 })).ok).toBe(true);
    expect(validatePricingTerms(terms({ pricingModel: "FIXED_FEE" })).ok).toBe(false);
    expect(validatePricingTerms(terms({ pricingModel: "CPM", unitPriceMinor: 1 })).ok).toBe(true);
    expect(validatePricingTerms(terms({ pricingModel: "CPC" })).ok).toBe(false);
    expect(validatePricingTerms(terms({ pricingModel: "CPA", unitPriceMinor: 0 })).ok).toBe(false);
  });

  it("REVENUE_SHARE oranı (0, 10000] aralığında olmalıdır", () => {
    expect(validatePricingTerms(terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: 1 })).ok).toBe(true);
    expect(validatePricingTerms(terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: BP_SCALE })).ok).toBe(true);
    expect(validatePricingTerms(terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: 0 })).ok).toBe(false);
    expect(
      validatePricingTerms(terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: BP_SCALE + 1 })).ok,
    ).toBe(false);
  });
});

describe("model sınıflandırması", () => {
  it("FIXED_FEE performansa dayanmaz, diğerleri dayanır", () => {
    expect(isPerformancePriced("FIXED_FEE")).toBe(false);
    expect(isPerformancePriced("CPM")).toBe(true);
  });

  it("iadeden yalnız CPA ve REVENUE_SHARE etkilenir", () => {
    expect(isRefundSensitive("CPA")).toBe(true);
    expect(isRefundSensitive("REVENUE_SHARE")).toBe(true);
    expect(isRefundSensitive("CPM")).toBe(false);
    expect(isRefundSensitive("CPC")).toBe(false);
    expect(isRefundSensitive("FIXED_FEE")).toBe(false);
  });
});

// ───────────────────────────── Vergi + para birimi ─────────────────────────────

describe("vergi hesabı", () => {
  it("KDV matrah üzerinden hesaplanır (%20)", () => {
    expect(computeTaxAmountMinor(1_000_00, 2000)).toBe(200_00);
  });

  it("%0 vergi → vergi yok", () => {
    expect(computeTaxAmountMinor(1_000_00, 0)).toBe(0);
  });

  it("toplam = matrah + vergi", () => {
    expect(computeChargeTotals(1_000_00, 2000)).toEqual({
      subtotalMinor: 1_000_00,
      taxAmountMinor: 200_00,
      totalAmountMinor: 1_200_00,
    });
  });

  it("negatif matrah (ADJUSTMENT) vergiyi de geri alır", () => {
    expect(computeChargeTotals(-500_00, 2000)).toEqual({
      subtotalMinor: -500_00,
      taxAmountMinor: -100_00,
      totalAmountMinor: -600_00,
    });
  });
});

describe("currency mismatch", () => {
  it("aynı kod (case/boşluk toleranslı) eşleşir", () => {
    expect(isSameCurrency("TRY", "try")).toBe(true);
    expect(isSameCurrency(" TRY ", "TRY")).toBe(true);
  });

  it("farklı para birimi eşleşmez", () => {
    expect(isSameCurrency("TRY", "USD")).toBe(false);
  });
});

// ───────────────────────────── Bakiye / tahsilat ─────────────────────────────

describe("kalan bakiye ve tahsilat guard'ı", () => {
  it("kalan = toplam − tahsil edilen, negatife düşmez", () => {
    expect(computeRemainingMinor(1_200_00, 0)).toBe(1_200_00);
    expect(computeRemainingMinor(1_200_00, 500_00)).toBe(700_00);
    expect(computeRemainingMinor(1_200_00, 1_500_00)).toBe(0);
  });

  it("kısmi tahsilat kabul edilir", () => {
    expect(isWithinRemaining(500_00, 1_200_00)).toBe(true);
  });

  it("tam tahsilat kabul edilir", () => {
    expect(isWithinRemaining(1_200_00, 1_200_00)).toBe(true);
  });

  it("AŞIRI tahsilat reddedilir", () => {
    expect(isWithinRemaining(1_200_01, 1_200_00)).toBe(false);
  });

  it("kalan 0 iken hiçbir tahsilat kabul edilmez", () => {
    expect(isWithinRemaining(1, 0)).toBe(false);
  });

  it("sıfır/negatif tutar reddedilir", () => {
    expect(isWithinRemaining(0, 1_000_00)).toBe(false);
    expect(isWithinRemaining(-100, 1_000_00)).toBe(false);
  });
});

describe("resolveChargeStatus", () => {
  it("ödeme yoksa ISSUED kalır", () => {
    expect(resolveChargeStatus("ISSUED", 1_000_00, 0)).toBe("ISSUED");
  });

  it("kısmi ödeme → PARTIALLY_PAID", () => {
    expect(resolveChargeStatus("ISSUED", 1_000_00, 400_00)).toBe("PARTIALLY_PAID");
  });

  it("tam ödeme → PAID", () => {
    expect(resolveChargeStatus("PARTIALLY_PAID", 1_000_00, 1_000_00)).toBe("PAID");
  });

  it("ters kayıt sonrası PAID'den geri düşer", () => {
    // 1000 ödendi (PAID), sonra ters kayıt → toplam 0 → yeniden ISSUED.
    expect(resolveChargeStatus("PAID", 1_000_00, 0)).toBe("ISSUED");
  });

  it("DRAFT ve CANCELLED tahsilattan ETKİLENMEZ", () => {
    expect(resolveChargeStatus("DRAFT", 1_000_00, 1_000_00)).toBe("DRAFT");
    expect(resolveChargeStatus("CANCELLED", 1_000_00, 1_000_00)).toBe("CANCELLED");
  });
});

describe("ödeme ters kaydı", () => {
  it("yalnız tam ters tutar geçerlidir", () => {
    expect(isValidReversalAmount(500_00, -500_00)).toBe(true);
    expect(isValidReversalAmount(500_00, -400_00)).toBe(false);
    expect(isValidReversalAmount(500_00, 500_00)).toBe(false);
  });
});

// ───────────────────────────── Vade ─────────────────────────────

describe("vade aşımı (türetilmiş OVERDUE)", () => {
  const past = new Date("2026-07-01T00:00:00.000Z");
  const future = new Date("2026-08-01T00:00:00.000Z");

  it("vadesi geçmiş + kalanı olan açık tahakkuk overdue'dur", () => {
    expect(isChargeOverdue("ISSUED", past, 1_000_00, NOW)).toBe(true);
    expect(isChargeOverdue("PARTIALLY_PAID", past, 600_00, NOW)).toBe(true);
  });

  it("vadesi gelmemişse overdue DEĞİLDİR", () => {
    expect(isChargeOverdue("ISSUED", future, 1_000_00, NOW)).toBe(false);
  });

  it("kalanı olmayan tahakkuk overdue DEĞİLDİR", () => {
    expect(isChargeOverdue("ISSUED", past, 0, NOW)).toBe(false);
  });

  it("PAID / DRAFT / CANCELLED asla overdue OLMAZ", () => {
    expect(isChargeOverdue("PAID", past, 0, NOW)).toBe(false);
    expect(isChargeOverdue("DRAFT", past, 1_000_00, NOW)).toBe(false);
    expect(isChargeOverdue("CANCELLED", past, 1_000_00, NOW)).toBe(false);
  });

  it("displayStatus overdue'yu gösterir, kalıcı durumu değiştirmez", () => {
    expect(resolveChargeDisplayStatus("ISSUED", past, 1_000_00, NOW)).toBe("OVERDUE");
    expect(resolveChargeDisplayStatus("ISSUED", future, 1_000_00, NOW)).toBe("ISSUED");
  });

  it("vade = düzenlenme + gün", () => {
    expect(computeDueAt(new Date("2026-07-01T00:00:00.000Z"), 30).toISOString()).toBe(
      "2026-07-31T00:00:00.000Z",
    );
    expect(computeDueAt(new Date("2026-07-01T00:00:00.000Z"), 0).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });
});

// ───────────────────────────── Bütçe tavanı ─────────────────────────────

describe("bütçe tavanı", () => {
  it("limit yoksa asla aşılmaz", () => {
    expect(isBudgetExceeded(null, 999_999_00)).toBe(false);
  });

  it("kümülatif matrah limite ulaşınca aşılmış sayılır", () => {
    expect(isBudgetExceeded(1_000_00, 999_99)).toBe(false);
    expect(isBudgetExceeded(1_000_00, 1_000_00)).toBe(true);
    expect(isBudgetExceeded(1_000_00, 1_500_00)).toBe(true);
  });

  it("dönem bedeli kalan bütçeye KIRPILIR", () => {
    expect(clampToBudget(1_000_00, 800_00, 500_00)).toBe(200_00);
    expect(clampToBudget(1_000_00, 1_000_00, 500_00)).toBe(0);
    expect(clampToBudget(null, 800_00, 500_00)).toBe(500_00);
    // Limit altında kalan dönem kırpılmaz.
    expect(clampToBudget(1_000_00, 100_00, 300_00)).toBe(300_00);
  });
});

// ───────────────────────────── Anlaşma yaşam döngüsü ─────────────────────────────

describe("anlaşma durum geçişleri", () => {
  it("geçerli ileri geçişlere izin verir", () => {
    expect(isAgreementTransitionAllowed("DRAFT", "PENDING_APPROVAL")).toBe(true);
    expect(isAgreementTransitionAllowed("PENDING_APPROVAL", "ACTIVE")).toBe(true);
    expect(isAgreementTransitionAllowed("ACTIVE", "SUSPENDED")).toBe(true);
    expect(isAgreementTransitionAllowed("SUSPENDED", "ACTIVE")).toBe(true);
    expect(isAgreementTransitionAllowed("ACTIVE", "COMPLETED")).toBe(true);
  });

  it("aynı duruma geçiş no-op olarak kabul edilir", () => {
    expect(isAgreementTransitionAllowed("ACTIVE", "ACTIVE")).toBe(true);
  });

  it("GEÇERSİZ geçişleri reddeder", () => {
    expect(isAgreementTransitionAllowed("DRAFT", "SUSPENDED")).toBe(false);
    expect(isAgreementTransitionAllowed("DRAFT", "COMPLETED")).toBe(false);
    expect(isAgreementTransitionAllowed("COMPLETED", "ACTIVE")).toBe(false);
    expect(isAgreementTransitionAllowed("CANCELLED", "ACTIVE")).toBe(false);
    expect(isAgreementTransitionAllowed("CANCELLED", "DRAFT")).toBe(false);
  });

  it("COMPLETED ve CANCELLED terminaldir", () => {
    expect(isAgreementTerminal("COMPLETED")).toBe(true);
    expect(isAgreementTerminal("CANCELLED")).toBe(true);
    expect(isAgreementTerminal("ACTIVE")).toBe(false);
  });
});

describe("kampanya tarih kapsaması", () => {
  const agreement = {
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-31T00:00:00.000Z"),
  };

  it("tamamen kapsanan kampanya kabul edilir", () => {
    expect(
      isCampaignCoveredByAgreement(agreement, {
        startsAt: new Date("2026-07-05T00:00:00.000Z"),
        endsAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("sınırda eşitlik kabul edilir", () => {
    expect(isCampaignCoveredByAgreement(agreement, { startsAt: agreement.startsAt, endsAt: agreement.endsAt })).toBe(
      true,
    );
  });

  it("erken başlayan kampanya reddedilir", () => {
    expect(
      isCampaignCoveredByAgreement(agreement, {
        startsAt: new Date("2026-06-30T00:00:00.000Z"),
        endsAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("geç biten kampanya reddedilir", () => {
    expect(
      isCampaignCoveredByAgreement(agreement, {
        startsAt: new Date("2026-07-05T00:00:00.000Z"),
        endsAt: new Date("2026-08-05T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("açık uçlu (süresiz) kampanya kapsanamaz", () => {
    expect(isCampaignCoveredByAgreement(agreement, { startsAt: null, endsAt: null })).toBe(false);
    expect(
      isCampaignCoveredByAgreement(agreement, { startsAt: new Date("2026-07-05T00:00:00.000Z"), endsAt: null }),
    ).toBe(false);
  });
});

// ───────────────────────────── Ticari teslim uygunluğu ─────────────────────────────

describe("ticari teslim uygunluğu (ADR-124)", () => {
  const base = {
    status: "ACTIVE" as const,
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-08-01T00:00:00.000Z"),
    budgetExhaustedAt: null,
    hasOverdueCharge: false,
  };

  it("geçerli aktif anlaşma uygundur", () => {
    expect(resolveCommercialIneligibility(base, NOW)).toBeNull();
    expect(isAgreementCommerciallyEligible(base, NOW)).toBe(true);
  });

  it("anlaşma yoksa uygun DEĞİLDİR", () => {
    expect(resolveCommercialIneligibility(null, NOW)).toBe("NO_AGREEMENT");
  });

  it("aktif olmayan anlaşma uygun DEĞİLDİR", () => {
    expect(resolveCommercialIneligibility({ ...base, status: "DRAFT" }, NOW)).toBe("AGREEMENT_NOT_ACTIVE");
    expect(resolveCommercialIneligibility({ ...base, status: "SUSPENDED" }, NOW)).toBe("AGREEMENT_NOT_ACTIVE");
    expect(resolveCommercialIneligibility({ ...base, status: "CANCELLED" }, NOW)).toBe("AGREEMENT_NOT_ACTIVE");
  });

  it("pencere dışındaki anlaşma uygun DEĞİLDİR", () => {
    expect(
      resolveCommercialIneligibility({ ...base, startsAt: new Date("2026-09-01T00:00:00.000Z") }, NOW),
    ).toBe("AGREEMENT_WINDOW");
    expect(resolveCommercialIneligibility({ ...base, endsAt: new Date("2026-07-01T00:00:00.000Z") }, NOW)).toBe(
      "AGREEMENT_WINDOW",
    );
  });

  it("bütçesi tükenmiş anlaşma uygun DEĞİLDİR", () => {
    expect(resolveCommercialIneligibility({ ...base, budgetExhaustedAt: NOW }, NOW)).toBe("BUDGET_EXHAUSTED");
  });

  it("vadesi geçmiş tahakkuku olan anlaşma uygun DEĞİLDİR", () => {
    expect(resolveCommercialIneligibility({ ...base, hasOverdueCharge: true }, NOW)).toBe("OVERDUE_CHARGE");
  });
});

// ───────────────────────────── İade düzeltmesi ─────────────────────────────

describe("refund adjustment", () => {
  it("CPA: iade sonrası azalan sipariş sayısı NEGATİF düzeltme üretir", () => {
    const adj = computeRefundAdjustmentMinor({
      terms: terms({ pricingModel: "CPA", unitPriceMinor: 15_00 }),
      settledMetrics: metrics({ attributedOrders: 10 }),
      currentMetrics: metrics({ attributedOrders: 8 }),
    });
    expect(adj).toBe(-30_00); // 2 sipariş iade × 15.00
  });

  it("REVENUE_SHARE: iade net geliri düşürür → negatif düzeltme", () => {
    const adj = computeRefundAdjustmentMinor({
      terms: terms({ pricingModel: "REVENUE_SHARE", revenueSharePercentBp: 1500 }),
      settledMetrics: metrics({ netRevenueMinor: 10_000_00 }),
      currentMetrics: metrics({ netRevenueMinor: 6_000_00 }),
    });
    expect(adj).toBe(-600_00); // (6000−10000) × %15
  });

  it("FIXED_FEE / CPM / CPC iadeden ETKİLENMEZ → düzeltme 0", () => {
    for (const t of [
      terms({ pricingModel: "FIXED_FEE", agreedAmountMinor: 500_00 }),
      terms({ pricingModel: "CPM", unitPriceMinor: 40_00 }),
      terms({ pricingModel: "CPC", unitPriceMinor: 2_50 }),
    ]) {
      expect(
        computeRefundAdjustmentMinor({
          terms: t,
          settledMetrics: metrics({ billableImpressions: 10_000, billableClicks: 500, netRevenueMinor: 10_000_00 }),
          currentMetrics: metrics({ billableImpressions: 10_000, billableClicks: 500, netRevenueMinor: 1_000_00 }),
        }),
      ).toBe(0);
    }
  });

  it("değişmemiş metrik düzeltme ÜRETMEZ (idempotent tekrar çağrı güvenli)", () => {
    expect(
      computeRefundAdjustmentMinor({
        terms: terms({ pricingModel: "CPA", unitPriceMinor: 15_00 }),
        settledMetrics: metrics({ attributedOrders: 10 }),
        currentMetrics: metrics({ attributedOrders: 10 }),
      }),
    ).toBe(0);
  });

  it("sonradan ARTAN metrik geriye dönük EK BORÇ yazmaz (0'a kırpılır)", () => {
    expect(
      computeRefundAdjustmentMinor({
        terms: terms({ pricingModel: "CPA", unitPriceMinor: 15_00 }),
        settledMetrics: metrics({ attributedOrders: 10 }),
        currentMetrics: metrics({ attributedOrders: 14 }),
      }),
    ).toBe(0);
  });
});

// ───────────────────────────── Avans + mahsup defteri (ADR-129) ─────────────────────────────
// TODO-161A.2 — birleşik ticari akışın avans/mahsup çekirdeği.

describe("computeAdvanceAvailableMinor", () => {
  it("kullanılabilir = avans − mahsup", () => {
    expect(computeAdvanceAvailableMinor(30_000, 0)).toBe(30_000);
    expect(computeAdvanceAvailableMinor(30_000, 10_000)).toBe(20_000);
    expect(computeAdvanceAvailableMinor(30_000, 30_000)).toBe(0);
  });

  it("aşırı mahsupta NEGATİFE düşmez (0'a kırpılır)", () => {
    // Ters kayıtların ardından teorik olarak mahsup > avans görünürse bile bakiye negatif olmaz.
    expect(computeAdvanceAvailableMinor(30_000, 45_000)).toBe(0);
  });
});

describe("isWithinAdvanceBalance", () => {
  it("pozitif + kalan avansı aşmayan mahsup kabul edilir", () => {
    expect(isWithinAdvanceBalance(10_000, 30_000)).toBe(true);
    expect(isWithinAdvanceBalance(30_000, 30_000)).toBe(true);
  });

  it("bakiyeyi aşan mahsup reddedilir", () => {
    expect(isWithinAdvanceBalance(30_001, 30_000)).toBe(false);
  });

  it("bakiye 0 iken hiçbir mahsup kabul edilmez", () => {
    expect(isWithinAdvanceBalance(1, 0)).toBe(false);
  });

  it("sıfır/negatif tutar reddedilir", () => {
    expect(isWithinAdvanceBalance(0, 30_000)).toBe(false);
    expect(isWithinAdvanceBalance(-100, 30_000)).toBe(false);
  });
});

describe("isAdvanceAllocationValid (çift-taraflı tavan)", () => {
  it("hem avans bakiyesini hem tahakkuk kalanını aşmayan mahsup geçerlidir", () => {
    expect(isAdvanceAllocationValid(20_000, 30_000, 45_000)).toBe(true);
    // Sınırda: her iki tavana da tam eşit.
    expect(isAdvanceAllocationValid(30_000, 30_000, 30_000)).toBe(true);
  });

  it("avans bakiyesini aşarsa reddedilir", () => {
    expect(isAdvanceAllocationValid(40_000, 30_000, 75_000)).toBe(false);
  });

  it("tahakkuk kalanını aşarsa reddedilir", () => {
    expect(isAdvanceAllocationValid(50_000, 60_000, 45_000)).toBe(false);
  });

  it("iki tavandan biri 0 ise reddedilir", () => {
    expect(isAdvanceAllocationValid(10_000, 0, 45_000)).toBe(false);
    expect(isAdvanceAllocationValid(10_000, 30_000, 0)).toBe(false);
  });

  it("sıfır/negatif tutar reddedilir", () => {
    expect(isAdvanceAllocationValid(0, 30_000, 45_000)).toBe(false);
    expect(isAdvanceAllocationValid(-1, 30_000, 45_000)).toBe(false);
  });
});

// ───────────────────────────── Aktivasyon guard eşlemesi (ADR-128) ─────────────────────────────

describe("mapIneligibilityToActivationError", () => {
  it("her teslim uygunsuzluk gerekçesini yazma-tarafı aktivasyon hatasına çevirir", () => {
    expect(mapIneligibilityToActivationError("NO_AGREEMENT")).toBe("AGREEMENT_REQUIRED");
    expect(mapIneligibilityToActivationError("AGREEMENT_NOT_ACTIVE")).toBe("AGREEMENT_NOT_ACTIVE");
    expect(mapIneligibilityToActivationError("AGREEMENT_WINDOW")).toBe("AGREEMENT_DATE_MISMATCH");
    expect(mapIneligibilityToActivationError("BUDGET_EXHAUSTED")).toBe("AGREEMENT_ALLOCATION_EXCEEDED");
    expect(mapIneligibilityToActivationError("OVERDUE_CHARGE")).toBe("AGREEMENT_OVERDUE");
  });
});
