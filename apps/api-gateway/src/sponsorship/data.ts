/**
 * TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement — Prisma veri erişimi.
 *
 * Tüm sorgular `storeId` ile scope'lanır (tenant izolasyonu; cross-store erişim NOT_FOUND döner).
 * Ticari matematiğin tamamı SAF `billing-core.ts`'tedir — bu katman yalnız veri toplar, çekirdeğe
 * verir ve sonucu yazar. Defterler APPEND-ONLY: tahsilat iptali NEGATİF satırdır (ADR-125).
 *
 * Ücretlendirme metrikleri TODO-161'in mevcut event/attribution tablolarından okunur; ayrı bir
 * "billable event" boru hattı YOKTUR (analiz §0.1). Bot ve tekilleştirilmemiş event ücretlendirme
 * paydasından SQL seviyesinde dışlanır.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type {
  SponsorAccountStatus,
  SponsorshipAgreementStatus,
  SponsorshipChargeStatus,
  SponsorshipChargeType,
  SponsorshipPaymentMethod,
  SponsorshipPricingModel,
  SponsorshipSettlementPeriod,
  SponsorshipSettlementStatus,
} from "@prisma/client";
import {
  clampToBudget,
  computeAdvanceAvailableMinor,
  computeChargeTotals,
  computeDueAt,
  computePricedAmountMinor,
  computeRefundAdjustmentMinor,
  computeRemainingMinor,
  isAdvanceAllocationValid,
  isBudgetExceeded,
  isCampaignCoveredByAgreement,
  isChargeOverdue,
  isSameCurrency,
  isUsableAgreementCurrency,
  isValidReversalAmount,
  isWithinRemaining,
  normalizeCurrency,
  partitionRevenueCurrencies,
  resolveChargeStatus,
  resolveCommercialIneligibility,
  validatePricingTerms,
  type BillableMetrics,
  type CommercialIneligibilityReason,
  type CurrencyPartition,
  type PricingTerms,
} from "./billing-core.js";

type PrismaLike = typeof prisma;
type Tx = Prisma.TransactionClient;

// ── Ortak sayfalama ──────────────────────────────────────────────────────────
export interface SponsorshipListPage {
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
}

// ── Record tipleri (route serialize eder; Date'ler burada Date kalır) ─────────
export interface SponsorAccountRow {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  status: SponsorAccountStatus;
  agreementCount: number;
  activeAgreementCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorCurrencyBalance {
  currency: string;
  chargedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  /** Kullanılmamış avans = tahakkuka mahsup EDİLMEMİŞ nakit (ADR-129). Alacaktan AYRI gösterilir. */
  advanceBalanceMinor: number;
}

export interface SponsorAccountDetailRow extends SponsorAccountRow {
  taxOffice: string | null;
  taxNumber: string | null;
  billingAddress: string | null;
  notes: string | null;
  balances: SponsorCurrencyBalance[];
}

export interface AgreementRow {
  id: string;
  agreementNumber: string;
  title: string;
  status: SponsorshipAgreementStatus;
  sponsorAccountId: string;
  sponsorCompanyName: string;
  startsAt: Date;
  endsAt: Date;
  currency: string;
  pricingModel: SponsorshipPricingModel;
  settlementPeriod: SponsorshipSettlementPeriod;
  agreedAmountMinor: number | null;
  unitPriceMinor: number | null;
  revenueSharePercentBp: number | null;
  budgetLimitMinor: number | null;
  paymentTermDays: number;
  taxRateBp: number;
  campaignCount: number;
  chargedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  hasOverdueCharge: boolean;
  budgetExhausted: boolean;
  commerciallyEligible: boolean;
  ineligibilityReason: CommercialIneligibilityReason | null;
  signedAt: Date | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgreementCampaignLinkRow {
  campaignId: string;
  campaignName: string;
  placement: "HOME_SHOWCASE" | "SEARCH_RESULTS";
  campaignStatus: "ACTIVE" | "PAUSED" | "ARCHIVED";
  commercialMode: "INTERNAL_PROMOTION" | "SPONSORED";
  startsAt: Date | null;
  endsAt: Date | null;
  allocationAmountMinor: number | null;
}

export interface AgreementDetailRow extends AgreementRow {
  documentUrl: string | null;
  notes: string | null;
  campaigns: AgreementCampaignLinkRow[];
}

export interface SettlementRow {
  id: string;
  agreementId: string;
  agreementNumber: string;
  agreementTitle: string;
  sponsorCompanyName: string;
  periodKind: SponsorshipSettlementPeriod;
  periodStart: Date;
  periodEnd: Date;
  impressions: number;
  billableImpressions: number;
  clicks: number;
  billableClicks: number;
  orders: number;
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  netRevenueMinor: number;
  calculatedChargeMinor: number;
  currency: string;
  pricingModel: SponsorshipPricingModel;
  status: SponsorshipSettlementStatus;
  chargeId: string | null;
  createdAt: Date;
  finalizedAt: Date | null;
}

export interface ChargeRow {
  id: string;
  chargeNumber: string;
  agreementId: string;
  agreementNumber: string;
  sponsorAccountId: string;
  sponsorCompanyName: string;
  campaignId: string | null;
  campaignName: string | null;
  settlementId: string | null;
  chargeType: SponsorshipChargeType;
  pricingModel: SponsorshipPricingModel;
  periodStart: Date;
  periodEnd: Date;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  taxRateBp: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
  paidMinor: number;
  remainingMinor: number;
  currency: string;
  status: SponsorshipChargeStatus;
  isOverdue: boolean;
  daysOverdue: number;
  notes: string | null;
  generatedAt: Date;
  issuedAt: Date | null;
  dueAt: Date;
  createdAt: Date;
}

export interface PaymentRow {
  id: string;
  agreementId: string;
  agreementNumber: string;
  sponsorCompanyName: string;
  chargeId: string | null;
  chargeNumber: string | null;
  amountMinor: number;
  currency: string;
  method: SponsorshipPaymentMethod;
  providerReference: string | null;
  manualReference: string | null;
  paidAt: Date;
  notes: string | null;
  isReversal: boolean;
  reversalOfPaymentId: string | null;
  reversalReason: string | null;
  reversed: boolean;
  createdAt: Date;
}

export interface DashboardBreakdownRow {
  key: string;
  label: string;
  currency: string;
  chargedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  netRevenueMinor: number | null;
  profitabilityMinor: number | null;
}

/** Kullanılabilir avans (chargeId=null tahsilat) + türetilmiş bakiye (ADR-129). */
export interface AdvanceRow {
  id: string;
  agreementId: string;
  agreementNumber: string;
  sponsorCompanyName: string;
  amountMinor: number;
  allocatedMinor: number;
  availableMinor: number;
  currency: string;
  method: SponsorshipPaymentMethod;
  paidAt: Date;
  notes: string | null;
  createdAt: Date;
}

/** Avans mahsup defteri satırı (append-only). */
export interface AllocationRow {
  id: string;
  agreementId: string;
  advancePaymentId: string;
  chargeId: string;
  chargeNumber: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
}

/** Bir sponsora ait, kampanyaya bağlanabilir/uygun anlaşma (kampanya oluşturma akışı için). */
export interface EligibleAgreementRow {
  id: string;
  agreementNumber: string;
  title: string;
  status: SponsorshipAgreementStatus;
  currency: string;
  pricingModel: SponsorshipPricingModel;
  startsAt: Date;
  endsAt: Date;
  agreedAmountMinor: number | null;
  budgetLimitMinor: number | null;
  allocatedToCampaignsMinor: number;
  availableAllocationMinor: number | null;
  outstandingMinor: number;
  commerciallyEligible: boolean;
  ineligibilityReason: CommercialIneligibilityReason | null;
}

/** Kampanya ticari özeti (kampanya liste/detay ekranı — ADR-128). */
export interface CampaignCommercialSummary {
  campaignId: string;
  campaignName: string;
  commercialMode: "INTERNAL_PROMOTION" | "SPONSORED";
  agreement: {
    id: string;
    agreementNumber: string;
    title: string;
    status: SponsorshipAgreementStatus;
    sponsorAccountId: string;
    sponsorCompanyName: string;
    pricingModel: SponsorshipPricingModel;
    currency: string;
    startsAt: Date;
    endsAt: Date;
    agreedAmountMinor: number | null;
    allocationAmountMinor: number | null;
    commerciallyEligible: boolean;
    ineligibilityReason: CommercialIneligibilityReason | null;
  } | null;
  currency: string | null;
  chargedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
}

export interface DashboardResult {
  activeSponsors: number;
  totalSponsors: number;
  activeAgreements: number;
  totalAgreements: number;
  overdueChargeCount: number;
  /**
   * H-2 / ADR-185 — currency mismatch görünürlüğü (operations). Karışık-para gelir SESSİZCE
   * birleştirilmez; buradaki sayaçlar operatöre eksik/uyuşmayan finansal kapsamı gösterir.
   */
  currencyMismatch: {
    mismatchedAttributionCount: number;
    affectedCampaignCount: number;
    affectedAgreementIds: string[];
    mismatchedSettlementCount: number;
    foundForeignCurrencies: string[];
    lastDetectedAt: Date | null;
  };
  currencies: Array<{
    currency: string;
    contractedMinor: number;
    chargedMinor: number;
    collectedMinor: number;
    outstandingMinor: number;
    overdueMinor: number;
    sponsoredNetRevenueMinor: number;
  }>;
  bySponsor: DashboardBreakdownRow[];
  byAgreement: DashboardBreakdownRow[];
  byCampaign: DashboardBreakdownRow[];
  byPricingModel: DashboardBreakdownRow[];
  byDueStatus: DashboardBreakdownRow[];
}

// ── Yazma hataları (route bunları HTTP koduna çevirir) ────────────────────────
export type SponsorWriteError = "DUPLICATE_COMPANY";
export type AgreementWriteError =
  | "SPONSOR_NOT_FOUND"
  | "DUPLICATE_NUMBER"
  | "INVALID_WINDOW"
  | "INVALID_PRICING"
  | "INVALID_STATUS_TRANSITION"
  | "CURRENCY_LOCKED";
export type LinkCampaignError =
  | "AGREEMENT_NOT_FOUND"
  | "CAMPAIGN_NOT_FOUND"
  | "CAMPAIGN_ALREADY_LINKED"
  | "CAMPAIGN_WINDOW_NOT_COVERED";
export type SettlementError =
  | "AGREEMENT_NOT_FOUND"
  | "INVALID_PERIOD"
  | "PERIOD_ALREADY_FINALIZED"
  | "AGREEMENT_CURRENCY_REQUIRED"
  | "CURRENCY_MISMATCH";
/**
 * H-2 / ADR-181 — settlement dönemi birden fazla currency içerdiğinde fail-closed sonucu. String
 * hata kodlarından AYRI bir OBJE'dir → route güvenli özet detayları (`expectedCurrency`,
 * `foundCurrencies`, `mismatchedOrderCount`) döndürebilir. `currencyMismatch: true` ayırıcıdır;
 * `SettlementRow`/`ChargeRow` bu alanı taşımaz. Ham finansal payload/PII TAŞIMAZ.
 */
export interface SettlementCurrencyMismatch {
  currencyMismatch: true;
  code: "REVENUE_CURRENCY_MISMATCH";
  expectedCurrency: string;
  foundCurrencies: string[];
  mismatchedOrderCount: number;
}
export function isSettlementCurrencyMismatch(value: unknown): value is SettlementCurrencyMismatch {
  return typeof value === "object" && value !== null && (value as { currencyMismatch?: unknown }).currencyMismatch === true;
}
export type ChargeError =
  | "SETTLEMENT_NOT_FOUND"
  | "SETTLEMENT_NOT_FINALIZED"
  | "CHARGE_ALREADY_EXISTS"
  | "CHARGE_NOT_FOUND"
  | "INVALID_STATUS"
  | "SETTLEMENT_CURRENCY_MISMATCH";
export type PaymentError =
  | "CHARGE_NOT_FOUND"
  | "PAYMENT_NOT_FOUND"
  | "CHARGE_NOT_COLLECTIBLE"
  | "CURRENCY_MISMATCH"
  | "OVERPAYMENT"
  | "ALREADY_REVERSED"
  | "NOT_REVERSIBLE";
// TODO-161A.2 (ADR-128/129) yazma hataları
export type FixedFeeChargeError =
  | "AGREEMENT_NOT_FOUND"
  | "NOT_FIXED_FEE"
  | "INVALID_AMOUNT"
  | "CAMPAIGN_NOT_LINKED"
  | "AGREEMENT_ALLOCATION_EXCEEDED";
export type AdvanceError = "AGREEMENT_NOT_FOUND" | "CURRENCY_MISMATCH" | "INVALID_AMOUNT";
export type AllocationError =
  | "ADVANCE_NOT_FOUND"
  | "CHARGE_NOT_FOUND"
  | "NOT_AN_ADVANCE"
  | "CURRENCY_MISMATCH"
  | "CHARGE_NOT_COLLECTIBLE"
  | "ADVANCE_BALANCE_EXCEEDED"
  | "OVERPAYMENT"
  | "BALANCE_CHANGED";

// ── Yardımcılar ──────────────────────────────────────────────────────────────

/** Gün cinsinden gecikme (negatifse 0). */
function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * Mağaza içinde deterministik, insan-okur belge numarası üretir (`SZL-2026-00001`).
 * Transaction içinde çağrılır; yarış durumunda `@@unique` ihlali route'ta retry ile karşılanır.
 */
async function nextDocumentNumber(
  tx: Tx,
  storeId: string,
  kind: "agreement" | "charge",
  year: number,
): Promise<string> {
  const stem = `${kind === "agreement" ? "SZL" : "TAH"}-${year}-`;
  const numbers =
    kind === "agreement"
      ? (
          await tx.sponsorshipAgreement.findMany({
            where: { storeId, agreementNumber: { startsWith: stem } },
            select: { agreementNumber: true },
          })
        ).map((r) => r.agreementNumber)
      : (
          await tx.sponsorshipCharge.findMany({
            where: { storeId, chargeNumber: { startsWith: stem } },
            select: { chargeNumber: true },
          })
        ).map((r) => r.chargeNumber);
  let max = 0;
  for (const value of numbers) {
    const suffix = Number.parseInt(value.slice(stem.length), 10);
    if (Number.isFinite(suffix) && suffix > max) max = suffix;
  }
  return `${stem}${String(max + 1).padStart(5, "0")}`;
}

/** Anlaşmanın fiyat parametrelerini SAF çekirdeğin beklediği şekle çevirir. */
function toPricingTerms(a: {
  pricingModel: SponsorshipPricingModel;
  agreedAmountMinor: number | null;
  unitPriceMinor: number | null;
  revenueSharePercentBp: number | null;
}): PricingTerms {
  return {
    pricingModel: a.pricingModel,
    agreedAmountMinor: a.agreedAmountMinor,
    unitPriceMinor: a.unitPriceMinor,
    revenueSharePercentBp: a.revenueSharePercentBp,
  };
}

/**
 * Bir tahakkuğun "ödenmiş" tutarı = doğrudan tahsilatlar + o tahakkuğa yapılmış avans mahsupları
 * (ADR-129). İki defter de APPEND-ONLY olduğundan ters kayıtlar (negatif satırlar) toplamın
 * içindedir → net tutar doğrudan toplanır.
 */
function chargePaidMinor(charge: {
  payments: Array<{ amountMinor: number }>;
  advanceAllocations?: Array<{ amountMinor: number }>;
}): number {
  const direct = charge.payments.reduce((sum, p) => sum + p.amountMinor, 0);
  const allocated = (charge.advanceAllocations ?? []).reduce((sum, a) => sum + a.amountMinor, 0);
  return direct + allocated;
}

/**
 * Bir anlaşmanın tahakkuk/tahsilat özetini hesaplar. Kalan bakiye ve vade aşımı SUNUCUDA
 * türetilir (ADR-125); istemci hiçbir toplamın otoritesi değildir.
 *
 * `charges` yalnız İPTAL EDİLMEMİŞ ve TASLAK OLMAYAN tahakkukları içermelidir.
 */
function summarizeCharges(
  charges: Array<{
    status: SponsorshipChargeStatus;
    totalAmountMinor: number;
    dueAt: Date;
    payments: Array<{ amountMinor: number }>;
    // Avans mahsupları (ADR-129) — tahakkuğun "ödenmişine" doğrudan tahsilatla BİRLİKTE girer.
    // Opsiyonel: içermeyen çağrılar (yalnız doğrudan tahsilat) için 0 kabul edilir.
    advanceAllocations?: Array<{ amountMinor: number }>;
  }>,
  now: Date,
): { chargedMinor: number; paidMinor: number; outstandingMinor: number; overdueMinor: number; hasOverdue: boolean } {
  let chargedMinor = 0;
  let paidMinor = 0;
  let outstandingMinor = 0;
  let overdueMinor = 0;
  let hasOverdue = false;
  for (const charge of charges) {
    if (charge.status === "DRAFT" || charge.status === "CANCELLED") continue;
    const paid = chargePaidMinor(charge);
    const remaining = computeRemainingMinor(charge.totalAmountMinor, paid);
    chargedMinor += charge.totalAmountMinor;
    paidMinor += paid;
    outstandingMinor += remaining;
    if (isChargeOverdue(charge.status, charge.dueAt, remaining, now)) {
      overdueMinor += remaining;
      hasOverdue = true;
    }
  }
  return { chargedMinor, paidMinor, outstandingMinor, overdueMinor, hasOverdue };
}

/** Prisma `@@unique` ihlali mi? */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Bir anlaşmanın tahsilat/mahsup işlemlerini SERİLEŞTİRİR (ADR-129 §eşzamanlılık). Aynı anlaşma
 * üzerinde eşzamanlı ödeme + mahsup çift-harcamayı (aşırı tahsilat/aşırı mahsup) tetikleyebilir;
 * transaction-scope advisory lock ile guard'lar tek tek uygulanır. Farklı anlaşmalar bloklanmaz.
 */
async function lockAgreement(tx: Tx, agreementId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sponsorship-agreement:${agreementId}`}))`;
}

// ── Data-access arayüzü (route'lar buna bağımlıdır) ──────────────────────────
export interface SponsorshipData {
  // Sponsor cari
  listSponsors(
    storeId: string,
    filters: { status?: SponsorAccountStatus },
    page: SponsorshipListPage,
  ): Promise<{ items: SponsorAccountRow[]; total: number }>;
  getSponsorDetail(storeId: string, id: string, now: Date): Promise<SponsorAccountDetailRow | null>;
  createSponsor(storeId: string, input: SponsorWriteInput): Promise<SponsorAccountRow | SponsorWriteError>;
  updateSponsor(
    storeId: string,
    id: string,
    input: Partial<SponsorWriteInput>,
  ): Promise<SponsorAccountRow | null | SponsorWriteError>;

