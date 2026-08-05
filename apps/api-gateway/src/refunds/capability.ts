/**
 * TODO-170 (ADR-272) — Refund CAPABILITY çözümü (SAF; sahte capability üretmez).
 *
 * Denetim gerçeği (analiz §1): yalnız MOCK adapter refund'u gerçekten yürütür; gerçek online provider'lar
 * (Stripe/iyzico/PayTR/generic) canlı transport kapalı + provider-native webhook yok → bu fazda otomatik
 * refund YÜRÜTÜLEMEZ. Bu yüzden gerçek online provider'lar MANUAL_OFFLINE'a düşürülür (başarı taklidi YOK;
 * admin'e manuel iade workflow'u sunulur). MANUAL/offline ödeme (banka havalesi vb.) zaten MANUAL_OFFLINE.
 */
import type {
  PaymentAttemptType,
  PaymentManualMethod,
  PaymentMethodType,
  PaymentProviderType,
  RefundExecutionMode,
} from "@prisma/client";

export interface RefundCapabilityInput {
  type: PaymentAttemptType;
  provider: PaymentProviderType | null;
  method: PaymentMethodType;
  manualMethod: PaymentManualMethod | null;
}

export type RefundCapabilityReason =
  | "PROVIDER_AUTOMATIC" // MOCK — otomatik yürütülür
  | "PROVIDER_AUTOMATIC_UNSUPPORTED" // gerçek online provider — bu fazda otomatik yok → manuel
  | "MANUAL_OFFLINE_PAYMENT"; // manuel/offline tahsilat (banka havalesi/nakit/POS)

export interface RefundCapability {
  mode: RefundExecutionMode;
  /** Bu fazda her ödeme iade EDİLEBİLİR (en kötü manuel offline); yalnız mode değişir. */
  supportsRefund: boolean;
  supportsPartialRefund: boolean;
  provider: PaymentProviderType | null;
  method: PaymentMethodType;
  manualMethod: PaymentManualMethod | null;
  reason: RefundCapabilityReason;
}

export function resolveRefundCapability(attempt: RefundCapabilityInput): RefundCapability {
  const base = {
    supportsRefund: true,
    supportsPartialRefund: true,
    method: attempt.method,
  };
  // Manuel/offline tahsilat (provider yok) → manuel offline iade (banka/reference zorunlu).
  if (attempt.type === "MANUAL" || attempt.provider === null) {
    return {
      ...base,
      mode: "MANUAL_OFFLINE",
      provider: null,
      manualMethod: attempt.manualMethod ?? "BANK_TRANSFER",
      reason: "MANUAL_OFFLINE_PAYMENT",
    };
  }
  // MOCK → tam otomatik (bu fazda tek gerçek yürütülen).
  if (attempt.provider === "MOCK") {
    return {
      ...base,
      mode: "PROVIDER_AUTOMATIC",
      provider: "MOCK",
      manualMethod: null,
      reason: "PROVIDER_AUTOMATIC",
    };
  }
  // Gerçek online provider — otomatik refund transport'u bu fazda yok → manuel offline (dürüst).
  return {
    ...base,
    mode: "MANUAL_OFFLINE",
    provider: attempt.provider,
    manualMethod: null,
    reason: "PROVIDER_AUTOMATIC_UNSUPPORTED",
  };
}
