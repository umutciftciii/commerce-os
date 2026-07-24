/**
 * TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement — SAF çekirdek.
 *
 * Bu dosya tüm ticari matematiğin TEK OTORİTESİDİR: ücretlendirme formülleri, vergi, kalan
 * bakiye, vade, bütçe tavanı, durum geçişleri ve iade düzeltmesi. Yan etkisizdir; Prisma/
 * Fastify/IO'ya bağımlı DEĞİLDİR → tamamı birim-testlenebilir.
 *
 * Pazarlıksız kurallar:
 *  - Para her yerde tamsayı **minor unit**; oranlar **basis point** (10000 = %100). Float YOK.
 *  - İstemci tutarı ASLA otorite değildir: tahakkuk tutarı metrikten, kalan bakiye defterden
 *    türetilir (ADR-125).
 *  - Bot ve tekilleştirilmemiş event ücretlendirmeye GİRMEZ (ADR-122, §billable).
 *  - Farklı para birimleri tek hesapta TOPLANMAZ (ADR-127).
 */

import type {
  SponsorshipAgreementStatus,
  SponsorshipChargeStatus,
  SponsorshipPricingModel,
} from "@prisma/client";

/** Basis point tabanı: 10000 bp = %100. */
export const BP_SCALE = 10_000;

/** CPM tabanı: birim fiyat BİN gösterim başınadır. */
export const CPM_IMPRESSION_UNIT = 1000;

// ─────────────────────────── Ücretlendirme (ADR-122) ───────────────────────────

/**
 * Bir dönemin ücretlendirilebilir metrikleri. Bu değerler ZATEN bot/duplicate elenmiş
 * biçimde gelir (bkz. `data.ts` — `isBot = false` + DISTINCT visitor); çekirdek onları
 * yeniden filtrelemez, yalnızca paraya çevirir.
 */
export interface BillableMetrics {
  billableImpressions: number;
  billableClicks: number;
  attributedOrders: number;
  netRevenueMinor: number;
}

/** Anlaşmanın fiyat parametreleri (charge/settlement anında snapshot'lanır). */
export interface PricingTerms {
  pricingModel: SponsorshipPricingModel;
  agreedAmountMinor: number | null;
  unitPriceMinor: number | null;
  revenueSharePercentBp: number | null;
}

/**
 * Dönem bedeli (matrah, vergi HARİÇ) — ADR-122.
 *
 * | Model          | Formül                                                    |
 * |----------------|-----------------------------------------------------------|
 * | FIXED_FEE      | `agreedAmountMinor`                                       |
 * | CPM            | `round(billableImpressions / 1000 × unitPriceMinor)`      |
 * | CPC            | `billableClicks × unitPriceMinor`                         |
 * | CPA            | `attributedOrders × unitPriceMinor`                       |
 * | REVENUE_SHARE  | `round(netRevenueMinor × revenueSharePercentBp / 10000)`  |
 *
 * Eksik parametre (ör. CPC'de `unitPriceMinor = null`) → 0 döner; anlaşma doğrulaması
 * (`validatePricingTerms`) bu durumu YAZMA anında zaten engeller.
 * Negatif net gelir (iade > gross) revenue-share'de 0'a kırpılır: sponsora BORÇLANILMAZ.
 */
export function computePricedAmountMinor(terms: PricingTerms, metrics: BillableMetrics): number {
  switch (terms.pricingModel) {
    case "FIXED_FEE":
      return Math.max(0, terms.agreedAmountMinor ?? 0);
    case "CPM":
      return Math.max(
        0,
        Math.round((metrics.billableImpressions / CPM_IMPRESSION_UNIT) * (terms.unitPriceMinor ?? 0)),
      );
    case "CPC":
      return Math.max(0, metrics.billableClicks * (terms.unitPriceMinor ?? 0));
    case "CPA":
      return Math.max(0, metrics.attributedOrders * (terms.unitPriceMinor ?? 0));
    case "REVENUE_SHARE":
      return Math.max(
        0,
        Math.round((Math.max(0, metrics.netRevenueMinor) * (terms.revenueSharePercentBp ?? 0)) / BP_SCALE),
      );
    default:
      return 0;
  }
}

/**
 * Bu ücretlendirme modeli GERÇEKLEŞEN metriğe mi dayanır? FIXED_FEE hariç hepsi evet.
 * FIXED_FEE'de settlement metrikleri yalnız BİLGİ amaçlıdır (ADR-122).
 */