  // Anlaşma
  listAgreements(
    storeId: string,
    filters: { status?: SponsorshipAgreementStatus; sponsorAccountId?: string; pricingModel?: SponsorshipPricingModel },
    page: SponsorshipListPage,
    now: Date,
  ): Promise<{ items: AgreementRow[]; total: number }>;
  getAgreementDetail(storeId: string, id: string, now: Date): Promise<AgreementDetailRow | null>;
  createAgreement(storeId: string, input: AgreementWriteInput, now: Date): Promise<AgreementRow | AgreementWriteError>;
  updateAgreement(
    storeId: string,
    id: string,
    input: Partial<AgreementWriteInput>,
    now: Date,
  ): Promise<AgreementRow | null | AgreementWriteError>;
  linkCampaign(
    storeId: string,
    agreementId: string,
    campaignId: string,
    allocationAmountMinor: number | null,
  ): Promise<AgreementDetailRow | LinkCampaignError>;
  unlinkCampaign(storeId: string, agreementId: string, campaignId: string, now: Date): Promise<AgreementDetailRow | null>;

  /** Kampanyanın ticari uygunluğu (admin yazma guard'ı — ADR-124/128). */
  resolveCampaignEligibility(
    storeId: string,
    campaignId: string,
    now: Date,
  ): Promise<{ exempt: boolean; reason: CommercialIneligibilityReason | null }>;
  isUnpaidCampaignAllowed(storeId: string): Promise<boolean>;

  /** Bir sponsora ait, kampanyaya bağlanabilir anlaşmalar (kampanya oluşturma akışı — ADR-128). */
  listEligibleAgreements(storeId: string, sponsorAccountId: string, now: Date): Promise<EligibleAgreementRow[]>;
  /** Kampanya ticari özeti — sponsor/anlaşma/finans (kampanya liste/detay ekranı — ADR-128). */
  getCampaignCommercialSummary(storeId: string, campaignId: string, now: Date): Promise<CampaignCommercialSummary | null>;

  // Mutabakat
  previewSettlement(
    storeId: string,
    agreementId: string,
    input: { periodStart: Date; periodEnd: Date; periodKind: SponsorshipSettlementPeriod },
    now: Date,
  ): Promise<SettlementRow | SettlementError | SettlementCurrencyMismatch>;
  listSettlements(
    storeId: string,
    filters: { status?: SponsorshipSettlementStatus; agreementId?: string },
    page: SponsorshipListPage,
  ): Promise<{ items: SettlementRow[]; total: number }>;
  getSettlement(storeId: string, id: string): Promise<SettlementRow | null>;
  finalizeSettlement(
    storeId: string,
    id: string,
    now: Date,
  ): Promise<
    | SettlementRow
    | null
    | "ALREADY_FINALIZED"
    | "AGREEMENT_CURRENCY_REQUIRED"
    | "SETTLEMENT_CURRENCY_MISMATCH"
    | SettlementCurrencyMismatch
  >;
  deleteSettlement(storeId: string, id: string): Promise<"OK" | "NOT_FOUND" | "FINALIZED">;

  // Tahakkuk
  createChargeFromSettlement(
    storeId: string,
    settlementId: string,
    input: { notes: string | null; issue: boolean },
    now: Date,
  ): Promise<ChargeRow | ChargeError>;
  /** FIXED_FEE anlaşma için doğrudan (settlement'sız) tahakkuk — ADR-128 §6. */
  createFixedFeeCharge(
    storeId: string,
    agreementId: string,
    input: FixedFeeChargeInput,
    now: Date,
  ): Promise<ChargeRow | FixedFeeChargeError>;
  /** Açık (ISSUED/PARTIALLY_PAID + kalanı olan) tahakkuklar — mahsup hedefi seçimi için. */
  listOpenCharges(storeId: string, filters: { agreementId?: string }, now: Date): Promise<ChargeRow[]>;
  createRefundAdjustment(storeId: string, settlementId: string, now: Date): Promise<ChargeRow | null | ChargeError>;
  issueCharge(storeId: string, chargeId: string, issuedAt: Date, now: Date): Promise<ChargeRow | ChargeError>;
  cancelCharge(storeId: string, chargeId: string, reason: string | null, now: Date): Promise<ChargeRow | ChargeError>;
  listCharges(
    storeId: string,
    filters: ChargeListFilters,
    page: SponsorshipListPage,
    now: Date,
  ): Promise<{ items: ChargeRow[]; total: number }>;
  getCharge(storeId: string, id: string, now: Date): Promise<ChargeRow | null>;

  // Tahsilat
  recordPayment(storeId: string, chargeId: string, input: PaymentWriteInput): Promise<PaymentRow | PaymentError>;
  reversePayment(
    storeId: string,
    paymentId: string,
    reason: string | null,
    actorUserId: string,
    now: Date,
  ): Promise<PaymentRow | PaymentError>;
  listPayments(
    storeId: string,
    filters: PaymentListFilters,
    page: SponsorshipListPage,
  ): Promise<{ items: PaymentRow[]; total: number }>;

  // Avans + mahsup (ADR-129)
  /** Avans (chargeId=null tahsilat) kaydeder → kullanılabilir avans bakiyesi oluşturur. */
  createAdvance(storeId: string, agreementId: string, input: AdvanceWriteInput): Promise<PaymentRow | AdvanceError>;
  /** Kullanılabilir avansı açık bir tahakkuğa AÇIK işlemle mahsup eder (append-only defter). */
  allocateAdvance(storeId: string, input: AllocationWriteInput): Promise<AllocationRow | AllocationError>;
  /** Kullanılabilir (kalan bakiyesi olan) avanslar. */
  listAvailableAdvances(storeId: string, filters: { agreementId?: string; sponsorAccountId?: string }): Promise<AdvanceRow[]>;

  // Dashboard
  getDashboard(
    storeId: string,
    filters: { dateFrom?: Date; dateTo?: Date; sponsorAccountId?: string; agreementId?: string },
    now: Date,
  ): Promise<DashboardResult>;
}

export interface SponsorWriteInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  billingAddress?: string | null;
  status?: SponsorAccountStatus;
  notes?: string | null;
}

export interface AgreementWriteInput {
  sponsorAccountId: string;
  agreementNumber?: string;
  title: string;
  status?: SponsorshipAgreementStatus;
  startsAt: Date;
  endsAt: Date;
  currency: string;
  pricingModel: SponsorshipPricingModel;
  settlementPeriod?: SponsorshipSettlementPeriod;
  agreedAmountMinor?: number | null;
  unitPriceMinor?: number | null;
  revenueSharePercentBp?: number | null;
  budgetLimitMinor?: number | null;
  paymentTermDays?: number;
  taxRateBp?: number;
  signedAt?: Date | null;
  documentUrl?: string | null;
  notes?: string | null;
  /** Anlaşma ACTIVE'e geçirilirken onaylayan platform admin'i (denetim izi — ADR-128). */
  approvedByUserId?: string | null;
}

