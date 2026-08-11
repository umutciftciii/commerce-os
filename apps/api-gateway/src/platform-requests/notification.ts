/**
 * TODO-178 §Notifications — Store→Platform request bildirim dispatcher soyutlaması
 * (Product Support notification.ts PARİTESİ; tablo/enum reuse YOK).
 *
 * BİRİNCİL yüzey IN-APP'tir: `PlatformRequestHistory` (eventType) + `PlatformRequestMessage`; store
 * ve platform inbox'ta görünür. Bu satırlar request transaction'ı İÇİNDE yazılır. Bu dispatcher
 * İKİNCİL (e-posta) kanaldır.
 *
 * ÖNEMLİ: gerçek teslimat YOKKEN sahte başarı ÜRETİLMEZ — `isConfigured=false` iken
 * `delivery="UNCONFIGURED"` döner, ASLA "SENT"/"DELIVERED" değil. Dispatcher request transaction'ı
 * COMMIT edildikten SONRA (best-effort) çağrılır; teslimat hatası domain'i rollback ETMEZ.
 * Güvenlik: request gövdesi/PII log satırına yazılmaz; yalnız event + request no + sonuç loglanır.
 */

export type PlatformRequestNotificationEvent =
  | "REQUEST_OPENED"
  | "REQUEST_STORE_REPLY"
  | "REQUEST_PLATFORM_REPLY"
  | "REQUEST_ASSIGNED"
  | "REQUEST_STATUS_CHANGED"
  | "REQUEST_RESOLVED"
  | "REQUEST_REOPENED"
  | "REQUEST_CLOSED";

export type PlatformRequestNotificationRecipient = "STORE" | "PLATFORM";

/** UNCONFIGURED = gerçek provider yok (sahte başarı üretilmez). */
export type PlatformRequestNotificationDelivery = "UNCONFIGURED" | "QUEUED" | "SENT" | "FAILED";

export interface PlatformRequestNotificationInput {
  storeId: string;
  requestId: string;
  requestNumber: string;
  event: PlatformRequestNotificationEvent;
  recipient: PlatformRequestNotificationRecipient;
}

export interface PlatformRequestNotificationResult {
  delivery: PlatformRequestNotificationDelivery;
}

export interface PlatformRequestNotificationDispatcher {
  readonly isConfigured: boolean;
  /**
   * Bildirim gönderir. Başarısızlık ATMAZ (`FAILED`/`UNCONFIGURED` döner) → çağıran request
   * transaction'ını BOZMAZ. Yalnız gerçek provider'lı dispatcher `SENT`/`FAILED` raporlar.
   */
  sendRequestNotification(
    input: PlatformRequestNotificationInput,
  ): Promise<PlatformRequestNotificationResult>;
}

/**
 * Varsayılan dispatcher: gerçek e-posta altyapısı YOK. `isConfigured=false`; gönderim çağrılırsa
 * sahte başarı ÜRETMEZ — `UNCONFIGURED` döner. Logger hata atsa bile ASLA throw etmez (best-effort).
 */
export function createLogPlatformRequestNotificationDispatcher(logger: {
  info: (msg: string) => void;
}): PlatformRequestNotificationDispatcher {
  return {
    isConfigured: false,
    async sendRequestNotification(input) {
      try {
        logger.info(
          `platform-request notification (in-app only; email unconfigured) event=${input.event} ` +
            `request=${input.requestNumber} recipient=${input.recipient}`,
        );
      } catch {
        // logger best-effort; bildirim yolu domain'i etkilemez.
      }
      return { delivery: "UNCONFIGURED" };
    },
  };
}
