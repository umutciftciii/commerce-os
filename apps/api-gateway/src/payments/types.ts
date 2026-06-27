import type {
  PaymentAttemptStatus,
  PaymentMethodType,
  PaymentProviderMode,
  PaymentProviderType,
  ThreeDsMode,
} from "@prisma/client";

/**
 * F3B.2 Payment Operations Foundation — provider abstraction tipleri.
 *
 * Bu fazda canli odeme YOK. MOCK adapter tam calisir; gercek provider'lar
 * (IYZICO/STRIPE/PAYTR/GENERIC_REDIRECT) yalnizca config shell'dir ve canli
 * HTTP cagrisi yapmaz. Eksik credential / sozlesme yoksa net hata doner.
 */

export type PaymentScenario =
  | "success"
  | "failure"
  | "three_ds_required"
  | "insufficient_funds"
  | "cancelled";

export const PAYMENT_SCENARIOS: readonly PaymentScenario[] = [
  "success",
  "failure",
  "three_ds_required",
  "insufficient_funds",
  "cancelled",
];

/** Adapter'a verilen, decrypt edilmis credential'lar (asla loglanmaz/serialize edilmez). */
export interface ResolvedCredentials {
  apiKey: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  merchantId: string | null;
}

export interface PaymentActionContext {
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  threeDsMode: ThreeDsMode;
  method: PaymentMethodType;
  amount: number;
  currency: string;
  credentials: ResolvedCredentials;
}

export interface CreatePaymentInput {
  context: PaymentActionContext;
  orderId: string;
  attemptId: string;
}

export interface ConfirmPaymentInput {
  context: PaymentActionContext;
  attemptId: string;
  currentStatus: PaymentAttemptStatus;
  scenario?: PaymentScenario;
}

export interface CancelPaymentInput {
  context: PaymentActionContext;
  attemptId: string;
}

export interface RefundPaymentInput {
  context: PaymentActionContext;
  attemptId: string;
  amount?: number;
}

export interface GetPaymentStatusInput {
  context: PaymentActionContext;
  attemptId: string;
  currentStatus: PaymentAttemptStatus;
}

export interface HandleWebhookInput {
  provider: PaymentProviderType;
  credentials: ResolvedCredentials;
  signature: string | null;
  rawBody: string;
  payload: unknown;
}

export interface TestConnectionInput {
  context: Pick<PaymentActionContext, "provider" | "mode" | "credentials">;
}

export interface PaymentResult {
  status: PaymentAttemptStatus;
  providerReference?: string | null;
  threeDsApplied?: boolean;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface WebhookResult {
  handled: boolean;
  /** Provider/webhook external event id (idempotency icin). Yoksa null. */
  eventId?: string | null;
  signatureValid: boolean;
}

/** Tum provider adapter'larinin uydugu sozlesme. */
export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderType;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult>;
  cancelPayment(input: CancelPaymentInput): Promise<PaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<PaymentResult>;
  getPaymentStatus(input: GetPaymentStatusInput): Promise<PaymentResult>;
  handleWebhook(input: HandleWebhookInput): Promise<WebhookResult>;
  testConnection(input: TestConnectionInput): Promise<TestConnectionResult>;
}

/**
 * Provider config/credential/operasyon hatalari icin kontrollu hata tipi.
 * Route katmani bunu guvenli, lokalize HTTP yanitlarina esler (ic detay sizdirmaz).
 */
export class PaymentConfigError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "PaymentConfigError";
  }
}
