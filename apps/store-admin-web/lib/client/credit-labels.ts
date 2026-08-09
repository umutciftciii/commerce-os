/**
 * Shopping Balance Admin — kredi enum'ları için insan-okur TR/EN etiketler.
 * RAW ENUM UI'da ASLA gösterilmez (ledger tipi / lot kaynağı / lot durumu).
 */
import type { CreditLotStatusDto, CreditSourceTypeDto } from "@commerce-os/api-client";

type LedgerType =
  | "ADMIN_GOODWILL_CREDIT"
  | "RECOVERY_GOODWILL_CREDIT"
  | "ORDER_PAYMENT_DEBIT"
  | "ORDER_CANCELLATION_RESTORE"
  | "REFUND_RESTORE"
  | "ADMIN_ADJUSTMENT_CREDIT"
  | "ADMIN_ADJUSTMENT_DEBIT"
  | "EXPIRE"
  | "RETURN_CREDIT_RESTORE";

const LEDGER_LABELS: Record<LedgerType, [string, string]> = {
  ADMIN_GOODWILL_CREDIT: ["Goodwill kredi", "Goodwill credit"],
  RECOVERY_GOODWILL_CREDIT: ["Telafi kredisi", "Recovery credit"],
  ORDER_PAYMENT_DEBIT: ["Siparişte kullanım", "Order payment"],
  ORDER_CANCELLATION_RESTORE: ["İptal iadesi", "Cancellation restore"],
  REFUND_RESTORE: ["Para iadesi kredisi", "Refund credit"],
  ADMIN_ADJUSTMENT_CREDIT: ["Manuel ekleme", "Manual credit"],
  ADMIN_ADJUSTMENT_DEBIT: ["Manuel düşüş", "Manual debit"],
  EXPIRE: ["Süre dolumu", "Expiry"],
  RETURN_CREDIT_RESTORE: ["İade kredisi", "Return credit"],
};

const SOURCE_LABELS: Record<CreditSourceTypeDto, [string, string]> = {
  ADMIN_GOODWILL: ["Goodwill", "Goodwill"],
  RECOVERY_GOODWILL: ["Telafi", "Recovery"],
  ADMIN_ADJUSTMENT: ["Manuel düzeltme", "Manual adjustment"],
  ORDER_PAYMENT: ["Sipariş ödemesi", "Order payment"],
  ORDER_CANCELLATION: ["Sipariş iptali", "Cancellation"],
  ORDER_REFUND: ["Para iadesi", "Refund"],
  EXPIRY: ["Süre dolumu", "Expiry"],
  SYSTEM: ["Sistem", "System"],
  ORDER_RETURN: ["İade", "Return"],
};

const STATUS_LABELS: Record<CreditLotStatusDto, [string, string]> = {
  ACTIVE: ["Aktif", "Active"],
  CONSUMED: ["Kullanıldı", "Used"],
  EXPIRED: ["Süresi doldu", "Expired"],
};

export function creditLedgerTypeLabel(type: string, tr: boolean): string {
  const pair = LEDGER_LABELS[type as LedgerType];
  return pair ? (tr ? pair[0] : pair[1]) : type;
}

export function creditSourceTypeLabel(source: string, tr: boolean): string {
  const pair = SOURCE_LABELS[source as CreditSourceTypeDto];
  return pair ? (tr ? pair[0] : pair[1]) : source;
}

export function creditLotStatusLabel(status: string, tr: boolean): string {
  const pair = STATUS_LABELS[status as CreditLotStatusDto];
  return pair ? (tr ? pair[0] : pair[1]) : status;
}
