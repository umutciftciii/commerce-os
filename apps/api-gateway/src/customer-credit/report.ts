/**
 * TD-174B-2 — Alışveriş bakiyesi (store credit) FİNANSAL raporu (Finans > Raporlar).
 *
 * storeId-scoped, TEK para birimi (mixed-currency toplamı YOK — H-2 currency guard ile
 * uyumlu). `outstandingLiabilityMinor` NOKTA-ANLIK: şu an canlı lot Σ remaining
 * (`status=ACTIVE ∧ remaining>0 ∧ expiresAt>now`) — worker'dan bağımsız (ADR-281/284).
 * Diğer bucket'lar aralık-içi append-only ledger hareketlerinin toplamıdır. amountMinor
 * her zaman POZİTİF büyüklük; yön `direction`'da — bucket'lar tipe göre ayrıştırılır.
 * Kaynak = CustomerCreditLot (liability) + CustomerCreditLedgerEntry (hareketler).
 */
import { prisma } from "@commerce-os/db";
import type { CreditLedgerType } from "@prisma/client";
import type { ResolvedRange } from "../influencers/analytics-range.js";

export interface CreditReport {
  range: { dateFrom: string; dateTo: string; timezone: string };
  currency: string;
  outstandingLiabilityMinor: string;
  activeLotCount: number;
  customersWithBalance: number;
  issuedMinor: string;
  goodwillIssuedMinor: string;
  spentMinor: string;
  restoredMinor: string;
  expiredMinor: string;
  adjustmentsNetMinor: string;
}

const ISSUED_TYPES: CreditLedgerType[] = ["ADMIN_GOODWILL_CREDIT", "RECOVERY_GOODWILL_CREDIT"];
const RESTORE_TYPES: CreditLedgerType[] = ["ORDER_CANCELLATION_RESTORE", "REFUND_RESTORE"];

/**
 * Rapor para birimini çözer: verilmemişse mağazanın kredi lot'larından ilkinin
 * currency'si; hiç lot yoksa "TRY". (Store-credit pratikte tek-para; çoklu para
 * durumunda `currencyInput` ile açıkça daraltılır.)
 */
async function resolveReportCurrency(storeId: string, currencyInput?: string): Promise<string> {
  if (currencyInput) return currencyInput;
  const lot = await prisma.customerCreditLot.findFirst({
    where: { storeId },
    orderBy: { createdAt: "asc" },
    select: { currency: true },
  });
  return lot?.currency ?? "TRY";
}

export async function creditReport(
  storeId: string,
  range: ResolvedRange,
  currencyInput?: string,
): Promise<CreditReport> {
  const currency = await resolveReportCurrency(storeId, currencyInput);
  const now = new Date();
  const inRange = { gte: range.fromUtc, lt: range.toUtcExclusive };

  const [liveLots, grouped] = await Promise.all([
    // Outstanding liability = NOKTA-ANLIK canlı lot toplamı (worker-bağımsız).
    prisma.customerCreditLot.findMany({
      // TODO-175: non-expiring (expiresAt=null) refund-origin lot'lar da canlı liability'ye dahildir.
      where: {
        storeId,
        currency,
        status: "ACTIVE",
        remainingAmountMinor: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { remainingAmountMinor: true, customerId: true },
    }),
    // Aralık-içi hareketler tip başına toplam (amountMinor = pozitif büyüklük).
    prisma.customerCreditLedgerEntry.groupBy({
      by: ["type"],
      where: { storeId, currency, createdAt: inRange },
      _sum: { amountMinor: true },
    }),
  ]);

  let outstanding = 0n;
  const customers = new Set<string>();
  for (const lot of liveLots) {
    outstanding += lot.remainingAmountMinor;
    customers.add(lot.customerId);
  }

  const sumOf = (types: CreditLedgerType[]): bigint =>
    grouped
      .filter((g) => types.includes(g.type))
      .reduce((sum, g) => sum + (g._sum.amountMinor ?? 0n), 0n);

  const adjustmentsNet = sumOf(["ADMIN_ADJUSTMENT_CREDIT"]) - sumOf(["ADMIN_ADJUSTMENT_DEBIT"]);

  return {
    range: {
      dateFrom: range.dayStrings[0] ?? "",
      dateTo: range.dayStrings[range.dayStrings.length - 1] ?? "",
      timezone: range.timezone,
    },
    currency,
    outstandingLiabilityMinor: outstanding.toString(),
    activeLotCount: liveLots.length,
    customersWithBalance: customers.size,
    issuedMinor: sumOf(ISSUED_TYPES).toString(),
    goodwillIssuedMinor: sumOf(["RECOVERY_GOODWILL_CREDIT"]).toString(),
    spentMinor: sumOf(["ORDER_PAYMENT_DEBIT"]).toString(),
    restoredMinor: sumOf(RESTORE_TYPES).toString(),
    expiredMinor: sumOf(["EXPIRE"]).toString(),
    adjustmentsNetMinor: adjustmentsNet.toString(),
  };
}
