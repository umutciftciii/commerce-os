import type { PaymentHttpRequest, PaymentHttpTransport } from "./http.js";
import type { ProviderContract } from "./provider-contract.js";
import {
  PaymentConfigError,
  type CancelPaymentInput,
  type ConfirmPaymentInput,
  type CreatePaymentInput,
  type GetPaymentStatusInput,
  type HandleWebhookInput,
  type PaymentProviderAdapter,
  type PaymentResult,
  type RefundPaymentInput,
  type ResolvedCredentials,
  type TestConnectionInput,
  type TestConnectionResult,
  type WebhookResult,
} from "../types.js";

/**
 * F3B.2 — Gercek provider adapter'i: bir {@link ProviderContract} (provider-specific
 * request/response/status mapping) + {@link PaymentHttpTransport} ile 7 metodu yurutur.
 *
 * - Credential eksik/format gecersiz → kontrollu PaymentConfigError.
 * - Request payload HER ZAMAN contract ile uretilir (mapping calisir/test edilir).
 * - Transport KAPALIYKEN (bu faz) gercek cagri yapilmaz → `SANDBOX_HTTP_DISABLED`.
 *   Sozlesme/test credential sonrasi flag acilinca AYNI adapter sandbox/live cagriyi yapar.
 * - testConnection 4 durumu ayirir: missing / invalid format / sandbox disabled / sandbox ready.
 */
export class ProviderApiAdapter implements PaymentProviderAdapter {
  constructor(
    private readonly contract: ProviderContract,
    private readonly transport: PaymentHttpTransport,
  ) {}

  get provider() {
    return this.contract.provider;
  }

  private ensureCredentials(credentials: ResolvedCredentials): void {
    const state = this.contract.validateCredentials(credentials);
    if (state === "MISSING") {
      throw new PaymentConfigError(
        "MISSING_CREDENTIALS",
        `${this.provider} icin zorunlu credential alanlari eksik.`,
      );
    }
    if (state === "INVALID_FORMAT") {
      throw new PaymentConfigError(
        "CREDENTIALS_INVALID_FORMAT",
        `${this.provider} credential formati gecersiz.`,
      );
    }
  }

  private async exchange(request: PaymentHttpRequest): Promise<PaymentResult> {
    // Transport kapaliyken bu cagri SANDBOX_HTTP_DISABLED firlatir (bu faz: canli cagri yok).
    const response = await this.transport.send(request);
    return this.contract.parsePaymentResponse(response);
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    this.ensureCredentials(input.context.credentials);
    const request = this.contract.buildCreatePaymentRequest(input, this.contract.sandboxBaseUrl);
    return this.exchange(request);
  }

  async confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult> {
    this.ensureCredentials(input.context.credentials);
    const builder = this.contract.buildConfirmPaymentRequest ?? this.contract.buildStatusRequest;
    if (!builder) {
      throw new PaymentConfigError("OPERATION_NOT_SUPPORTED", `${this.provider}: confirm desteklenmiyor.`);
    }
    return this.exchange(builder(input as never, this.contract.sandboxBaseUrl));
  }

  async cancelPayment(input: CancelPaymentInput): Promise<PaymentResult> {
    this.ensureCredentials(input.context.credentials);
    if (!this.contract.buildCancelRequest) {
      throw new PaymentConfigError("OPERATION_NOT_SUPPORTED", `${this.provider}: cancel desteklenmiyor.`);
    }
    return this.exchange(this.contract.buildCancelRequest(input, this.contract.sandboxBaseUrl));
  }

  async refundPayment(input: RefundPaymentInput): Promise<PaymentResult> {
    this.ensureCredentials(input.context.credentials);
    if (!this.contract.buildRefundRequest) {
      throw new PaymentConfigError("OPERATION_NOT_SUPPORTED", `${this.provider}: refund desteklenmiyor.`);
    }
    return this.exchange(this.contract.buildRefundRequest(input, this.contract.sandboxBaseUrl));
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<PaymentResult> {
    this.ensureCredentials(input.context.credentials);
    if (!this.contract.buildStatusRequest) {
      throw new PaymentConfigError("OPERATION_NOT_SUPPORTED", `${this.provider}: status sorgusu desteklenmiyor.`);
    }
    return this.exchange(this.contract.buildStatusRequest(input, this.contract.sandboxBaseUrl));
  }

  async handleWebhook(input: HandleWebhookInput): Promise<WebhookResult> {
    // Webhook mapping + idempotency event id; imza dogrulama placeholder (TODO-071).
    const signatureValid = this.contract.verifyWebhookSignature(input);
    const eventId = this.contract.extractWebhookEventId(input.payload);
    const mapped = this.contract.mapWebhookStatus(input.payload);
    return { handled: mapped !== null && signatureValid, eventId, signatureValid };
  }

  async testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
    const state = this.contract.validateCredentials(input.context.credentials);
    if (state === "MISSING") {
      return { ok: false, message: `Eksik credential — ${this.provider} icin zorunlu alanlar girilmeli.` };
    }
    if (state === "INVALID_FORMAT") {
      return { ok: false, message: `Credential formati gecersiz (${this.provider}).` };
    }
    if (!this.transport.enabled) {
      return {
        ok: true,
        message: "Credential gecerli; sandbox HTTP kapali (bu fazda canli cagri yapilmaz).",
      };
    }
    return { ok: true, message: `Sandbox HTTP hazir; ${this.provider} credential gecerli.` };
  }
}
