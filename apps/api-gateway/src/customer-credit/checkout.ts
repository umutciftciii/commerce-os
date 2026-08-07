/**
 * TODO-174B (ADR-282) — Store Credit checkout allocation (server-authoritative).
 *
 * Sipariş PLACE edildikten sonra çağrılır (kendi tx'i içinde). creditUsed = min(availableCredit,
 * payableOrderAmount) — ASLA sipariş toplamı altına düşmez. FEFO harcama + STORE_CREDIT MANUAL
 * PaymentAttempt (status PAID; yeni status İCAT EDİLMEZ) + Order snapshot (shoppingCreditUsedMinor /
 * externalPaymentAmountMinor). Tam-credit'te (external=0) sipariş DOĞAL olarak PAID sayılır
 * (resolveOrderPaymentTransition + consumeOrderReservations) — hacky fake PSP YOK. Kısmi credit'te
 * kalan external ödemeye bırakılır (STORE_CREDIT attempt sumCapturedMinor'a girer → remaining doğru).
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { consumeOrderReservations } from "@commerce-os/inventory";
import { resolveOrderPaymentTransition } from "../payments/payment-state.js";
import { getAvailableBalanceMinor, spendCreditInTx } from "./service.js";
import { minBigInt } from "./ledger-calc.js";

type Tx = Prisma.TransactionClient | PrismaClient;

export type ApplyCreditResult =
  | { applied: false }
  | { applied: true; creditUsedMinor: bigint; externalPayableMinor: bigint; fullyPaid: boolean };

/**
 * Yerleştirilmiş siparişe store credit uygular. onFullyPaid: tam-credit settle side-effect'i (cart
 * CONVERTED + order event) — çağıran (checkout endpoint) sağlar; kısmi credit'te çağrılmaz.
 */
export async function applyStoreCreditToOrderInTx(
  tx: Tx,
  params: {
    storeId: string;
    orderId: string;
    customerId: string;
    now?: Date;
    onFullyPaid?: (tx: Tx) => Promise<void>;
  },
): Promise<ApplyCreditResult> {
  const now = params.now ?? new Date();
  const order = await tx.order.findFirst({
    where: { id: params.orderId, storeId: params.storeId },
    select: { totalAmount: true, currency: true, paymentStatus: true },
  });
  if (!order) return { applied: false };
  const payable = BigInt(order.totalAmount);
  if (payable <= 0n) return { applied: false };

  const available = await getAvailableBalanceMinor(tx, params.storeId, params.customerId, order.currency);
  const creditUsed = minBigInt(available, payable);
  if (creditUsed <= 0n) return { applied: false };

  const spend = await spendCreditInTx(tx, {
    storeId: params.storeId,
    customerId: params.customerId,
    currency: order.currency,
    requestedMinor: creditUsed,
    orderId: params.orderId,
    actor: { type: "CUSTOMER", id: params.customerId },
    description: "credit.orderPayment",
  });
  if (!spend.ok || spend.usedMinor <= 0n) return { applied: false };

  const externalPayable = payable - spend.usedMinor;
  await tx.paymentAttempt.create({
    data: {
      storeId: params.storeId,
      orderId: params.orderId,
      type: "MANUAL",
      method: "STORE_CREDIT",
      amount: Number(spend.usedMinor),
      currency: order.currency,
      status: "PAID",
      paidAt: now,
      collectedAt: now,
      creditLedgerGroupKey: spend.groupKey,
      initiatedBy: null,
    },
  });
  await tx.order.update({
    where: { id: params.orderId },
    data: { shoppingCreditUsedMinor: spend.usedMinor, externalPaymentAmountMinor: externalPayable },
  });

  const fullyPaid = externalPayable === 0n;
  if (fullyPaid) {
    const next = resolveOrderPaymentTransition(order.paymentStatus, "PAID");
    if (next && next !== order.paymentStatus) {
      await tx.order.update({ where: { id: params.orderId }, data: { paymentStatus: next } });
    }
    // Rezervasyon lifecycle: ödeme settle → SALE_COMMIT (aynı politika, webhook applyOutcome ile birebir).
    await consumeOrderReservations(tx, params.storeId, params.orderId, now);
    if (params.onFullyPaid) await params.onFullyPaid(tx);
  }
  return { applied: true, creditUsedMinor: spend.usedMinor, externalPayableMinor: externalPayable, fullyPaid };
}