export interface ChargeListFilters {
  status?: SponsorshipChargeStatus;
  agreementId?: string;
  sponsorAccountId?: string;
  chargeType?: SponsorshipChargeType;
  overdueOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaymentListFilters {
  agreementId?: string;
  sponsorAccountId?: string;
  chargeId?: string;
  method?: SponsorshipPaymentMethod;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaymentWriteInput {
  amountMinor: number;
  currency: string;
  method: SponsorshipPaymentMethod;
  paidAt: Date;
  providerReference?: string | null;
  manualReference?: string | null;
  notes?: string | null;
  idempotencyKey?: string;
  recordedByUserId: string;
}

export interface FixedFeeChargeInput {
  /** Kampanyaya ayrılan tutar; null/verilmezse anlaşmanın `agreedAmountMinor`'ı kullanılır. */
  amountMinor?: number | null;
  campaignId?: string | null;
  issue: boolean;
  notes?: string | null;
}

export interface AdvanceWriteInput {
  amountMinor: number;
  currency: string;
  method: SponsorshipPaymentMethod;
  paidAt: Date;
  providerReference?: string | null;
  manualReference?: string | null;
  notes?: string | null;
  idempotencyKey?: string;
  recordedByUserId: string;
}

export interface AllocationWriteInput {
  advancePaymentId: string;
  chargeId: string;
  amountMinor: number;
  /** İyimser kilit: istemcinin gördüğü kalan bakiye; sunucudaki değişmişse `BALANCE_CHANGED`. */
  expectedRemainingMinor?: number;
  idempotencyKey?: string;
  notes?: string | null;
  recordedByUserId: string;
}

// ── Metrik toplama (TODO-161 event/attribution tablolarından; bot/dedupe dışlanır) ──

/**
 * Bir anlaşmanın bağlı kampanyalarının bir dönemdeki ücretlendirilebilir metriklerini toplar.
 *
 * - `billableImpressions`/`billableClicks`: `isBot = false` ve `(visitorIdHash, placementId)`
 *   bazında DISTINCT (dönem boyunca tekil ziyaretçi — daha muhafazakâr, sponsor lehine).
 *   `visitorIdHash IS NULL` olan event'ler DIŞLANIR.
 * - `attributedOrders`/`grossRevenueMinor`/`refundedRevenueMinor`: `OrderSponsoredAttribution`
 *   (zaten sunucu-otoriter, bot yok).
 *
 * **H-2 / ADR-181 (currency guard):** gelir/attribution toplamları YALNIZ `expectedCurrency`
 * (= agreement currency) satırlarından toplanır → snapshot revenue rakamları her zaman TEK para
 * birimi (asla karışık toplam). Dönemde beklenen dışında currency'li attribution varsa
 * `currency.hasMismatch = true` döner → çağıran (`previewSettlement`) fail-closed olur. Farklı
 * currency'ler SESSİZCE toplanmaz VE sessizce dışlanmaz (§5); tespit çağırana taşınır.
 *
 * Tüm sorgular `storeId` + kampanya kümesi + dönem ile scope'lanır (tenant izolasyonu).
 */
async function collectBillableMetrics(
  db: PrismaLike,
  storeId: string,
  campaignIds: string[],
  periodStart: Date,
  periodEnd: Date,
  expectedCurrency: string,
): Promise<{
  metrics: BillableMetrics;
  impressions: number;
  clicks: number;
  totalOrders: number;
  grossRevenueMinor: number;
  refundedRevenueMinor: number;
  currency: CurrencyPartition;
}> {
  const expected = normalizeCurrency(expectedCurrency);
  const emptyPartition: CurrencyPartition = {
    expected,
    matchedCount: 0,
    mismatchedCount: 0,
    foundCurrencies: [],
    hasMismatch: false,
  };
  if (campaignIds.length === 0) {
    return {
      metrics: { billableImpressions: 0, billableClicks: 0, attributedOrders: 0, netRevenueMinor: 0 },
      impressions: 0,
      clicks: 0,
      totalOrders: 0,
      grossRevenueMinor: 0,
      refundedRevenueMinor: 0,
      currency: emptyPartition,
    };
  }

  // Ham event sayıları (rapor için) — tüm event'ler.
  const rawCounts = await db.sponsoredProductEvent.groupBy({
    by: ["type"],
    where: {
      storeId,
      campaignId: { in: campaignIds },
      type: { in: ["IMPRESSION", "CLICK"] },
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    _count: { _all: true },
  });
  const impressions = rawCounts.find((r) => r.type === "IMPRESSION")?._count._all ?? 0;
  const clicks = rawCounts.find((r) => r.type === "CLICK")?._count._all ?? 0;

  // Ücretlendirilebilir (bot değil + tekil ziyaretçi) — DISTINCT raw sorgu.
  const billableRows = await db.$queryRaw<Array<{ type: string; c: bigint }>>(Prisma.sql`
    SELECT "type", COUNT(DISTINCT ("visitorIdHash", "placementId")) AS c
    FROM "SponsoredProductEvent"
    WHERE "storeId" = ${storeId}
      AND "campaignId" IN (${Prisma.join(campaignIds)})
      AND "type" IN ('IMPRESSION', 'CLICK')
      AND "isBot" = false
      AND "visitorIdHash" IS NOT NULL
      AND "createdAt" >= ${periodStart}
      AND "createdAt" < ${periodEnd}
    GROUP BY "type"
  `);
  const billableImpressions = Number(billableRows.find((r) => r.type === "IMPRESSION")?.c ?? 0n);
  const billableClicks = Number(billableRows.find((r) => r.type === "CLICK")?.c ?? 0n);

  // H-2: dönem+kampanya kapsamındaki attribution'ların currency HİSTOGRAMI (para toplamı DEĞİL —
  // yalnız satır sayısı). Beklenen dışı currency varsa fail-closed tetikler.
  const currencyRows = await db.orderSponsoredAttribution.groupBy({
    by: ["currency"],
    where: {
      storeId,
      campaignId: { in: campaignIds },
      attributedAt: { gte: periodStart, lt: periodEnd },
    },
    _count: { _all: true },
  });
  const currency = partitionRevenueCurrencies(
    expected,
    currencyRows.map((r) => ({ currency: r.currency, count: r._count._all })),
  );

  // Sipariş attribution (sunucu-otoriter). attributedAt dönem içinde. H-2: YALNIZ beklenen
  // currency satırları toplanır → revenue rakamları asla karışık-para. `mode: "insensitive"`
  // kanonik saklama varsayımı altında güvenli (attribution currency upper yazılır).
  const attrAgg = await db.orderSponsoredAttribution.aggregate({
    where: {
      storeId,
      campaignId: { in: campaignIds },
      attributedAt: { gte: periodStart, lt: periodEnd },
      currency: { equals: expected, mode: "insensitive" },
    },
    _count: { _all: true },
    _sum: { grossRevenueMinor: true, refundedRevenueMinor: true, netRevenueMinor: true },
  });
  const totalOrders = attrAgg._count._all;
  const grossRevenueMinor = attrAgg._sum.grossRevenueMinor ?? 0;
  const refundedRevenueMinor = attrAgg._sum.refundedRevenueMinor ?? 0;
  const netRevenueMinor = attrAgg._sum.netRevenueMinor ?? 0;

  // Ücretlendirilebilir sipariş sayısı (CPA payı): TAM iade edilmiş siparişler HARİÇ
  // (refundedRevenueMinor >= grossRevenueMinor). Kısmi iade billable KALIR. Refund adjustment
  // (ADR-123) CPA'yı böyle refund-sensitive kılar; iade sonrası sayı düşer. H-2: currency filtresi.
  const billableOrderRows = await db.$queryRaw<Array<{ c: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS c
    FROM "OrderSponsoredAttribution"
    WHERE "storeId" = ${storeId}
      AND "campaignId" IN (${Prisma.join(campaignIds)})
      AND "attributedAt" >= ${periodStart}
      AND "attributedAt" < ${periodEnd}
      AND UPPER("currency") = ${expected}
      AND "grossRevenueMinor" > "refundedRevenueMinor"
  `);
  const attributedOrders = Number(billableOrderRows[0]?.c ?? 0n);

  return {
    // metrics.attributedOrders = ücretlendirilebilir (tam-iade hariç); totalOrders = ham (rapor).
    metrics: { billableImpressions, billableClicks, attributedOrders, netRevenueMinor },
    impressions,
    clicks,
    totalOrders,
    grossRevenueMinor,
    refundedRevenueMinor,
    currency,
  };
}

/**
 * H-2 / ADR-185 — currency-mismatch tespitini AuditLog'a yazar (SYSTEM aksiyonu). Metadata güvenli
 * özet + BOUNDED order referans örneği taşır (PII/tam ödeme verisi YOK). Denetim izi, her çağırandan
 * (route + zamanlanmış worker) bağımsız server-side üretilir → görünürlük garanti. Yazma hatası
 * (audit ikincil) settlement fail-closed kararını ETKİLEMEZ.
 */
async function recordCurrencyMismatchAudit(
  db: PrismaLike,
  storeId: string,
  agreementId: string,
  partition: CurrencyPartition,
  context: { periodStart: Date; periodEnd: Date; campaignIds: string[] },
): Promise<void> {
  try {
    // Bounded (max 20) uyuşmayan order referans örneği — audit metadata (yalnız orderId, PII yok).
    const sample = await db.orderSponsoredAttribution.findMany({
      where: {
        storeId,
        campaignId: { in: context.campaignIds },
        attributedAt: { gte: context.periodStart, lt: context.periodEnd },
        NOT: { currency: { equals: partition.expected, mode: "insensitive" } },
      },
      select: { orderId: true, currency: true },
      take: 20,
    });
    await db.auditLog.create({
      data: {
        storeId,
        action: "SYSTEM",
        entityType: "SponsorshipSettlement",
        entityId: agreementId,
        metadata: {
          reason: "REVENUE_CURRENCY_MISMATCH",
          expectedCurrency: partition.expected,
          foundCurrencies: partition.foundCurrencies,
          mismatchedOrderCount: partition.mismatchedCount,
          periodStart: context.periodStart.toISOString(),
          periodEnd: context.periodEnd.toISOString(),
          sampleMismatchedOrders: sample.map((s) => ({ orderId: s.orderId, currency: normalizeCurrency(s.currency) })),
        } as Prisma.InputJsonObject,
      },
    });
  } catch {
    // Audit ikincildir; başarısızlığı fail-closed guard'ı bloke etmez.
  }
}

/** H-2 — CurrencyPartition → route/UI'ya taşınan güvenli mismatch OBJESİ (ham veri yok). */
function toSettlementCurrencyMismatch(partition: CurrencyPartition): SettlementCurrencyMismatch {
  return {
    currencyMismatch: true,
    code: "REVENUE_CURRENCY_MISMATCH",
    expectedCurrency: partition.expected,
    foundCurrencies: partition.foundCurrencies,
    mismatchedOrderCount: partition.mismatchedCount,
  };
}

/** Anlaşmaya bağlı kampanya id'leri (tenant-izole). */
async function agreementCampaignIds(db: PrismaLike, storeId: string, agreementId: string): Promise<string[]> {
  const links = await db.sponsorshipAgreementCampaign.findMany({
    where: { storeId, agreementId },
    select: { campaignId: true },
  });
  return links.map((l) => l.campaignId);
}

// ── Factory ──────────────────────────────────────────────────────────────────
export function createSponsorshipData(db: PrismaLike = prisma): SponsorshipData {
  /**
   * Bir anlaşmayı özet satırına dönüştürür: cari toplamları (charged/paid/outstanding/overdue)
   * SUNUCUDA türetir + ticari teslim uygunluğunu (ADR-124) hesaplar. `charges` yalnız o
   * anlaşmanın tahakkuklarıdır (payments dahil).
   */
  function toAgreementRow(
    a: {
      id: string;
      agreementNumber: string;
      title: string;
      status: SponsorshipAgreementStatus;
      sponsorAccountId: string;
      sponsorAccount: { companyName: string };
      startsAt: Date;
      endsAt: Date;
      currency: string;
      pricingModel: SponsorshipPricingModel;
      settlementPeriod: SponsorshipSettlementPeriod;
      agreedAmountMinor: number | null;
      unitPriceMinor: number | null;
      revenueSharePercentBp: number | null;
      budgetLimitMinor: number | null;
      paymentTermDays: number;
      taxRateBp: number;
      budgetExhaustedAt: Date | null;
      signedAt: Date | null;
      approvedAt: Date | null;
      approvedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
      _count: { campaignLinks: number };
      charges: Array<{
        status: SponsorshipChargeStatus;
        totalAmountMinor: number;
        dueAt: Date;
        payments: Array<{ amountMinor: number }>;
      }>;
    },
    now: Date,
  ): AgreementRow {
    const summary = summarizeCharges(a.charges, now);
    const reason = resolveCommercialIneligibility(
      {
        status: a.status,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        budgetExhaustedAt: a.budgetExhaustedAt,
        hasOverdueCharge: summary.hasOverdue,
      },
      now,
    );
    return {
      id: a.id,
      agreementNumber: a.agreementNumber,
      title: a.title,
      status: a.status,
      sponsorAccountId: a.sponsorAccountId,
      sponsorCompanyName: a.sponsorAccount.companyName,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      currency: a.currency,
      pricingModel: a.pricingModel,
      settlementPeriod: a.settlementPeriod,
      agreedAmountMinor: a.agreedAmountMinor,
      unitPriceMinor: a.unitPriceMinor,
      revenueSharePercentBp: a.revenueSharePercentBp,
      budgetLimitMinor: a.budgetLimitMinor,
      paymentTermDays: a.paymentTermDays,
      taxRateBp: a.taxRateBp,
      campaignCount: a._count.campaignLinks,
      chargedMinor: summary.chargedMinor,
      paidMinor: summary.paidMinor,
      outstandingMinor: summary.outstandingMinor,
      hasOverdueCharge: summary.hasOverdue,
      budgetExhausted: a.budgetExhaustedAt !== null,
      commerciallyEligible: reason === null,
      ineligibilityReason: reason,
      signedAt: a.signedAt,
      approvedAt: a.approvedAt,
      approvedByUserId: a.approvedByUserId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  const AGREEMENT_INCLUDE = {
    sponsorAccount: { select: { companyName: true } },
    _count: { select: { campaignLinks: true } },
    charges: {
      select: {
        status: true,
        totalAmountMinor: true,
        dueAt: true,
        payments: { select: { amountMinor: true } },
        advanceAllocations: { select: { amountMinor: true } },
      },
    },
  } as const;

  function toChargeRow(
    c: {
      id: string;
      chargeNumber: string;
      agreementId: string;
      agreement: { agreementNumber: string; sponsorAccountId: string; sponsorAccount: { companyName: string } };
      campaignId: string | null;
      campaign: { name: string } | null;
      settlementId: string | null;
      chargeType: SponsorshipChargeType;
      pricingModel: SponsorshipPricingModel;
      periodStart: Date;
      periodEnd: Date;
      quantity: number;
      unitPriceMinor: number;
      subtotalMinor: number;
      taxRateBp: number;
      taxAmountMinor: number;
      totalAmountMinor: number;
      currency: string;
      status: SponsorshipChargeStatus;
      notes: string | null;
      generatedAt: Date;
      issuedAt: Date | null;
      dueAt: Date;
      createdAt: Date;
      payments: Array<{ amountMinor: number }>;
      advanceAllocations?: Array<{ amountMinor: number }>;
    },
    now: Date,
  ): ChargeRow {
    const paidMinor = chargePaidMinor(c);
    const remainingMinor = computeRemainingMinor(c.totalAmountMinor, paidMinor);
    const overdue = isChargeOverdue(c.status, c.dueAt, remainingMinor, now);
    return {
      id: c.id,
      chargeNumber: c.chargeNumber,
      agreementId: c.agreementId,
      agreementNumber: c.agreement.agreementNumber,
      sponsorAccountId: c.agreement.sponsorAccountId,
      sponsorCompanyName: c.agreement.sponsorAccount.companyName,
      campaignId: c.campaignId,
      campaignName: c.campaign?.name ?? null,
      settlementId: c.settlementId,
      chargeType: c.chargeType,
      pricingModel: c.pricingModel,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      quantity: c.quantity,
      unitPriceMinor: c.unitPriceMinor,
      subtotalMinor: c.subtotalMinor,
      taxRateBp: c.taxRateBp,
      taxAmountMinor: c.taxAmountMinor,
      totalAmountMinor: c.totalAmountMinor,
      paidMinor,
      remainingMinor,
      currency: c.currency,
      status: c.status,
      isOverdue: overdue,
      daysOverdue: overdue ? daysBetween(c.dueAt, now) : 0,
      notes: c.notes,
      generatedAt: c.generatedAt,
      issuedAt: c.issuedAt,
      dueAt: c.dueAt,
      createdAt: c.createdAt,
    };
  }

  const CHARGE_INCLUDE = {
    agreement: { select: { agreementNumber: true, sponsorAccountId: true, sponsorAccount: { select: { companyName: true } } } },
    campaign: { select: { name: true } },
    payments: { select: { amountMinor: true } },
    advanceAllocations: { select: { amountMinor: true } },
  } as const;

  return {
    // ── Sponsor cari ──────────────────────────────────────────────────────────
    async listSponsors(storeId, filters, page) {
      const where: Prisma.SponsorAccountWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(page.search
          ? {
              OR: [
                { companyName: { contains: page.search, mode: "insensitive" } },
                { contactName: { contains: page.search, mode: "insensitive" } },
                { email: { contains: page.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const orderBy: Prisma.SponsorAccountOrderByWithRelationInput =
        page.sortBy === "companyName"
          ? { companyName: page.sortOrder }
          : page.sortBy === "status"
            ? { status: page.sortOrder }
            : { createdAt: page.sortOrder };
      const [rows, total] = await Promise.all([
        db.sponsorAccount.findMany({
          where,
          orderBy,
          skip: page.offset,
          take: page.limit,
          include: {
            _count: { select: { agreements: true } },
            agreements: { where: { status: "ACTIVE" }, select: { id: true } },
          },
        }),
        db.sponsorAccount.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          companyName: r.companyName,
          contactName: r.contactName,
          email: r.email,
          phone: r.phone,
          status: r.status,
          agreementCount: r._count.agreements,
          activeAgreementCount: r.agreements.length,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        total,
      };
    },

    async getSponsorDetail(storeId, id, now) {
      const r = await db.sponsorAccount.findFirst({
        where: { storeId, id },
        include: {
          _count: { select: { agreements: true } },
          agreements: {
            select: {
              status: true,
              currency: true,
              charges: {
                select: {
                  status: true,
                  totalAmountMinor: true,
                  dueAt: true,
                  payments: { select: { amountMinor: true } },
                  advanceAllocations: { select: { amountMinor: true } },
                },
              },
              // Kullanılmamış avans = anlaşmaya bağlı, tahakkuka mahsup EDİLMEMİŞ nakit.
              payments: { where: { chargeId: null }, select: { amountMinor: true } },
              advanceAllocations: { select: { amountMinor: true } },
            },
          },
        },
      });
      if (!r) return null;
      // Para birimi bazında cari (farklı currency TOPLANMAZ — ADR-127).
      const byCurrency = new Map<string, SponsorCurrencyBalance>();
      for (const ag of r.agreements) {
        const s = summarizeCharges(ag.charges, now);
        const advanceCash = ag.payments.reduce((sum, p) => sum + p.amountMinor, 0);
        const allocated = ag.advanceAllocations.reduce((sum, a) => sum + a.amountMinor, 0);
        const cur = byCurrency.get(ag.currency) ?? {
          currency: ag.currency,
          chargedMinor: 0,
          paidMinor: 0,
          outstandingMinor: 0,
          overdueMinor: 0,
          advanceBalanceMinor: 0,
        };
        cur.chargedMinor += s.chargedMinor;
        cur.paidMinor += s.paidMinor;
        cur.outstandingMinor += s.outstandingMinor;
        cur.overdueMinor += s.overdueMinor;
        cur.advanceBalanceMinor += computeAdvanceAvailableMinor(advanceCash, allocated);
        byCurrency.set(ag.currency, cur);
      }
      return {
        id: r.id,
        companyName: r.companyName,
        contactName: r.contactName,
        email: r.email,
        phone: r.phone,
        status: r.status,
        agreementCount: r._count.agreements,
        activeAgreementCount: r.agreements.filter((a) => a.status === "ACTIVE").length,
        taxOffice: r.taxOffice,
        taxNumber: r.taxNumber,
        billingAddress: r.billingAddress,
        notes: r.notes,
        balances: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    },

    async createSponsor(storeId, input) {
      try {
        const r = await db.sponsorAccount.create({
          data: {
            storeId,
            companyName: input.companyName,
            contactName: input.contactName,
            email: input.email,
            phone: input.phone ?? null,
            taxOffice: input.taxOffice ?? null,
            taxNumber: input.taxNumber ?? null,
            billingAddress: input.billingAddress ?? null,
            status: input.status ?? "ACTIVE",
            notes: input.notes ?? null,
          },
        });
        return {
          id: r.id,
          companyName: r.companyName,
          contactName: r.contactName,
          email: r.email,
          phone: r.phone,
          status: r.status,
          agreementCount: 0,
          activeAgreementCount: 0,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      } catch (error) {
        if (isUniqueViolation(error)) return "DUPLICATE_COMPANY";
        throw error;
      }
    },

    async updateSponsor(storeId, id, input) {
      const existing = await db.sponsorAccount.findFirst({ where: { storeId, id }, select: { id: true } });
      if (!existing) return null;
      try {
        await db.sponsorAccount.update({
          where: { id },
          data: {
            ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
            ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.taxOffice !== undefined ? { taxOffice: input.taxOffice } : {}),
            ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber } : {}),
            ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) return "DUPLICATE_COMPANY";
        throw error;
      }
      const r = await db.sponsorAccount.findFirstOrThrow({
        where: { id },
        include: { _count: { select: { agreements: true } }, agreements: { where: { status: "ACTIVE" }, select: { id: true } } },
      });
      return {
        id: r.id,
        companyName: r.companyName,
        contactName: r.contactName,
        email: r.email,
        phone: r.phone,
        status: r.status,
        agreementCount: r._count.agreements,
        activeAgreementCount: r.agreements.length,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    },

    // ── Anlaşma ───────────────────────────────────────────────────────────────
    async listAgreements(storeId, filters, page, now) {
      const where: Prisma.SponsorshipAgreementWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.sponsorAccountId ? { sponsorAccountId: filters.sponsorAccountId } : {}),
        ...(filters.pricingModel ? { pricingModel: filters.pricingModel } : {}),
        ...(page.search
          ? {
              OR: [
                { title: { contains: page.search, mode: "insensitive" } },
                { agreementNumber: { contains: page.search, mode: "insensitive" } },
                { sponsorAccount: { companyName: { contains: page.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const orderBy: Prisma.SponsorshipAgreementOrderByWithRelationInput =
        page.sortBy === "agreementNumber"
          ? { agreementNumber: page.sortOrder }
          : page.sortBy === "title"
            ? { title: page.sortOrder }
            : page.sortBy === "status"
              ? { status: page.sortOrder }
              : page.sortBy === "endsAt"
                ? { endsAt: page.sortOrder }
                : { createdAt: page.sortOrder };
      const [rows, total] = await Promise.all([
        db.sponsorshipAgreement.findMany({ where, orderBy, skip: page.offset, take: page.limit, include: AGREEMENT_INCLUDE }),
        db.sponsorshipAgreement.count({ where }),
      ]);
      return { items: rows.map((r) => toAgreementRow(r, now)), total };
    },

    async getAgreementDetail(storeId, id, now) {
      const r = await db.sponsorshipAgreement.findFirst({
        where: { storeId, id },
        include: {
          ...AGREEMENT_INCLUDE,
          campaignLinks: {
            include: {
              campaign: { select: { id: true, name: true, placement: true, status: true, commercialMode: true, startsAt: true, endsAt: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!r) return null;
      const base = toAgreementRow(r, now);
      return {
        ...base,
        documentUrl: r.documentUrl,
        notes: r.notes,
        campaigns: r.campaignLinks.map((l) => ({
          campaignId: l.campaignId,
          campaignName: l.campaign.name,
          placement: l.campaign.placement,
          campaignStatus: l.campaign.status,
          commercialMode: l.campaign.commercialMode,
          startsAt: l.campaign.startsAt,
          endsAt: l.campaign.endsAt,
          allocationAmountMinor: l.allocationAmountMinor,
        })),
      };
    },

    async createAgreement(storeId, input, now) {
      // Pencere + fiyat parametreleri doğrulaması (SAF çekirdek).
      if (input.endsAt.getTime() <= input.startsAt.getTime()) return "INVALID_WINDOW";
      const pricing = validatePricingTerms(toPricingTerms({
        pricingModel: input.pricingModel,
        agreedAmountMinor: input.agreedAmountMinor ?? null,
        unitPriceMinor: input.unitPriceMinor ?? null,
        revenueSharePercentBp: input.revenueSharePercentBp ?? null,
      }));
      if (!pricing.ok) return "INVALID_PRICING";

      const sponsor = await db.sponsorAccount.findFirst({ where: { storeId, id: input.sponsorAccountId }, select: { id: true } });
      if (!sponsor) return "SPONSOR_NOT_FOUND";

      try {
        const created = await db.$transaction(async (tx) => {
          const number = input.agreementNumber ?? (await nextDocumentNumber(tx, storeId, "agreement", now.getUTCFullYear()));
          return tx.sponsorshipAgreement.create({
            data: {
              storeId,
              sponsorAccountId: input.sponsorAccountId,
              agreementNumber: number,
              title: input.title,
              status: input.status ?? "DRAFT",
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              currency: input.currency,
              pricingModel: input.pricingModel,
              settlementPeriod: input.settlementPeriod ?? "CAMPAIGN_END",
              agreedAmountMinor: input.agreedAmountMinor ?? null,
              unitPriceMinor: input.unitPriceMinor ?? null,
              revenueSharePercentBp: input.revenueSharePercentBp ?? null,
              budgetLimitMinor: input.budgetLimitMinor ?? null,
              paymentTermDays: input.paymentTermDays ?? 30,
              taxRateBp: input.taxRateBp ?? 2000,
              signedAt: input.signedAt ?? null,
              documentUrl: input.documentUrl ?? null,
              notes: input.notes ?? null,
            },
            include: AGREEMENT_INCLUDE,
          });
        });
        return toAgreementRow(created, now);
      } catch (error) {
        if (isUniqueViolation(error)) return "DUPLICATE_NUMBER";
        throw error;
      }
    },

    async updateAgreement(storeId, id, input, now) {
      const existing = await db.sponsorshipAgreement.findFirst({ where: { storeId, id } });
      if (!existing) return null;

      // Durum geçişi allowlist (SAF çekirdek).
      if (input.status !== undefined && input.status !== existing.status) {
        const { isAgreementTransitionAllowed } = await import("./billing-core.js");
        if (!isAgreementTransitionAllowed(existing.status, input.status)) return "INVALID_STATUS_TRANSITION";
      }

      // Para birimi tahakkuk/ödeme oluştuktan sonra KİLİTLİDİR (snapshot bütünlüğü).
      if (input.currency !== undefined && !isSameCurrency(input.currency, existing.currency)) {
        const usage = await db.sponsorshipCharge.count({ where: { storeId, agreementId: id } });
        if (usage > 0) return "CURRENCY_LOCKED";
      }

      const nextStart = input.startsAt ?? existing.startsAt;
      const nextEnd = input.endsAt ?? existing.endsAt;
      if (nextEnd.getTime() <= nextStart.getTime()) return "INVALID_WINDOW";

      const nextPricing = toPricingTerms({
        pricingModel: input.pricingModel ?? existing.pricingModel,
        agreedAmountMinor: input.agreedAmountMinor !== undefined ? input.agreedAmountMinor : existing.agreedAmountMinor,
        unitPriceMinor: input.unitPriceMinor !== undefined ? input.unitPriceMinor : existing.unitPriceMinor,
        revenueSharePercentBp:
          input.revenueSharePercentBp !== undefined ? input.revenueSharePercentBp : existing.revenueSharePercentBp,
      });
      if (!validatePricingTerms(nextPricing).ok) return "INVALID_PRICING";

      // Onay damgası: anlaşma İLK KEZ ACTIVE'e geçtiğinde kim/ne zaman kaydedilir (ADR-128).
      // Durum tek otoritedir; bu yalnız denetim izidir. Yeniden ACTIVE olursa damga KORUNUR.
      const stampsApproval = input.status === "ACTIVE" && existing.status !== "ACTIVE" && existing.approvedAt === null;

      try {
        const updated = await db.sponsorshipAgreement.update({
          where: { id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(stampsApproval ? { approvedAt: now, approvedByUserId: input.approvedByUserId ?? null } : {}),
            ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
            ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
            ...(input.currency !== undefined ? { currency: input.currency } : {}),
            ...(input.pricingModel !== undefined ? { pricingModel: input.pricingModel } : {}),
            ...(input.settlementPeriod !== undefined ? { settlementPeriod: input.settlementPeriod } : {}),
            ...(input.agreedAmountMinor !== undefined ? { agreedAmountMinor: input.agreedAmountMinor } : {}),
            ...(input.unitPriceMinor !== undefined ? { unitPriceMinor: input.unitPriceMinor } : {}),
            ...(input.revenueSharePercentBp !== undefined ? { revenueSharePercentBp: input.revenueSharePercentBp } : {}),
            ...(input.budgetLimitMinor !== undefined ? { budgetLimitMinor: input.budgetLimitMinor } : {}),
            ...(input.paymentTermDays !== undefined ? { paymentTermDays: input.paymentTermDays } : {}),
            ...(input.taxRateBp !== undefined ? { taxRateBp: input.taxRateBp } : {}),
            ...(input.signedAt !== undefined ? { signedAt: input.signedAt } : {}),
            ...(input.documentUrl !== undefined ? { documentUrl: input.documentUrl } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
          include: AGREEMENT_INCLUDE,
        });
        return toAgreementRow(updated, now);
      } catch (error) {
        if (isUniqueViolation(error)) return "DUPLICATE_NUMBER";
        throw error;
      }
    },

    async linkCampaign(storeId, agreementId, campaignId, allocationAmountMinor) {
      const agreement = await db.sponsorshipAgreement.findFirst({ where: { storeId, id: agreementId } });
      if (!agreement) return "AGREEMENT_NOT_FOUND";
      const campaign = await db.sponsoredProductCampaign.findFirst({
        where: { storeId, id: campaignId },
        select: { id: true, startsAt: true, endsAt: true },
      });
      if (!campaign) return "CAMPAIGN_NOT_FOUND";
      if (!isCampaignCoveredByAgreement({ startsAt: agreement.startsAt, endsAt: agreement.endsAt }, { startsAt: campaign.startsAt, endsAt: campaign.endsAt }))
        return "CAMPAIGN_WINDOW_NOT_COVERED";
      try {
        await db.sponsorshipAgreementCampaign.create({
          data: { storeId, agreementId, campaignId, allocationAmountMinor: allocationAmountMinor ?? null },
        });
      } catch (error) {
        if (isUniqueViolation(error)) return "CAMPAIGN_ALREADY_LINKED";
        throw error;
      }
      return (await this.getAgreementDetail(storeId, agreementId, new Date()))!;
    },

    async unlinkCampaign(storeId, agreementId, campaignId, now) {
      const link = await db.sponsorshipAgreementCampaign.findFirst({ where: { storeId, agreementId, campaignId }, select: { id: true } });
      if (!link) return null;
      await db.sponsorshipAgreementCampaign.delete({ where: { id: link.id } });
      return this.getAgreementDetail(storeId, agreementId, now);
    },

    async resolveCampaignEligibility(storeId, campaignId, now) {
      const campaign = await db.sponsoredProductCampaign.findFirst({
        where: { storeId, id: campaignId },
        select: { commercialMode: true },
      });
      if (!campaign) return { exempt: true, reason: null };
      if (campaign.commercialMode === "INTERNAL_PROMOTION") return { exempt: true, reason: null };
      const link = await db.sponsorshipAgreementCampaign.findFirst({
        where: { storeId, campaignId },
        select: {
          agreement: {
            select: {
              status: true,
              startsAt: true,
              endsAt: true,
              budgetExhaustedAt: true,
              charges: { select: { status: true, totalAmountMinor: true, dueAt: true, payments: { select: { amountMinor: true } } } },
            },
          },
        },
      });
      if (!link) return { exempt: false, reason: "NO_AGREEMENT" };
      const summary = summarizeCharges(link.agreement.charges, now);
      const reason = resolveCommercialIneligibility(
        {
          status: link.agreement.status,
          startsAt: link.agreement.startsAt,
          endsAt: link.agreement.endsAt,
          budgetExhaustedAt: link.agreement.budgetExhaustedAt,
          hasOverdueCharge: summary.hasOverdue,
        },
        now,
      );
      return { exempt: false, reason };
    },

    async isUnpaidCampaignAllowed(storeId) {
      const s = await db.storeSettings.findUnique({ where: { storeId }, select: { allowUnpaidSponsoredCampaigns: true } });
      return s?.allowUnpaidSponsoredCampaigns ?? false;
    },

    async listEligibleAgreements(storeId, sponsorAccountId, now) {
      // Kampanyaya bağlanabilir aday anlaşmalar: terminal OLMAYAN (DRAFT/PENDING/ACTIVE/SUSPENDED).
      // Sponsor firması pasifse hiçbiri uygun sayılmaz (ticari uygunluk yine de sunucuda kararlaşır).
      const sponsor = await db.sponsorAccount.findFirst({ where: { storeId, id: sponsorAccountId }, select: { status: true } });
      if (!sponsor) return [];
      const rows = await db.sponsorshipAgreement.findMany({
        where: { storeId, sponsorAccountId, status: { in: ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "SUSPENDED"] } },
        include: {
          ...AGREEMENT_INCLUDE,
          campaignLinks: { select: { allocationAmountMinor: true } },
        },
        orderBy: [{ status: "asc" }, { endsAt: "desc" }],
      });
      return rows.map((r) => {
        const base = toAgreementRow(r, now);
        const allocatedToCampaigns = r.campaignLinks.reduce((sum, l) => sum + (l.allocationAmountMinor ?? 0), 0);
        // Kullanılabilir sözleşme tutarı: FIXED_FEE'de agreedAmount, aksi halde budgetLimit tavanı.
        // Kümülatif tahakkuk matrahı düşülür. Limit yoksa null (sınırsız).
        const cap = r.pricingModel === "FIXED_FEE" ? r.agreedAmountMinor : r.budgetLimitMinor;
        const availableAllocationMinor = cap === null ? null : Math.max(0, cap - base.chargedMinor);
        const eligible = sponsor.status === "ACTIVE" && base.commerciallyEligible;
        return {
          id: r.id,
          agreementNumber: r.agreementNumber,
          title: r.title,
          status: r.status,
          currency: r.currency,
          pricingModel: r.pricingModel,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          agreedAmountMinor: r.agreedAmountMinor,
          budgetLimitMinor: r.budgetLimitMinor,
          allocatedToCampaignsMinor: allocatedToCampaigns,
          availableAllocationMinor,
          outstandingMinor: base.outstandingMinor,
          commerciallyEligible: eligible,
          ineligibilityReason: sponsor.status === "ACTIVE" ? base.ineligibilityReason : "AGREEMENT_NOT_ACTIVE",
        };
      });
    },

    async getCampaignCommercialSummary(storeId, campaignId, now) {
      const campaign = await db.sponsoredProductCampaign.findFirst({
        where: { storeId, id: campaignId },
        select: {
          id: true,
          name: true,
          commercialMode: true,
          agreementLinks: {
            take: 1,
            select: {
              allocationAmountMinor: true,
              agreement: { include: AGREEMENT_INCLUDE },
            },
          },
        },
      });
      if (!campaign) return null;
      const link = campaign.agreementLinks[0] ?? null;
      let agreement: CampaignCommercialSummary["agreement"] = null;
      if (link) {
        const row = toAgreementRow(link.agreement, now);
        agreement = {
          id: row.id,
          agreementNumber: row.agreementNumber,
          title: row.title,
          status: row.status,
          sponsorAccountId: row.sponsorAccountId,
          sponsorCompanyName: row.sponsorCompanyName,
          pricingModel: row.pricingModel,
          currency: row.currency,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          agreedAmountMinor: row.agreedAmountMinor,
          allocationAmountMinor: link.allocationAmountMinor,
          commerciallyEligible: row.commerciallyEligible,
          ineligibilityReason: row.ineligibilityReason,
        };
      }
      // Kampanyaya doğrudan atanmış tahakkuklar (charge.campaignId) + finans özeti.
      const charges = await db.sponsorshipCharge.findMany({
        where: { storeId, campaignId },
        select: {
          status: true,
          totalAmountMinor: true,
          dueAt: true,
          payments: { select: { amountMinor: true } },
          advanceAllocations: { select: { amountMinor: true } },
        },
      });
      const summary = summarizeCharges(charges, now);
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        commercialMode: campaign.commercialMode,
        agreement,
        currency: agreement?.currency ?? null,
        chargedMinor: summary.chargedMinor,
        paidMinor: summary.paidMinor,
        outstandingMinor: summary.outstandingMinor,
        overdueMinor: summary.overdueMinor,
      };
    },

    // ── Mutabakat (settlement) ────────────────────────────────────────────────
    async previewSettlement(storeId, agreementId, input, now) {
      const agreement = await db.sponsorshipAgreement.findFirst({ where: { storeId, id: agreementId } });
      if (!agreement) return "AGREEMENT_NOT_FOUND";
      if (input.periodEnd.getTime() <= input.periodStart.getTime()) return "INVALID_PERIOD";
      // H-2 / ADR-182: currency otoritesi eksikse finansal belge üretilmez (fail-closed).
      if (!isUsableAgreementCurrency(agreement.currency)) return "AGREEMENT_CURRENCY_REQUIRED";

      // Aynı dönem zaten FINALIZED ise yeniden hesaplanamaz (immutable — ADR-123).
      const existing = await db.sponsorshipSettlement.findFirst({
        where: { agreementId, periodStart: input.periodStart, periodEnd: input.periodEnd },
      });
      if (existing && existing.status === "FINALIZED") return "PERIOD_ALREADY_FINALIZED";

      const campaignIds = await agreementCampaignIds(db, storeId, agreementId);
      const collected = await collectBillableMetrics(db, storeId, campaignIds, input.periodStart, input.periodEnd, agreement.currency);

      // H-2 / ADR-183: dönemde beklenen (agreement) currency dışında attribution varsa fail-closed.
      // Draft OLUŞTURULMAZ/GÜNCELLENMEZ (kısmi settlement + sessiz dışlama YOK — §5); mismatch audit'e
      // yazılır ve güvenli özet çağırana döner (UI kontrollü uyarı gösterir).
      if (collected.currency.hasMismatch) {
        await recordCurrencyMismatchAudit(db, storeId, agreementId, collected.currency, {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          campaignIds,
        });
        return toSettlementCurrencyMismatch(collected.currency);
      }

      const terms = toPricingTerms(agreement);

      // Bütçe tavanı: bu anlaşmanın DAHA ÖNCE tahakkuk ettirdiği matrah + bu dönem.
      const priorCharged = await db.sponsorshipCharge.aggregate({
        where: { storeId, agreementId, status: { not: "CANCELLED" } },
        _sum: { subtotalMinor: true },
      });
      const alreadyChargedSubtotal = priorCharged._sum.subtotalMinor ?? 0;
      const rawAmount = computePricedAmountMinor(terms, collected.metrics);
      const calculatedChargeMinor = clampToBudget(agreement.budgetLimitMinor, alreadyChargedSubtotal, rawAmount);

      const snapshot = {
        pricingModel: agreement.pricingModel,
        unitPriceMinor: agreement.unitPriceMinor,
        agreedAmountMinor: agreement.agreedAmountMinor,
        revenueSharePercentBp: agreement.revenueSharePercentBp,
        budgetLimitMinor: agreement.budgetLimitMinor,
        alreadyChargedSubtotalMinor: alreadyChargedSubtotal,
        rawAmountMinor: rawAmount,
        campaignIds,
        metrics: collected.metrics,
        computedAt: now.toISOString(),
      } as unknown as Prisma.InputJsonObject;

      const data = {
        storeId,
        agreementId,
        periodKind: input.periodKind,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        impressions: collected.impressions,
        billableImpressions: collected.metrics.billableImpressions,
        clicks: collected.clicks,
        billableClicks: collected.metrics.billableClicks,
        orders: collected.totalOrders,
        grossRevenueMinor: collected.grossRevenueMinor,
        refundedRevenueMinor: collected.refundedRevenueMinor,
        netRevenueMinor: collected.metrics.netRevenueMinor,
        calculatedChargeMinor,
        currency: agreement.currency,
        pricingModel: agreement.pricingModel,
        status: "DRAFT" as const,
        snapshot,
      };

      // DRAFT ise yeniden hesapla (upsert by unique period); yoksa oluştur.
      const saved = existing
        ? await db.sponsorshipSettlement.update({ where: { id: existing.id }, data })
        : await db.sponsorshipSettlement.create({ data });

      return this.getSettlement(storeId, saved.id) as Promise<SettlementRow>;
    },

    async listSettlements(storeId, filters, page) {
      const where: Prisma.SponsorshipSettlementWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.agreementId ? { agreementId: filters.agreementId } : {}),
      };
      const orderBy: Prisma.SponsorshipSettlementOrderByWithRelationInput =
        page.sortBy === "periodStart"
          ? { periodStart: page.sortOrder }
          : page.sortBy === "status"
            ? { status: page.sortOrder }
            : { createdAt: page.sortOrder };
      const [rows, total] = await Promise.all([
        db.sponsorshipSettlement.findMany({
          where,
          orderBy,
          skip: page.offset,
          take: page.limit,
          include: {
            agreement: { select: { agreementNumber: true, title: true, sponsorAccount: { select: { companyName: true } } } },
            charges: { select: { id: true }, take: 1 },
          },
        }),
        db.sponsorshipSettlement.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          agreementId: r.agreementId,
          agreementNumber: r.agreement.agreementNumber,
          agreementTitle: r.agreement.title,
          sponsorCompanyName: r.agreement.sponsorAccount.companyName,
          periodKind: r.periodKind,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          impressions: r.impressions,
          billableImpressions: r.billableImpressions,
          clicks: r.clicks,
          billableClicks: r.billableClicks,
          orders: r.orders,
          grossRevenueMinor: r.grossRevenueMinor,
          refundedRevenueMinor: r.refundedRevenueMinor,
          netRevenueMinor: r.netRevenueMinor,
          calculatedChargeMinor: r.calculatedChargeMinor,
          currency: r.currency,
          pricingModel: r.pricingModel,
          status: r.status,
          chargeId: r.charges[0]?.id ?? null,
          createdAt: r.createdAt,
          finalizedAt: r.finalizedAt,
        })),
        total,
      };
    },

    async getSettlement(storeId, id) {
      const r = await db.sponsorshipSettlement.findFirst({
        where: { storeId, id },
        include: {
          agreement: { select: { agreementNumber: true, title: true, sponsorAccount: { select: { companyName: true } } } },
          charges: { select: { id: true }, take: 1 },
        },
      });
      if (!r) return null;
      return {
        id: r.id,
        agreementId: r.agreementId,
        agreementNumber: r.agreement.agreementNumber,
        agreementTitle: r.agreement.title,
        sponsorCompanyName: r.agreement.sponsorAccount.companyName,
        periodKind: r.periodKind,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        impressions: r.impressions,
        billableImpressions: r.billableImpressions,
        clicks: r.clicks,
        billableClicks: r.billableClicks,
        orders: r.orders,
        grossRevenueMinor: r.grossRevenueMinor,
        refundedRevenueMinor: r.refundedRevenueMinor,
        netRevenueMinor: r.netRevenueMinor,
        calculatedChargeMinor: r.calculatedChargeMinor,
        currency: r.currency,
        pricingModel: r.pricingModel,
        status: r.status,
        chargeId: r.charges[0]?.id ?? null,
        createdAt: r.createdAt,
        finalizedAt: r.finalizedAt,
      };
    },

    async finalizeSettlement(storeId, id, now) {
      const existing = await db.sponsorshipSettlement.findFirst({
        where: { storeId, id },
        select: {
          id: true,
          status: true,
          agreementId: true,
          currency: true,
          periodStart: true,
          periodEnd: true,
          agreement: { select: { currency: true } },
        },
      });
      if (!existing) return null;
      if (existing.status === "FINALIZED") return "ALREADY_FINALIZED";

      // H-2 / ADR-184: finalize ÖNCESİ currency yeniden doğrulanır (draft'tan sonra veri değişmiş
      // olabilir → fail-closed). Otorite = agreement.currency; settlement onunla eşleşmeli ve dönemde
      // yabancı-currency attribution OLMAMALI. FINALIZED belge immutable kalır.
      if (!isUsableAgreementCurrency(existing.agreement.currency)) return "AGREEMENT_CURRENCY_REQUIRED";
      if (!isSameCurrency(existing.currency, existing.agreement.currency)) return "SETTLEMENT_CURRENCY_MISMATCH";

      const campaignIds = await agreementCampaignIds(db, storeId, existing.agreementId);
      const collected = await collectBillableMetrics(
        db,
        storeId,
        campaignIds,
        existing.periodStart,
        existing.periodEnd,
        existing.agreement.currency,
      );
      if (collected.currency.hasMismatch) {
        await recordCurrencyMismatchAudit(db, storeId, existing.agreementId, collected.currency, {
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          campaignIds,
        });
        return toSettlementCurrencyMismatch(collected.currency);
      }

      await db.sponsorshipSettlement.update({ where: { id }, data: { status: "FINALIZED", finalizedAt: now } });
      return this.getSettlement(storeId, id) as Promise<SettlementRow>;
    },

    async deleteSettlement(storeId, id) {
      const existing = await db.sponsorshipSettlement.findFirst({ where: { storeId, id }, select: { status: true } });
      if (!existing) return "NOT_FOUND";
      if (existing.status === "FINALIZED") return "FINALIZED";
      await db.sponsorshipSettlement.delete({ where: { id } });
      return "OK";
    },

    // ── Tahakkuk (charge) ─────────────────────────────────────────────────────
    async createChargeFromSettlement(storeId, settlementId, input, now) {
      const settlement = await db.sponsorshipSettlement.findFirst({
        where: { storeId, id: settlementId },
        include: { agreement: true, charges: { select: { id: true }, take: 1 } },
      });
      if (!settlement) return "SETTLEMENT_NOT_FOUND";
      // Yalnız FINALIZED settlement tahakkuk üretir (snapshot immutable — ADR-123).
      if (settlement.status !== "FINALIZED") return "SETTLEMENT_NOT_FINALIZED";
      if (settlement.charges.length > 0) return "CHARGE_ALREADY_EXISTS";

      const agreement = settlement.agreement;
      // H-2 / ADR-184: charge currency settlement/agreement'tan türetilir; tutarsızsa fail-closed.
      if (!isSameCurrency(settlement.currency, agreement.currency)) return "SETTLEMENT_CURRENCY_MISMATCH";
      const totals = computeChargeTotals(settlement.calculatedChargeMinor, agreement.taxRateBp);
      const issuedAt = input.issue ? now : null;
      const dueAt = computeDueAt(issuedAt ?? now, agreement.paymentTermDays);
      const metrics = (settlement.snapshot as { metrics?: BillableMetrics }).metrics;
      const quantity =
        agreement.pricingModel === "CPM"
          ? metrics?.billableImpressions ?? 0
          : agreement.pricingModel === "CPC"
            ? metrics?.billableClicks ?? 0
            : agreement.pricingModel === "CPA"
              ? metrics?.attributedOrders ?? 0
              : agreement.pricingModel === "REVENUE_SHARE"
                ? settlement.netRevenueMinor
                : 1;

      try {
        const charge = await db.$transaction(async (tx) => {
          const number = await nextDocumentNumber(tx, storeId, "charge", now.getUTCFullYear());
          const created = await tx.sponsorshipCharge.create({
            data: {
              storeId,
              agreementId: agreement.id,
              settlementId,
              chargeNumber: number,
              chargeType: "PERIOD",
              pricingModel: agreement.pricingModel,
              periodStart: settlement.periodStart,
              periodEnd: settlement.periodEnd,
              quantity,
              unitPriceMinor: agreement.unitPriceMinor ?? 0,
              subtotalMinor: totals.subtotalMinor,
              taxRateBp: agreement.taxRateBp,
              taxAmountMinor: totals.taxAmountMinor,
              totalAmountMinor: totals.totalAmountMinor,
              currency: agreement.currency,
              status: input.issue ? "ISSUED" : "DRAFT",
              notes: input.notes,
              generatedAt: now,
              issuedAt,
              dueAt,
            },
            include: CHARGE_INCLUDE,
          });
          // Bütçe tükendi mi? (kümülatif matrah limiti). FINALIZE anında damgala — cron gerekmez.
          if (agreement.budgetLimitMinor !== null) {
            const agg = await tx.sponsorshipCharge.aggregate({
              where: { storeId, agreementId: agreement.id, status: { not: "CANCELLED" } },
              _sum: { subtotalMinor: true },
            });
            if (isBudgetExceeded(agreement.budgetLimitMinor, agg._sum.subtotalMinor ?? 0) && agreement.budgetExhaustedAt === null) {
              await tx.sponsorshipAgreement.update({ where: { id: agreement.id }, data: { budgetExhaustedAt: now } });
            }
          }
          return created;
        });
        return toChargeRow(charge, now);
      } catch (error) {
        if (isUniqueViolation(error)) return "CHARGE_ALREADY_EXISTS";
        throw error;
      }
    },

    async createRefundAdjustment(storeId, settlementId, now) {
      const settlement = await db.sponsorshipSettlement.findFirst({
        where: { storeId, id: settlementId },
        include: { agreement: true },
      });
      if (!settlement) return "SETTLEMENT_NOT_FOUND";
      if (settlement.status !== "FINALIZED") return "SETTLEMENT_NOT_FINALIZED";

      const agreement = settlement.agreement;
      // H-2 / ADR-184: iade düzeltmesi de agreement currency otoritesine bağlıdır.
      if (!isSameCurrency(settlement.currency, agreement.currency)) return "SETTLEMENT_CURRENCY_MISMATCH";
      const campaignIds = await agreementCampaignIds(db, storeId, settlement.agreementId);
      const current = await collectBillableMetrics(db, storeId, campaignIds, settlement.periodStart, settlement.periodEnd, agreement.currency);
      const settledMetrics = (settlement.snapshot as { metrics?: BillableMetrics }).metrics ?? {
        billableImpressions: settlement.billableImpressions,
        billableClicks: settlement.billableClicks,
        attributedOrders: settlement.orders,
        netRevenueMinor: settlement.netRevenueMinor,
      };
      const adjustmentSubtotal = computeRefundAdjustmentMinor({
        terms: toPricingTerms(agreement),
        settledMetrics,
        currentMetrics: current.metrics,
      });
      // Etki yoksa (0) adjustment kaydı AÇILMAZ.
      if (adjustmentSubtotal === 0) return null;

      const totals = computeChargeTotals(adjustmentSubtotal, agreement.taxRateBp);
      // İdempotent: aynı iade seti ikinci kez adjustment üretmez.
      const idempotencyKey = `refund-adj:${settlementId}:${current.refundedRevenueMinor}:${current.metrics.attributedOrders}`;

      try {
        const charge = await db.$transaction(async (tx) => {
          const number = await nextDocumentNumber(tx, storeId, "charge", now.getUTCFullYear());
          return tx.sponsorshipCharge.create({
            data: {
              storeId,
              agreementId: agreement.id,
              settlementId: null, // settlement 1-1 PERIOD charge'a bağlıdır; adjustment ayrı belge.
              chargeNumber: number,
              chargeType: "ADJUSTMENT",
              pricingModel: agreement.pricingModel,
              periodStart: settlement.periodStart,
              periodEnd: settlement.periodEnd,
              quantity: 0,
              unitPriceMinor: 0,
              subtotalMinor: totals.subtotalMinor,
              taxRateBp: agreement.taxRateBp,
              taxAmountMinor: totals.taxAmountMinor,
              totalAmountMinor: totals.totalAmountMinor,
              currency: agreement.currency,
              status: "ISSUED",
              idempotencyKey,
              notes: `İade düzeltmesi (settlement ${settlementId})`,
              generatedAt: now,
              issuedAt: now,
              dueAt: computeDueAt(now, agreement.paymentTermDays),
            },
            include: CHARGE_INCLUDE,
          });
        });
        return toChargeRow(charge, now);
      } catch (error) {
        if (isUniqueViolation(error)) return "CHARGE_ALREADY_EXISTS"; // idempotent tekrar → mevcut adjustment
        throw error;
      }
    },

    async issueCharge(storeId, chargeId, issuedAt, now) {
      const charge = await db.sponsorshipCharge.findFirst({ where: { storeId, id: chargeId }, include: { agreement: { select: { paymentTermDays: true } } } });
      if (!charge) return "CHARGE_NOT_FOUND";
      if (charge.status !== "DRAFT") return "INVALID_STATUS";
      const updated = await db.sponsorshipCharge.update({
        where: { id: chargeId },
        data: { status: "ISSUED", issuedAt, dueAt: computeDueAt(issuedAt, charge.agreement.paymentTermDays) },
        include: CHARGE_INCLUDE,
      });
      return toChargeRow(updated, now);
    },

    async cancelCharge(storeId, chargeId, reason, now) {
      const charge = await db.sponsorshipCharge.findFirst({
        where: { storeId, id: chargeId },
        include: { payments: { select: { amountMinor: true } } },
      });
      if (!charge) return "CHARGE_NOT_FOUND";
      if (charge.status === "PAID" || charge.status === "CANCELLED") return "INVALID_STATUS";
      // Kısmen ödenmiş tahakkuk iptal edilemez (önce ödeme ters çevrilmeli — belirsizlik önlenir).
      const paid = charge.payments.reduce((s, p) => s + p.amountMinor, 0);
      if (paid > 0) return "INVALID_STATUS";
      const updated = await db.sponsorshipCharge.update({
        where: { id: chargeId },
        data: { status: "CANCELLED", cancelledAt: now, notes: reason ?? charge.notes },
        include: CHARGE_INCLUDE,
      });
      return toChargeRow(updated, now);
    },

    async listCharges(storeId, filters, page, now) {
      const where: Prisma.SponsorshipChargeWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.agreementId ? { agreementId: filters.agreementId } : {}),
        ...(filters.sponsorAccountId ? { agreement: { sponsorAccountId: filters.sponsorAccountId } } : {}),
        ...(filters.chargeType ? { chargeType: filters.chargeType } : {}),
        ...(filters.overdueOnly
          ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueAt: { lt: now }, totalAmountMinor: { gt: 0 } }
          : {}),
        ...(filters.dateFrom || filters.dateTo
          ? { generatedAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
          : {}),
      };
      const orderBy: Prisma.SponsorshipChargeOrderByWithRelationInput =
        page.sortBy === "chargeNumber"
          ? { chargeNumber: page.sortOrder }
          : page.sortBy === "dueAt"
            ? { dueAt: page.sortOrder }
            : page.sortBy === "totalAmountMinor"
              ? { totalAmountMinor: page.sortOrder }
              : page.sortBy === "status"
                ? { status: page.sortOrder }
                : { createdAt: page.sortOrder };
      const [rows, total] = await Promise.all([
        db.sponsorshipCharge.findMany({ where, orderBy, skip: page.offset, take: page.limit, include: CHARGE_INCLUDE }),
        db.sponsorshipCharge.count({ where }),
      ]);
      return { items: rows.map((r) => toChargeRow(r, now)), total };
    },

    async getCharge(storeId, id, now) {
      const r = await db.sponsorshipCharge.findFirst({ where: { storeId, id }, include: CHARGE_INCLUDE });
      return r ? toChargeRow(r, now) : null;
    },

    async createFixedFeeCharge(storeId, agreementId, input, now) {
      const agreement = await db.sponsorshipAgreement.findFirst({ where: { storeId, id: agreementId } });
      if (!agreement) return "AGREEMENT_NOT_FOUND";
      // FIXED_FEE dışı modeller settlement'tan tahakkuk üretir (gerçekleşen metriğe dayanır — ADR-122).
      if (agreement.pricingModel !== "FIXED_FEE") return "NOT_FIXED_FEE";
      const subtotal = input.amountMinor ?? agreement.agreedAmountMinor ?? 0;
      if (subtotal <= 0) return "INVALID_AMOUNT";

      // Kampanya verilmişse bu anlaşmaya BAĞLI olmalı (çapraz-anlaşma tahakkuku engellenir).
      const campaignId = input.campaignId ?? null;
      if (campaignId) {
        const link = await db.sponsorshipAgreementCampaign.findFirst({ where: { storeId, agreementId, campaignId }, select: { id: true } });
        if (!link) return "CAMPAIGN_NOT_LINKED";
      }

      // Allocation/bütçe tavanı: kümülatif matrah + bu tahakkuk anlaşma tutarını/limitini aşmamalı.
      const cap = agreement.budgetLimitMinor ?? agreement.agreedAmountMinor;
      if (cap !== null) {
        const agg = await db.sponsorshipCharge.aggregate({
          where: { storeId, agreementId, status: { not: "CANCELLED" } },
          _sum: { subtotalMinor: true },
        });
        if ((agg._sum.subtotalMinor ?? 0) + subtotal > cap) return "AGREEMENT_ALLOCATION_EXCEEDED";
      }

      const totals = computeChargeTotals(subtotal, agreement.taxRateBp);
      const issuedAt = input.issue ? now : null;
      const dueAt = computeDueAt(issuedAt ?? now, agreement.paymentTermDays);
      const charge = await db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, storeId, "charge", now.getUTCFullYear());
        const created = await tx.sponsorshipCharge.create({
          data: {
            storeId,
            agreementId,
            campaignId,
            settlementId: null,
            chargeNumber: number,
            chargeType: "PERIOD",
            pricingModel: "FIXED_FEE",
            periodStart: agreement.startsAt,
            periodEnd: agreement.endsAt,
            quantity: 1,
            unitPriceMinor: subtotal,
            subtotalMinor: totals.subtotalMinor,
            taxRateBp: agreement.taxRateBp,
            taxAmountMinor: totals.taxAmountMinor,
            totalAmountMinor: totals.totalAmountMinor,
            currency: agreement.currency,
            status: input.issue ? "ISSUED" : "DRAFT",
            notes: input.notes ?? null,
            generatedAt: now,
            issuedAt,
            dueAt,
          },
          include: CHARGE_INCLUDE,
        });
        // Bütçe tükendi mi? (FIXED_FEE'de anlaşma tutarına ulaşınca teslim guard'ı devreye girer.)
        if (agreement.budgetLimitMinor !== null) {
          const agg = await tx.sponsorshipCharge.aggregate({
            where: { storeId, agreementId, status: { not: "CANCELLED" } },
            _sum: { subtotalMinor: true },
          });
          if (isBudgetExceeded(agreement.budgetLimitMinor, agg._sum.subtotalMinor ?? 0) && agreement.budgetExhaustedAt === null) {
            await tx.sponsorshipAgreement.update({ where: { id: agreementId }, data: { budgetExhaustedAt: now } });
          }
        }
        return created;
      });
      return toChargeRow(charge, now);
    },

    async listOpenCharges(storeId, filters, now) {
      const rows = await db.sponsorshipCharge.findMany({
        where: {
          storeId,
          ...(filters.agreementId ? { agreementId: filters.agreementId } : {}),
          status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          totalAmountMinor: { gt: 0 },
        },
        include: CHARGE_INCLUDE,
        orderBy: { dueAt: "asc" },
      });
      // Kalanı 0 olanları (avans/tahsilatla kapanmış ama status henüz güncellenmemiş uç durum) ele.
      return rows.map((r) => toChargeRow(r, now)).filter((c) => c.remainingMinor > 0);
    },

    // ── Tahsilat (payment) — append-only defter ───────────────────────────────
    async recordPayment(storeId, chargeId, input) {
      const preview = await db.sponsorshipCharge.findFirst({ where: { storeId, id: chargeId }, select: { agreementId: true } });
      if (!preview) return "CHARGE_NOT_FOUND";
      try {
        const result = await db.$transaction(async (tx) => {
          // Anlaşma kilidi → eşzamanlı ödeme/mahsup serileştirilir (ADR-129).
          await lockAgreement(tx, preview.agreementId);
          const charge = await tx.sponsorshipCharge.findFirst({
            where: { storeId, id: chargeId },
            include: {
              payments: { select: { amountMinor: true } },
              advanceAllocations: { select: { amountMinor: true } },
              agreement: { select: { id: true } },
            },
          });
          if (!charge) return "CHARGE_NOT_FOUND" as const;
          if (charge.status === "DRAFT" || charge.status === "CANCELLED") return "CHARGE_NOT_COLLECTIBLE" as const;
          if (charge.totalAmountMinor <= 0) return "CHARGE_NOT_COLLECTIBLE" as const;
          if (!isSameCurrency(input.currency, charge.currency)) return "CURRENCY_MISMATCH" as const;

          // "Ödenmiş" = doğrudan tahsilat + avans mahsupları (ADR-129). Kilit ALTINDA yeniden okunur.
          const paid = chargePaidMinor(charge);
          const remaining = computeRemainingMinor(charge.totalAmountMinor, paid);
          if (!isWithinRemaining(input.amountMinor, remaining)) return "OVERPAYMENT" as const;

          const created = await tx.sponsorshipPayment.create({
            data: {
              storeId,
              agreementId: charge.agreement.id,
              chargeId,
              amountMinor: input.amountMinor,
              currency: charge.currency,
              method: input.method,
              paidAt: input.paidAt,
              providerReference: input.providerReference ?? null,
              manualReference: input.manualReference ?? null,
              notes: input.notes ?? null,
              recordedByUserId: input.recordedByUserId,
              idempotencyKey: input.idempotencyKey ?? null,
            },
          });
          const nextStatus = resolveChargeStatus(charge.status, charge.totalAmountMinor, paid + input.amountMinor);
          if (nextStatus !== charge.status) {
            await tx.sponsorshipCharge.update({ where: { id: chargeId }, data: { status: nextStatus } });
          }
          return { id: created.id };
        });
        if (typeof result === "string") return result;
        return (await this.listPayments(storeId, { chargeId }, { limit: 1, offset: 0, sortBy: "createdAt", sortOrder: "desc" })).items.find((p) => p.id === result.id)!;
      } catch (error) {
        if (isUniqueViolation(error)) return "OVERPAYMENT"; // idempotencyKey çakışması → yinelenen istek
        throw error;
      }
    },

    async reversePayment(storeId, paymentId, reason, actorUserId, now) {
      const payment = await db.sponsorshipPayment.findFirst({
        where: { storeId, id: paymentId },
        include: { charge: { select: { id: true, status: true, totalAmountMinor: true, payments: { select: { amountMinor: true } }, advanceAllocations: { select: { amountMinor: true } } } }, reversedBy: { select: { id: true } } },
      });
      if (!payment) return "PAYMENT_NOT_FOUND";
      // Ters kaydın kendisi ters çevrilemez; pozitif ödeme olmalı.
      if (payment.amountMinor <= 0) return "NOT_REVERSIBLE";
      if (payment.reversedBy) return "ALREADY_REVERSED";
      if (!isValidReversalAmount(payment.amountMinor, -payment.amountMinor)) return "NOT_REVERSIBLE";

      await db.$transaction(async (tx) => {
        await tx.sponsorshipPayment.create({
          data: {
            storeId,
            agreementId: payment.agreementId,
            chargeId: payment.chargeId,
            amountMinor: -payment.amountMinor,
            currency: payment.currency,
            method: payment.method,
            paidAt: now,
            reversalOfPaymentId: payment.id,
            reversalReason: reason ?? null,
            recordedByUserId: actorUserId,
          },
        });
        if (payment.charge) {
          const newPaid = chargePaidMinor(payment.charge) - payment.amountMinor;
          const nextStatus = resolveChargeStatus(payment.charge.status, payment.charge.totalAmountMinor, newPaid);
          if (nextStatus !== payment.charge.status) {
            await tx.sponsorshipCharge.update({ where: { id: payment.charge.id }, data: { status: nextStatus } });
          }
        }
      });
      const list = await this.listPayments(storeId, { chargeId: payment.chargeId ?? undefined, agreementId: payment.agreementId }, { limit: 5, offset: 0, sortBy: "createdAt", sortOrder: "desc" });
      return list.items.find((p) => p.reversalOfPaymentId === payment.id)!;
    },

    async listPayments(storeId, filters, page) {
      const where: Prisma.SponsorshipPaymentWhereInput = {
        storeId,
        ...(filters.agreementId ? { agreementId: filters.agreementId } : {}),
        ...(filters.chargeId ? { chargeId: filters.chargeId } : {}),
        ...(filters.method ? { method: filters.method } : {}),
        ...(filters.sponsorAccountId ? { agreement: { sponsorAccountId: filters.sponsorAccountId } } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? { paidAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
          : {}),
      };
      const orderBy: Prisma.SponsorshipPaymentOrderByWithRelationInput =
        page.sortBy === "paidAt"
          ? { paidAt: page.sortOrder }
          : page.sortBy === "amountMinor"
            ? { amountMinor: page.sortOrder }
            : { createdAt: page.sortOrder };
      const [rows, total] = await Promise.all([
        db.sponsorshipPayment.findMany({
          where,
          orderBy,
          skip: page.offset,
          take: page.limit,
          include: {
            agreement: { select: { agreementNumber: true, sponsorAccount: { select: { companyName: true } } } },
            charge: { select: { chargeNumber: true } },
            reversedBy: { select: { id: true } },
          },
        }),
        db.sponsorshipPayment.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          agreementId: r.agreementId,
          agreementNumber: r.agreement.agreementNumber,
          sponsorCompanyName: r.agreement.sponsorAccount.companyName,
          chargeId: r.chargeId,
          chargeNumber: r.charge?.chargeNumber ?? null,
          amountMinor: r.amountMinor,
          currency: r.currency,
          method: r.method,
          providerReference: r.providerReference,
          manualReference: r.manualReference,
          paidAt: r.paidAt,
          notes: r.notes,
          isReversal: r.reversalOfPaymentId !== null,
          reversalOfPaymentId: r.reversalOfPaymentId,
          reversalReason: r.reversalReason,
          reversed: r.reversedBy !== null,
          createdAt: r.createdAt,
        })),
        total,
      };
    },

    // ── Avans + mahsup (ADR-129) ──────────────────────────────────────────────
    async createAdvance(storeId, agreementId, input) {
      const agreement = await db.sponsorshipAgreement.findFirst({ where: { storeId, id: agreementId }, select: { id: true, currency: true } });
      if (!agreement) return "AGREEMENT_NOT_FOUND";
      if (input.amountMinor <= 0) return "INVALID_AMOUNT";
      if (!isSameCurrency(input.currency, agreement.currency)) return "CURRENCY_MISMATCH";
      try {
        const payment = await db.sponsorshipPayment.create({
          data: {
            storeId,
            agreementId,
            chargeId: null, // AVANS: henüz bir tahakkuka mahsup edilmemiş nakit.
            amountMinor: input.amountMinor,
            currency: agreement.currency,
            method: input.method,
            paidAt: input.paidAt,
            providerReference: input.providerReference ?? null,
            manualReference: input.manualReference ?? null,
            notes: input.notes ?? null,
            recordedByUserId: input.recordedByUserId,
            idempotencyKey: input.idempotencyKey ?? null,
          },
        });
        return (await this.listPayments(storeId, { agreementId }, { limit: 1, offset: 0, sortBy: "createdAt", sortOrder: "desc" })).items.find((p) => p.id === payment.id)!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          // İdempotent tekrar → mevcut avansı döndür.
          const existing = await db.sponsorshipPayment.findFirst({ where: { storeId, agreementId, idempotencyKey: input.idempotencyKey } });
          if (existing) {
            return (await this.listPayments(storeId, { agreementId }, { limit: 50, offset: 0, sortBy: "createdAt", sortOrder: "desc" })).items.find((p) => p.id === existing.id)!;
          }
        }
        throw error;
      }
    },

    async allocateAdvance(storeId, input) {
      // Ön-okuma: anlaşma kilidini almadan önce ilgili anlaşmayı sapta.
      const advancePreview = await db.sponsorshipPayment.findFirst({ where: { storeId, id: input.advancePaymentId }, select: { agreementId: true } });
      if (!advancePreview) return "ADVANCE_NOT_FOUND";
      if (input.amountMinor <= 0) return "OVERPAYMENT";
      try {
        const result = await db.$transaction(async (tx) => {
          await lockAgreement(tx, advancePreview.agreementId);
          const advance = await tx.sponsorshipPayment.findFirst({
            where: { storeId, id: input.advancePaymentId },
            include: { advanceAllocations: { select: { amountMinor: true } } },
          });
          if (!advance) return "ADVANCE_NOT_FOUND" as const;
          // Avans = chargeId null + pozitif + ters kayıt DEĞİL.
          if (advance.chargeId !== null || advance.amountMinor <= 0 || advance.reversalOfPaymentId !== null) return "NOT_AN_ADVANCE" as const;

          const charge = await tx.sponsorshipCharge.findFirst({
            where: { storeId, id: input.chargeId },
            include: { payments: { select: { amountMinor: true } }, advanceAllocations: { select: { amountMinor: true } } },
          });
          if (!charge) return "CHARGE_NOT_FOUND" as const;
          if (charge.agreementId !== advance.agreementId) return "CHARGE_NOT_FOUND" as const; // çapraz-anlaşma mahsubu yok
          if (charge.status === "DRAFT" || charge.status === "CANCELLED" || charge.totalAmountMinor <= 0) return "CHARGE_NOT_COLLECTIBLE" as const;
          if (!isSameCurrency(advance.currency, charge.currency)) return "CURRENCY_MISMATCH" as const;

          const allocatedFromAdvance = advance.advanceAllocations.reduce((s, a) => s + a.amountMinor, 0);
          const available = computeAdvanceAvailableMinor(advance.amountMinor, allocatedFromAdvance);
          const paid = chargePaidMinor(charge);
          const remaining = computeRemainingMinor(charge.totalAmountMinor, paid);
          // İyimser kilit: istemcinin gördüğü kalan sunucudakiyle uyuşmuyorsa reddet.
          if (input.expectedRemainingMinor !== undefined && input.expectedRemainingMinor !== remaining) return "BALANCE_CHANGED" as const;
          if (input.amountMinor > available) return "ADVANCE_BALANCE_EXCEEDED" as const;
          if (input.amountMinor > remaining) return "OVERPAYMENT" as const;
          if (!isAdvanceAllocationValid(input.amountMinor, available, remaining)) return "OVERPAYMENT" as const;

          const created = await tx.sponsorshipAdvanceAllocation.create({
            data: {
              storeId,
              agreementId: charge.agreementId,
              advancePaymentId: advance.id,
              chargeId: charge.id,
              amountMinor: input.amountMinor,
              currency: charge.currency,
              recordedByUserId: input.recordedByUserId,
              idempotencyKey: input.idempotencyKey ?? null,
              notes: input.notes ?? null,
            },
          });
          const nextStatus = resolveChargeStatus(charge.status, charge.totalAmountMinor, paid + input.amountMinor);
          if (nextStatus !== charge.status) {
            await tx.sponsorshipCharge.update({ where: { id: charge.id }, data: { status: nextStatus } });
          }
          return { id: created.id, chargeNumber: charge.chargeNumber, agreementId: charge.agreementId, advancePaymentId: advance.id, chargeId: charge.id, amountMinor: created.amountMinor, currency: created.currency, createdAt: created.createdAt };
        });
        if (typeof result === "string") return result;
        return {
          id: result.id,
          agreementId: result.agreementId,
          advancePaymentId: result.advancePaymentId,
          chargeId: result.chargeId,
          chargeNumber: result.chargeNumber,
          amountMinor: result.amountMinor,
          currency: result.currency,
          createdAt: result.createdAt,
        };
      } catch (error) {
        if (isUniqueViolation(error)) return "BALANCE_CHANGED"; // idempotencyKey çakışması → yinelenen istek
        throw error;
      }
    },

    async listAvailableAdvances(storeId, filters) {
      const advances = await db.sponsorshipPayment.findMany({
        where: {
          storeId,
          chargeId: null,
          reversalOfPaymentId: null,
          amountMinor: { gt: 0 },
          ...(filters.agreementId ? { agreementId: filters.agreementId } : {}),
          ...(filters.sponsorAccountId ? { agreement: { sponsorAccountId: filters.sponsorAccountId } } : {}),
        },
        include: {
          agreement: { select: { agreementNumber: true, sponsorAccount: { select: { companyName: true } } } },
          advanceAllocations: { select: { amountMinor: true } },
        },
        orderBy: { paidAt: "asc" },
      });
      return advances
        .map((a) => {
          const allocated = a.advanceAllocations.reduce((s, x) => s + x.amountMinor, 0);
          const available = computeAdvanceAvailableMinor(a.amountMinor, allocated);
          return {
            id: a.id,
            agreementId: a.agreementId,
            agreementNumber: a.agreement.agreementNumber,
            sponsorCompanyName: a.agreement.sponsorAccount.companyName,
            amountMinor: a.amountMinor,
            allocatedMinor: allocated,
            availableMinor: available,
            currency: a.currency,
            method: a.method,
            paidAt: a.paidAt,
            notes: a.notes,
            createdAt: a.createdAt,
          };
        })
        .filter((a) => a.availableMinor > 0);
    },

    // ── Dashboard — para birimi bazında AYRI (ADR-127) ────────────────────────
    async getDashboard(storeId, filters, now) {
      const agreementWhere: Prisma.SponsorshipAgreementWhereInput = {
        storeId,
        ...(filters.sponsorAccountId ? { sponsorAccountId: filters.sponsorAccountId } : {}),
        ...(filters.agreementId ? { id: filters.agreementId } : {}),
      };

      const [sponsorCounts, agreements] = await Promise.all([
        db.sponsorAccount.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
        db.sponsorshipAgreement.findMany({
          where: agreementWhere,
          include: {
            sponsorAccount: { select: { id: true, companyName: true } },
            charges: {
              where: {
                ...(filters.dateFrom || filters.dateTo
                  ? { generatedAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
                  : {}),
              },
              include: { payments: { select: { amountMinor: true } }, campaign: { select: { id: true, name: true } } },
            },
            campaignLinks: { select: { campaignId: true, campaign: { select: { name: true } } } },
          },
        }),
      ]);

      const activeSponsors = sponsorCounts.find((s) => s.status === "ACTIVE")?._count._all ?? 0;
      const totalSponsors = sponsorCounts.reduce((s, r) => s + r._count._all, 0);
      const activeAgreements = agreements.filter((a) => a.status === "ACTIVE").length;

      // Accumulator: key -> {currency-scoped totals}. Currency her zaman anahtarın parçasıdır.
      type Acc = { label: string; currency: string; charged: number; collected: number; outstanding: number; overdue: number; net: number | null };
      const currencies = new Map<string, { contracted: number; charged: number; collected: number; outstanding: number; overdue: number; net: number }>();
      const bySponsor = new Map<string, Acc>();
      const byAgreement = new Map<string, Acc>();
      const byCampaign = new Map<string, Acc>();
      const byPricingModel = new Map<string, Acc>();
      const byDueStatus = new Map<string, Acc>();
      let overdueChargeCount = 0;

      function bump(map: Map<string, Acc>, key: string, label: string, currency: string, s: { charged: number; collected: number; outstanding: number; overdue: number }, net?: number) {
        const cur = map.get(key) ?? { label, currency, charged: 0, collected: 0, outstanding: 0, overdue: 0, net: net === undefined ? null : 0 };
        cur.charged += s.charged;
        cur.collected += s.collected;
        cur.outstanding += s.outstanding;
        cur.overdue += s.overdue;
        if (net !== undefined) cur.net = (cur.net ?? 0) + net;
        map.set(key, cur);
      }

      for (const a of agreements) {
        const summary = summarizeCharges(a.charges, now);
        const s = { charged: summary.chargedMinor, collected: summary.paidMinor, outstanding: summary.outstandingMinor, overdue: summary.overdueMinor };
        for (const c of a.charges) {
          if (c.status === "DRAFT" || c.status === "CANCELLED") continue;
          const paid = c.payments.reduce((sum, p) => sum + p.amountMinor, 0);
          if (isChargeOverdue(c.status, c.dueAt, computeRemainingMinor(c.totalAmountMinor, paid), now)) overdueChargeCount += 1;
        }

        // Para birimi KPI'ları (currency = anahtar). `net` (sponsorlu gelir) attribution'dan
        // sonradan doldurulur (mağaza para birimi); burada yalnız cari toplamları biriktiririz.
        const cur = currencies.get(a.currency) ?? { contracted: 0, charged: 0, collected: 0, outstanding: 0, overdue: 0, net: 0 };
        cur.charged += s.charged;
        cur.collected += s.collected;
        cur.outstanding += s.outstanding;
        cur.overdue += s.overdue;
        // Sözleşme bedeli: FIXED_FEE'de agreedAmount; performansta budgetLimit (yaklaşık) — bilgi amaçlı.
        cur.contracted += a.agreedAmountMinor ?? a.budgetLimitMinor ?? 0;
        currencies.set(a.currency, cur);

        bump(bySponsor, `${a.sponsorAccount.id}|${a.currency}`, a.sponsorAccount.companyName, a.currency, s);
        bump(byAgreement, `${a.id}|${a.currency}`, a.agreementNumber, a.currency, s);
        bump(byPricingModel, `${a.pricingModel}|${a.currency}`, a.pricingModel, a.currency, s);
        bump(byDueStatus, `${summary.overdueMinor > 0 ? "OVERDUE" : "CURRENT"}|${a.currency}`, summary.overdueMinor > 0 ? "OVERDUE" : "CURRENT", a.currency, s);

        // Kampanya kırılımı (kârlılık): tahakkuk kampanya bağından; net gelir attribution'dan.
        for (const link of a.campaignLinks) {
          const campaignCharges = a.charges.filter((c) => c.campaignId === link.campaignId);
          const cs = summarizeCharges(campaignCharges, now);
          bump(byCampaign, `${link.campaignId}|${a.currency}`, link.campaign.name, a.currency, { charged: cs.chargedMinor, collected: cs.paidMinor, outstanding: cs.outstandingMinor, overdue: cs.overdueMinor }, 0);
        }
      }

      // Kampanya net geliri: attribution tablosundan. H-2 / ADR-181: currency BAZINDA gruplanır ve
      // net gelir YALNIZ anlaşma para birimiyle EŞLEŞEN attribution'dan alınır — mağaza-currency net'i
      // anlaşma-currency kovasına SESSİZCE eklemek YASAK (eski MVP bug'ı). Uyuşmayan currency'ler
      // toplanmaz; operations görünürlüğü için `currencyMismatch` özetinde raporlanır.
      const campaignIds = agreements.flatMap((a) => a.campaignLinks.map((l) => l.campaignId));
      const campaignToCurrency = new Map<string, string>();
      for (const a of agreements) for (const l of a.campaignLinks) campaignToCurrency.set(l.campaignId, normalizeCurrency(a.currency));

      const netByCampaign = new Map<string, number>(); // yalnız EŞLEŞEN currency net'i (kârlılık için)
      const foreignCurrencies = new Set<string>();
      const mismatchedCampaigns = new Set<string>();
      let mismatchedAttributionCount = 0;
      if (campaignIds.length) {
        const netAgg = await db.orderSponsoredAttribution.groupBy({
          by: ["campaignId", "currency"],
          where: {
            storeId,
            campaignId: { in: campaignIds },
            ...(filters.dateFrom || filters.dateTo
              ? { attributedAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
              : {}),
          },
          _sum: { netRevenueMinor: true },
          _count: { _all: true },
        });
        for (const r of netAgg) {
          const expected = campaignToCurrency.get(r.campaignId);
          if (!expected) continue;
          const rowCurrency = normalizeCurrency(r.currency);
          if (rowCurrency === expected) {
            netByCampaign.set(r.campaignId, (netByCampaign.get(r.campaignId) ?? 0) + (r._sum.netRevenueMinor ?? 0));
          } else {
            // Uyuşmayan currency: TOPLANMAZ, yalnız görünürlük sayaçlarına.
            foreignCurrencies.add(rowCurrency);
            mismatchedCampaigns.add(r.campaignId);
            mismatchedAttributionCount += r._count._all;
          }
        }
      }

      // Eşleşen net gelir → anlaşma para birimi kovasına (artık her zaman tek-para; karışım yok).
      for (const [campaignId, net] of netByCampaign) {
        const currency = campaignToCurrency.get(campaignId);
        if (!currency) continue;
        const cur = currencies.get(currency);
        if (cur) cur.net += net;
      }

      const toRows = (map: Map<string, Acc>, withProfit = false): DashboardBreakdownRow[] =>
        [...map.entries()]
          .map(([key, v]) => {
            const campaignId = withProfit ? key.split("|")[0] : null;
            const netRevenueMinor = withProfit ? netByCampaign.get(campaignId!) ?? 0 : null;
            return {
              key,
              label: v.label,
              currency: v.currency,
              chargedMinor: v.charged,
              collectedMinor: v.collected,
              outstandingMinor: v.outstanding,
              overdueMinor: v.overdue,
              netRevenueMinor,
              profitabilityMinor: withProfit ? (netRevenueMinor ?? 0) - v.charged : null,
            };
          })
          .sort((a, b) => b.chargedMinor - a.chargedMinor);

      // H-2 / ADR-185 — operations görünürlüğü: currency mismatch özeti. Uyuşan settlement (currency ≠
      // agreement currency) + son tespit zamanı (SYSTEM audit). Ham veri/PII yok; bounded.
      const affectedAgreementIds = [...new Set([...mismatchedCampaigns].map((cid) => {
        const link = agreements.find((a) => a.campaignLinks.some((l) => l.campaignId === cid));
        return link?.id;
      }).filter((v): v is string => typeof v === "string"))];
      const [settlementMismatchRows, lastMismatchAudit] = await Promise.all([
        // settlement.currency ≠ agreement.currency (iki-kolon karşılaştırma → raw). storeId-scoped.
        db.$queryRaw<Array<{ c: bigint }>>(Prisma.sql`
          SELECT COUNT(*) AS c
          FROM "SponsorshipSettlement" s
          JOIN "SponsorshipAgreement" a ON a."id" = s."agreementId"
          WHERE s."storeId" = ${storeId}
            AND UPPER(s."currency") <> UPPER(a."currency")
        `),
        db.auditLog.findFirst({
          where: { storeId, action: "SYSTEM", entityType: "SponsorshipSettlement" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, metadata: true },
        }),
      ]);
      const mismatchedSettlementCount = Number(settlementMismatchRows[0]?.c ?? 0n);
      const lastDetectedAt =
        lastMismatchAudit &&
        (lastMismatchAudit.metadata as { reason?: string } | null)?.reason === "REVENUE_CURRENCY_MISMATCH"
          ? lastMismatchAudit.createdAt
          : null;

      return {
        activeSponsors,
        totalSponsors,
        activeAgreements,
        totalAgreements: agreements.length,
        overdueChargeCount,
        currencyMismatch: {
          mismatchedAttributionCount,
          affectedCampaignCount: mismatchedCampaigns.size,
          affectedAgreementIds: affectedAgreementIds.slice(0, 50),
          mismatchedSettlementCount,
          foundForeignCurrencies: [...foreignCurrencies].sort(),
          lastDetectedAt,
        },
        currencies: [...currencies.entries()]
          .map(([currency, v]) => ({
            currency,
            contractedMinor: v.contracted,
            chargedMinor: v.charged,
            collectedMinor: v.collected,
            outstandingMinor: v.outstanding,
            overdueMinor: v.overdue,
            sponsoredNetRevenueMinor: v.net,
          }))
          .sort((a, b) => a.currency.localeCompare(b.currency)),
        bySponsor: toRows(bySponsor),
        byAgreement: toRows(byAgreement),
        byCampaign: toRows(byCampaign, true),
        byPricingModel: toRows(byPricingModel),
        byDueStatus: toRows(byDueStatus),
      };
    },
  };
}
