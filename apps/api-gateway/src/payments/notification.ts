/**
 * TODO-159F (ADR-099) — Ödeme bildirimi (e-posta) dispatcher soyutlaması.
 *
 * `services/notification-service` şu an bir STUB'tır (gerçek SMTP/e-posta teslimatı
 * YOK). Bu soyutlama, gerçek bir mail altyapısı geldiğinde "Müşteriye Gönder"
 * aksiyonunun sorunsuz devreye girmesi için bir kontrat sağlar.
 *
 * ÖNEMLİ (TD-110): Yapılandırılmış GERÇEK teslimat YOKKEN sahte başarı ÜRETİLMEZ.
 * `isConfigured=false` iken e-posta ucu 501 döner ve UI "Gönder" aksiyonunu AKTİF
 * göstermez (kullanıcı bağlantıyı kopyalayarak iletir). Yalnız gerçek provider'lı
 * dispatcher `isConfigured=true` döndürür ve teslimat sonucunu (SENT/FAILED) raporlar.
 *
 * Güvenlik: TAM ödeme URL'i / token log satırına YAZILMAZ (spec §10). Yalnız
 * alıcı e-posta + sipariş no + sonuç loglanır.
 */

export type PaymentNotificationDelivery = "QUEUED" | "SENDING" | "SENT" | "FAILED";

export interface PaymentLinkEmailInput {
  storeId: string;
  orderId: string;
  orderNumber: string;
  recipientEmail: string;
  /** Mutlak müşteri ödeme adresi — dispatcher'a verilir ama LOG'lanmaz. */
  paymentLinkUrl: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentNotificationResult {
  delivery: PaymentNotificationDelivery;
}

export interface PaymentNotificationDispatcher {
  /**
   * Gerçek e-posta teslimatı yapılandırılmış mı? false ise "Müşteriye Gönder"
   * aksiyonu UI'da aktif GÖSTERİLMEZ ve e-posta ucu 501 döner (sahte başarı YOK).
   */
  readonly isConfigured: boolean;
  /**
   * Ödeme bağlantısını gönderir. YALNIZ `isConfigured=true` iken çağrılmalıdır.
   * Sonuç gerçek provider yanıtına dayanır (SENT/FAILED). Başarısızlık atmaz,
   * `FAILED` döner (çağıran taraf payment attempt'i BOZMAZ).
   */
  sendPaymentLinkEmail(input: PaymentLinkEmailInput): Promise<PaymentNotificationResult>;
}

/**
 * Varsayılan dispatcher: gerçek e-posta altyapısı YOK. `isConfigured=false` döner;
 * gönderim çağrılırsa (guard aşılırsa) sahte başarı ÜRETMEZ — `FAILED` döner.
 * Gerçek teslimat için bu dispatcher, SMTP/provider entegrasyonlu bir implementasyonla
 * değiştirilir (kontrat sabit) — o zaman e-posta ucu ve UI aksiyonu otomatik devreye girer.
 */
export function createLogPaymentNotificationDispatcher(
  logger: { warn: (msg: string) => void },
): PaymentNotificationDispatcher {
  return {
    isConfigured: false,
    async sendPaymentLinkEmail(input) {
      // Guard normalde bu çağrıyı engeller; savunma amaçlı sahte başarı VERMEZ.
      logger.warn(
        `payment-link email requested but no delivery configured order=${input.orderNumber}`,
      );
      return { delivery: "FAILED" };
    },
  };
}
