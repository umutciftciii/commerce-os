import type { ReturnStatus, ReturnResolutionType, RefundIntentStatus } from "@prisma/client";

/**
 * TODO-172 (ADR-273) — Fast Refund Controls SAF uygunluk çekirdeği.
 *
 * Fast Refund, teslim alma + inceleme adımlarını atlayarak doğrudan para iadesi başlatan
 * KONTROLLÜ bir bypass'tır. Bu modül DB/provider'a dokunmadan uygunluğu belirler; route katmanı
 * bunu permission + optimistic-version + initiateRefund otoritesiyle sarmalar.
 *
 * Kritik ürün kararları (ADR-273):
 *  - `maxAmountMinor === null` → hızlı iade KAPALI (sınırsız DEĞİL). Limit yoksa aksiyon reddedilir.
 *  - Kaynak durum YALNIZ AWAITING_SHIPMENT veya RECEIVED (state-machine ile çelişen geçiş üretilmez).
 *    Faz 1'de approve AYNI tx'te otomatik AWAITING_SHIPMENT'e ilerler → "onaylandı, henüz teslim
 *    alınmadı"nın gerçek kaynak durumu AWAITING_SHIPMENT'tir (APPROVED geçici/ulaşılamaz; allowlist'te
 *    YOK). RETURN_SHIPPED de YOK: ürün yoldayken iade ayrı ve daha riskli bir ürün kararıdır.
 *  - Yalnız REFUND_TO_ORIGINAL_PAYMENT çözümü + PENDING RefundIntent.
 *  - Currency sunucudan (order/settings); client hesaplamaz. Explicit limit currency order ile
 *    eşleşmezse güvenli karşılaştırma yapılamaz → reddet (normal akışa yönlendir).
 *  - Kontrol sırası DETERMİNİSTİK: config gate (enabled → limit) önce, sonra durum/çözüm/intent,
 *    en son currency + tutar. Böylece kapalı bir özellik asla tutar/kaynak-durum detayı sızdırmaz.
 */

/** Fast Refund'a yalnız bu kaynak durumlarda izin verilir (ADR-273 §5; K3 kararı 2026-08-06). */
export const FAST_REFUND_SOURCE_STATUSES: ReturnStatus[] = ["AWAITING_SHIPMENT", "RECEIVED"];

/**
 * ReturnStatusHistory.note içine JSON marker olarak yazılan aksiyon anahtarı. ReturnStatusHistory'de
 * metadata kolonu yoktur; yapısal audit (skippedSteps/reason/amount) note'a JSON gömülür (review-event
 * deseniyle tutarlı). Son-90-gün hızlı iade sayımı bu markere göre yapılır.
 */
export const RETURN_FAST_REFUND_STARTED_ACTION = "RETURN_FAST_REFUND_STARTED" as const;

export type FastRefundRejectionCode =
  | "FAST_REFUND_DISABLED"
  | "FAST_REFUND_LIMIT_NOT_SET"
  | "FAST_REFUND_INVALID_STATE"
  | "NOT_REFUND_RESOLUTION"
  | "FAST_REFUND_INTENT_NOT_PENDING"
  | "FAST_REFUND_CURRENCY_MISMATCH"
  | "FAST_REFUND_LIMIT_EXCEEDED";

export interface FastRefundSettings {
  enabled: boolean;
  /** minor-unit BigInt; null = hızlı iade kapalı (sınırsız DEĞİL). Number/float'a ÇEVRİLMEZ. */
  maxAmountMinor: bigint | null;
  /** null = limit sipariş para biriminde yorumlanır. */
  currency: string | null;
}

export interface FastRefundEligibilityInput {
  status: ReturnStatus;
  resolutionType: ReturnResolutionType | string;
  intentStatus: RefundIntentStatus | string | null;
  settings: FastRefundSettings;
  orderCurrency: string;
  /** Sunucu-otoriter refund toplamı (RefundIntent.totalRefundMinor, Int). Client sağlamaz. */
  refundTotalMinor: number;
}

export type FastRefundEligibility = { ok: true } | { ok: false; code: FastRefundRejectionCode };

/**
 * Fast Refund'ın verilen bağlamda başlatılabilir olup olmadığını belirleyen SAF kural (fail-closed).
 * Kontrol sırası bilinçlidir (yukarıdaki not) ve testlerle kilitlenmiştir.
 */
export function evaluateFastRefundEligibility(input: FastRefundEligibilityInput): FastRefundEligibility {
  const { settings } = input;

  // 1) Config gate — özellik kapalıysa hiçbir detay sızdırmadan reddet.
  if (!settings.enabled) {
    return { ok: false, code: "FAST_REFUND_DISABLED" };
  }
  // 2) Limit yoksa KAPALI (null = sınırsız DEĞİL).
  if (settings.maxAmountMinor === null || settings.maxAmountMinor === undefined) {
    return { ok: false, code: "FAST_REFUND_LIMIT_NOT_SET" };
  }
  // 3) Kaynak durum allowlist (state-machine ile çelişen geçiş üretilmez).
  if (!FAST_REFUND_SOURCE_STATUSES.includes(input.status)) {
    return { ok: false, code: "FAST_REFUND_INVALID_STATE" };
  }
  // 4) Yalnız orijinal ödemeye iade çözümü.
  if (input.resolutionType !== "REFUND_TO_ORIGINAL_PAYMENT") {
    return { ok: false, code: "NOT_REFUND_RESOLUTION" };
  }
  // 5) RefundIntent PENDING olmalı (approve'da oluşur; consume/cancel sonrası fast refund yok).
  if (input.intentStatus !== "PENDING") {
    return { ok: false, code: "FAST_REFUND_INTENT_NOT_PENDING" };
  }
  // 6) Currency: explicit limit currency varsa order ile birebir eşleşmeli.
  if (settings.currency !== null && settings.currency !== undefined && settings.currency !== input.orderCurrency) {
    return { ok: false, code: "FAST_REFUND_CURRENCY_MISMATCH" };
  }
  // 7) Tutar limiti (sınır dahil). BigInt karşılaştırma (float/Number YOK).
  if (BigInt(input.refundTotalMinor) > settings.maxAmountMinor) {
    return { ok: false, code: "FAST_REFUND_LIMIT_EXCEEDED" };
  }
  return { ok: true };
}

/**
 * Fast Refund'ın atladığı iş adımları (audit + history + UI görünürlüğü için). AWAITING_SHIPMENT
 * kaynağında müşteri iade kargosu + mağaza teslim alma + inceleme atlanır; RECEIVED kaynağında
 * yalnız inceleme atlanır.
 */
export function deriveSkippedSteps(status: ReturnStatus): string[] {
  if (status === "RECEIVED") {
    return ["INSPECTION"];
  }
  // AWAITING_SHIPMENT (onaylandı, henüz teslim alınmadı) — kargo + teslim alma + inceleme atlanır.
  return ["CUSTOMER_RETURN_SHIPMENT", "STORE_RECEIPT", "INSPECTION"];
}
