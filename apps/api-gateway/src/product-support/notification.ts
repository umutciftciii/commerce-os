/**
 * TODO-177 (ADR-289) §8 — Ürün Desteği bildirim dispatcher soyutlaması (payments/notification.ts deseni).
 *
 * BİRİNCİL yüzey IN-APP'tir: `SupportTicketStatusHistory` (eventType) + `SupportTicketMessage`; müşteri
 * Hesabım > Destek ve store-admin inbox'ta görünür. Bu satırlar ticket transaction'ı İÇİNDE yazılır.
 *
 * Bu dispatcher İKİNCİL (e-posta) kanaldır. `services/notification-service` bir STUB'tır (gerçek SMTP YOK).
 * ÖNEMLİ (TD-110): gerçek teslimat YOKKEN sahte başarı ÜRETİLMEZ — `isConfigured=false` iken
 * `delivery="UNCONFIGURED"` döner, ASLA "SENT"/"DELIVERED" değil. Dispatcher ticket transaction'ı
 * COMMIT edildikten SONRA (best-effort) çağrılır; teslimat hatası ticket'ı rollback ETMEZ.
 *
 * Güvenlik: ticket gövdesi/PII log satırına yazılmaz; yalnız event + ticket no + sonuç loglanır.
 */

export type SupportNotificationEvent =
  | "TICKET_OPENED"
  | "TICKET_STORE_REPLY"
  | "TICKET_CUSTOMER_REPLY"
  | "TICKET_RESOLVED"
  | "TICKET_REOPENED";

export type SupportNotificationRecipient = "CUSTOMER" | "STORE_ADMIN";

/** UNCONFIGURED = gerçek provider yok (sahte başarı üretilmez). */
export type SupportNotificationDelivery = "UNCONFIGURED" | "QUEUED" | "SENT" | "FAILED";

export interface SupportNotificationInput {
  storeId: string;
  ticketId: string;
  ticketNumber: string;
  event: SupportNotificationEvent;
  recipient: SupportNotificationRecipient;
  /** Müşteri hedefli e-posta adresi (STORE_ADMIN'de yok — admin in-app pull ile görür). */
  recipientEmail?: string | null;
}

export interface SupportNotificationResult {
  delivery: SupportNotificationDelivery;
}

export interface SupportNotificationDispatcher {
  /** Gerçek e-posta teslimatı yapılandırılmış mı? false → sahte "SENT" ÜRETİLMEZ. */
  readonly isConfigured: boolean;
  /**
   * Bildirim gönderir. Başarısızlık ATMAZ (`FAILED`/`UNCONFIGURED` döner) → çağıran ticket
   * transaction'ını BOZMAZ. Yalnız gerçek provider'lı dispatcher `SENT`/`FAILED` raporlar.
   */
  sendTicketNotification(input: SupportNotificationInput): Promise<SupportNotificationResult>;
}

/**
 * Varsayılan dispatcher: gerçek e-posta altyapısı YOK. `isConfigured=false`; gönderim çağrılırsa
 * sahte başarı ÜRETMEZ — `UNCONFIGURED` döner. Gerçek teslimat için provider entegrasyonlu bir
 * implementasyonla değiştirilir (kontrat sabit); gerçek entegrasyon Faz 1 scope DIŞIDIR.
 */
export function createLogSupportNotificationDispatcher(
  logger: { info: (msg: string) => void },
): SupportNotificationDispatcher {
  return {
    isConfigured: false,
    async sendTicketNotification(input) {
      logger.info(
        `support notification (in-app only; email unconfigured) event=${input.event} ` +
          `ticket=${input.ticketNumber} recipient=${input.recipient}`,
      );
      return { delivery: "UNCONFIGURED" };
    },
  };
}