export function isPerformancePriced(model: SponsorshipPricingModel): boolean {
  return model !== "FIXED_FEE";
}

/**
 * Bu model iadeden ETKİLENİR mi? Yalnız CPA ve REVENUE_SHARE. Gösterim/tıklama
 * GERÇEKLEŞMİŞTİR — iade onları geri almaz (ADR-123).
 */
export function isRefundSensitive(model: SponsorshipPricingModel): boolean {
  return model === "CPA" || model === "REVENUE_SHARE";
}

/** Anlaşmanın fiyat parametreleri modeliyle tutarlı mı? (yazma anında zorlanır) */
export function validatePricingTerms(terms: PricingTerms): { ok: true } | { ok: false; reason: string } {
  switch (terms.pricingModel) {
    case "FIXED_FEE":
      return terms.agreedAmountMinor !== null && terms.agreedAmountMinor > 0
        ? { ok: true }
        : { ok: false, reason: "FIXED_FEE requires a positive agreedAmountMinor." };
    case "CPM":
    case "CPC":
    case "CPA":
      return terms.unitPriceMinor !== null && terms.unitPriceMinor > 0
        ? { ok: true }
        : { ok: false, reason: `${terms.pricingModel} requires a positive unitPriceMinor.` };
    case "REVENUE_SHARE":
      return terms.revenueSharePercentBp !== null &&
        terms.revenueSharePercentBp > 0 &&
        terms.revenueSharePercentBp <= BP_SCALE
        ? { ok: true }
        : { ok: false, reason: "REVENUE_SHARE requires revenueSharePercentBp in (0, 10000]." };
    default:
      return { ok: false, reason: "Unknown pricing model." };
  }
}

// ─────────────────────────── Vergi + toplam (ADR-127) ───────────────────────────

/** KDV: matrah üzerinden, `round(subtotal × taxRateBp / 10000)`. KDV-dahil varsayımı YOK. */
export function computeTaxAmountMinor(subtotalMinor: number, taxRateBp: number): number {
  return Math.round((subtotalMinor * taxRateBp) / BP_SCALE);
}

export interface ChargeTotals {
  subtotalMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
}

/**
 * Tahakkuk toplamları. `subtotalMinor` NEGATİF olabilir (ADJUSTMENT = alacak azaltıcı);
 * bu durumda vergi de negatif olur — düzeltme, verginin kendisini de geri alır.
 */
export function computeChargeTotals(subtotalMinor: number, taxRateBp: number): ChargeTotals {
  const taxAmountMinor = computeTaxAmountMinor(subtotalMinor, taxRateBp);
  return { subtotalMinor, taxAmountMinor, totalAmountMinor: subtotalMinor + taxAmountMinor };
}

/**
 * Farklı para birimleri tek hesapta toplanamaz (ADR-127). Karşılaştırma büyük/küçük harf
 * duyarsız + trim'lidir (veri girişi toleransı), ama farklı kod → false.
 */
export function isSameCurrency(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

// ─────────────────────── Tahsilat / bakiye / vade (ADR-125) ───────────────────────

/**
 * Kalan bakiye = toplam − tahsil edilen. `paidMinor` APPEND-ONLY defterin TOPLAMIDIR ve
 * ters kayıtlar (negatif satırlar) zaten bu toplamın içindedir. Negatife düşmez.
 */
export function computeRemainingMinor(totalAmountMinor: number, paidMinor: number): number {
  return Math.max(0, totalAmountMinor - paidMinor);
}

/**
 * Aşırı tahsilat guard'ı: talep edilen tutar POZİTİF olmalı ve kalan bakiyeyi AŞMAMALIDIR.
 * Kalan 0 ise (zaten ödenmiş) hiçbir tahsilat kabul edilmez.
 */
export function isWithinRemaining(requestedMinor: number, remainingMinor: number): boolean {
  return requestedMinor > 0 && requestedMinor <= remainingMinor;
}

/**
 * Ödeme sonrası KALICI tahakkuk durumu — bakiyeden TÜRETİLİR (istemci belirlemez).
 * `DRAFT` ve `CANCELLED` tahsilata kapalı olduğundan olduğu gibi korunur.
 */
export function resolveChargeStatus(
  current: SponsorshipChargeStatus,
  totalAmountMinor: number,
  paidMinor: number,
): SponsorshipChargeStatus {
  if (current === "DRAFT" || current === "CANCELLED") return current;
  if (paidMinor <= 0) return "ISSUED";
  if (paidMinor >= totalAmountMinor) return "PAID";
  return "PARTIALLY_PAID";
}

/**
 * Vade aşımı — TÜRETİLMİŞ (ADR-125): kalıcı `OVERDUE` alanı YOKTUR. Yalnız açık
 * (ISSUED/PARTIALLY_PAID) ve kalanı olan tahakkuk, vadesi geçmişse overdue'dur.
 */
export function isChargeOverdue(
  status: SponsorshipChargeStatus,
  dueAt: Date,
  remainingMinor: number,
  now: Date,
): boolean {
  if (status !== "ISSUED" && status !== "PARTIALLY_PAID") return false;
  if (remainingMinor <= 0) return false;
  return dueAt.getTime() < now.getTime();
}

/** API/UI'ya dönen görünüm durumu: kalıcı durum + türetilmiş `OVERDUE`. */
export type SponsorshipChargeDisplayStatus = SponsorshipChargeStatus | "OVERDUE";

export function resolveChargeDisplayStatus(
  status: SponsorshipChargeStatus,
  dueAt: Date,
  remainingMinor: number,
  now: Date,
): SponsorshipChargeDisplayStatus {
  return isChargeOverdue(status, dueAt, remainingMinor, now) ? "OVERDUE" : status;
}

/** Vade tarihi = düzenlenme tarihi + `paymentTermDays` gün. */
export function computeDueAt(issuedAt: Date, paymentTermDays: number): Date {
  return new Date(issuedAt.getTime() + Math.max(0, paymentTermDays) * 24 * 60 * 60 * 1000);
}

/**
 * Ters kayıt (ödeme iptali/iadesi) geçerli mi? Tutar orijinalin TAM TERSİ olmalıdır;
 * kısmi ters kayıt MVP'de yoktur (belirsizlik üretir — gerekirse yeni tahsilat kaydedilir).
 */
export function isValidReversalAmount(originalMinor: number, reversalMinor: number): boolean {
  return reversalMinor === -originalMinor && originalMinor > 0;
}

// ─────────────────────────── Bütçe tavanı (ADR-124) ───────────────────────────

/**
 * Bütçe aşıldı mı? `budgetLimitMinor` null ise limit YOKTUR (asla aşılmaz).
 * Karşılaştırma KÜMÜLATİF matrah (vergi hariç) üzerindendir — bütçe ticari bedeli
 * sınırlar, verginin kendisini değil.
 */
export function isBudgetExceeded(budgetLimitMinor: number | null, cumulativeSubtotalMinor: number): boolean {
  if (budgetLimitMinor === null) return false;
  return cumulativeSubtotalMinor >= budgetLimitMinor;
}

/**
 * Bütçe tavanına KIRPILMIŞ dönem bedeli: kümülatif matrah limiti aşacaksa yalnız
 * limite kadar olan kısım tahakkuk ettirilir (sponsordan anlaşılandan fazlası istenmez).
 */
export function clampToBudget(
  budgetLimitMinor: number | null,
  alreadyChargedSubtotalMinor: number,
  periodSubtotalMinor: number,
): number {
  if (budgetLimitMinor === null) return periodSubtotalMinor;
  const headroom = Math.max(0, budgetLimitMinor - alreadyChargedSubtotalMinor);
  return Math.min(periodSubtotalMinor, headroom);
}

// ─────────────────── Anlaşma yaşam döngüsü (ADR-122 / §4.1) ───────────────────

/**
 * İzin verilen durum geçişleri (ALLOWLIST). `COMPLETED` ve `CANCELLED` TERMINAL'dir —
 * oradan çıkış yoktur (iptal, geçmiş settlement/ödeme kayıtlarını SİLMEZ; yalnız yeni
 * teslim ve tahakkuk durur).
 */
const AGREEMENT_TRANSITIONS: Record<SponsorshipAgreementStatus, readonly SponsorshipAgreementStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "ACTIVE", "CANCELLED"],
  PENDING_APPROVAL: ["ACTIVE", "DRAFT", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "COMPLETED", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isAgreementTransitionAllowed(
  from: SponsorshipAgreementStatus,
  to: SponsorshipAgreementStatus,
): boolean {
  if (from === to) return true;
  return AGREEMENT_TRANSITIONS[from].includes(to);
}

export function isAgreementTerminal(status: SponsorshipAgreementStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export interface AgreementWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface CampaignWindow {
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Anlaşma penceresi kampanya penceresini TAMAMEN kapsıyor mu? (ADR-122)
 *
 * Kampanyanın açık ucu (`null`) SONSUZ demektir ve kapalı bir anlaşma penceresi tarafından
 * kapsanamaz → bağlama reddedilir. Bu bilinçlidir: süresiz bir kampanyanın süreli bir
 * anlaşmayla faturalandırılması sessiz bir ticari boşluk yaratırdı.
 */
export function isCampaignCoveredByAgreement(agreement: AgreementWindow, campaign: CampaignWindow): boolean {
  if (campaign.startsAt === null || campaign.endsAt === null) return false;
  return (
    campaign.startsAt.getTime() >= agreement.startsAt.getTime() &&
    campaign.endsAt.getTime() <= agreement.endsAt.getTime()
  );
}

// ─────────────────── Ticari teslim uygunluğu (ADR-124) ───────────────────

export interface CommercialEligibilityInput {
  status: SponsorshipAgreementStatus;
  startsAt: Date;
  endsAt: Date;
  budgetExhaustedAt: Date | null;
  hasOverdueCharge: boolean;
}

export type CommercialIneligibilityReason =
  | "NO_AGREEMENT"
  | "AGREEMENT_NOT_ACTIVE"
  | "AGREEMENT_WINDOW"
  | "BUDGET_EXHAUSTED"
  | "OVERDUE_CHARGE";

/**
 * `SPONSORED` kampanya TESLİM EDİLEBİLİR mi? (ADR-124)
 *
 * Bu, teslim (render) katmanındaki WHERE koşulunun SAF ikizidir — admin yazma tarafında
 * ve testlerde aynı kararı verir. `null` dönerse uygundur; aksi halde red gerekçesi döner.
 */
export function resolveCommercialIneligibility(
  agreement: CommercialEligibilityInput | null,
  now: Date,
): CommercialIneligibilityReason | null {
  if (agreement === null) return "NO_AGREEMENT";
  if (agreement.status !== "ACTIVE") return "AGREEMENT_NOT_ACTIVE";
  if (agreement.startsAt.getTime() > now.getTime()) return "AGREEMENT_WINDOW";
  if (agreement.endsAt.getTime() <= now.getTime()) return "AGREEMENT_WINDOW";
  if (agreement.budgetExhaustedAt !== null) return "BUDGET_EXHAUSTED";
  if (agreement.hasOverdueCharge) return "OVERDUE_CHARGE";
  return null;
}

export function isAgreementCommerciallyEligible(
  agreement: CommercialEligibilityInput | null,
  now: Date,
): boolean {
  return resolveCommercialIneligibility(agreement, now) === null;
}

// ─────────────────── İade düzeltmesi (ADR-123) ───────────────────

export interface RefundAdjustmentInput {
  terms: PricingTerms;
  /** FINALIZED settlement snapshot'ındaki değerler (dönem kapanışı). */
  settledMetrics: BillableMetrics;
  /** Aynı dönem için ŞU ANKİ (iadeler işlendikten sonraki) değerler. */
  currentMetrics: BillableMetrics;
}

/**
 * Dönem kapandıktan SONRA gelen iadenin tahakkuk düzeltmesi (matrah, vergi hariç).
 *
 * Dönüş NEGATİF ya da 0'dır (alacak azaltıcı): yeniden hesaplanan bedel ile daha önce
 * tahakkuk ettirilen bedelin farkı. İadeden etkilenmeyen modellerde (FIXED_FEE/CPM/CPC)
 * daima 0 → adjustment kaydı AÇILMAZ. Pozitif fark (sonradan artan metrik) BİLİNÇLİ olarak
 * 0'a kırpılır: kapanmış bir dönem geriye dönük olarak sponsora EK BORÇ yazmaz.
 */
export function computeRefundAdjustmentMinor(input: RefundAdjustmentInput): number {
  if (!isRefundSensitive(input.terms.pricingModel)) return 0;
  const settled = computePricedAmountMinor(input.terms, input.settledMetrics);
  const current = computePricedAmountMinor(input.terms, input.currentMetrics);
  return Math.min(0, current - settled);
}
